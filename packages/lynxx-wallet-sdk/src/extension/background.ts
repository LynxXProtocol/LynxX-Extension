import {
  LY_NXX_ERROR_CODES,
  LynxxRpcError,
  userRejectedError,
} from "./errors";
import {
  LYNXX_CHANNEL,
  type LynxxAck,
  type LynxxPopupDecision,
  type LynxxPopupFetch,
  type LynxxResponse,
  type LynxxRpcRequest,
  type LynxxSigningMethod,
  type PopupRequestView,
  createRequestId,
  isLynxxMessage,
  isLynxxPopupDecision,
  isLynxxPopupFetch,
  isLynxxRpcRequest,
} from "./messages";
import { OriginPolicy, type SenderLike } from "./origin-policy";
import { ProviderQueue, type QueueTask } from "./provider-queue";
import {
  createChromeRuntimeAdapter,
  type RuntimeAdapter,
  type Unsubscribe,
} from "./runtime-adapter";

export interface BackgroundConfig {
  /** URL of the confirmation popup page, e.g. `popup/sign.html`. */
  popupUrl: string;
  /** Optional strict origin allowlist (see {@link OriginPolicy}). */
  allowedOrigins?: readonly string[];
  /** Keep confirmation popups open sequentially. Default `true`. */
  queueRequests?: boolean;
  /** Adapter override for tests / Firefox-style runtimes. */
  adapter?: RuntimeAdapter;
}

/**
 * Background service worker for the LynxX extension.
 *
 * Responsibilities:
 * - Origin isolation: every signing request is validated against
 *   `sender.origin` / `sender.frameId` before it may enter the queue.
 * - FIFO sequencing: signing requests are drained one at a time via
 *   {@link ProviderQueue}; at most one confirmation popup is ever open.
 * - Popup dismissal handling: closing the popup window rejects the active
 *   request with `USER_REJECTED` and advances the queue to the next request.
 * - Clean lifecycle: `dispose()` unregisters every listener and rejects all
 *   in-flight requests, so a long-lived worker leaks nothing.
 */
export class LynxxBackground {
  private readonly adapter: RuntimeAdapter;
  private readonly policy: OriginPolicy;
  private readonly queue = new ProviderQueue<string>();
  private readonly popupUrl: string;
  private readonly queueRequests: boolean;
  private readonly extensionId: string | null;

  private pendingRequests = new Map<string, PopupRequestView>();
  private popupWindowId: number | null = null;
  private unsubscribers: Unsubscribe[] = [];

  constructor(config: BackgroundConfig) {
    this.adapter = config.adapter ?? createChromeRuntimeAdapter();
    this.policy = new OriginPolicy({ allowedOrigins: config.allowedOrigins });
    this.extensionId = this.adapter.getExtensionId();
    this.popupUrl = config.popupUrl;
    this.queueRequests = config.queueRequests ?? true;
  }

  /**
   * Registers all runtime listeners and returns `this` for chaining.
   * Safe to call once; repeated calls are no-ops.
   */
  start(): this {
    if (this.unsubscribers.length > 0) {
      return this;
    }

    this.unsubscribers.push(
      this.adapter.onMessage((message, sender, sendResponse) =>
        this.handleMessage(message, sender, sendResponse),
      ),
      this.adapter.onPopupClose((windowId) => this.handlePopupClose(windowId)),
    );

    return this;
  }

  /** Removes every listener and rejects all in-flight requests. */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    this.pendingRequests.clear();
    this.popupWindowId = null;
    this.queue.dispose(userRejectedError());
  }

  /**
   * Handles a single runtime message. Returns `true` when the channel stays
   * open for an asynchronous `sendResponse`; returns `undefined` when the
   * message was not ours.
   */
  private handleMessage(
    message: unknown,
    sender: SenderLike,
    sendResponse: (response: unknown) => void,
  ): true | undefined {
    if (!isLynxxMessage(message)) {
      return undefined;
    }

    try {
      if (isLynxxRpcRequest(message)) {
        this.handleRpcRequest(message, sender, sendResponse);
      } else if (isLynxxPopupFetch(message)) {
        this.handlePopupFetch(message, sender, sendResponse);
      } else if (isLynxxPopupDecision(message)) {
        this.handlePopupDecision(message, sender, sendResponse);
      }
    } catch (error) {
      this.respond(sendResponse, {
        channel: LYNXX_CHANNEL.RPC_RESPONSE,
        id: message.id,
        ok: false,
        error: this.serializeError(error),
      });
    }

    return true;
  }

  private handleRpcRequest(
    message: LynxxRpcRequest,
    sender: SenderLike,
    sendResponse: (response: unknown) => void,
  ): void {
    if (!isSigningMethod(message.method)) {
      this.respond(
        sendResponse,
        this.errorResponse(message.id, {
          code: LY_NXX_ERROR_CODES.INVALID_REQUEST,
          message: `unsupported signing method: ${String(message.method)}`,
        }),
      );
      return;
    }

    let verified;
    try {
      verified = this.policy.verifyRequestSender(sender);
    } catch (error) {
      this.respond(
        sendResponse,
        this.errorResponse(message.id, this.serializeError(error)),
      );
      return;
    }

    // Queue and popup state are keyed by an internal id so identical request
    // ids from different tabs (each tab numbers its own ids from 1) can never
    // collide in the pending-request map or settle the wrong request. The
    // original message.id is still echoed back so the caller's channel
    // correlation keeps working.
    const internalId = createRequestId();

    const view: PopupRequestView = {
      id: internalId,
      method: message.method,
      params: message.params,
      origin: verified.origin,
    };

    if (!this.queueRequests) {
      this.respond(sendResponse, {
        channel: LYNXX_CHANNEL.RPC_RESPONSE,
        id: message.id,
        ok: false,
        error: {
          code: LY_NXX_ERROR_CODES.INVALID_REQUEST,
          message: "signing queue is disabled",
        },
      });
      return;
    }

    const settledPromise = this.queue.enqueue(async (task) => {
      await this.presentPopup(task, view);
    }, internalId);

    void settledPromise.then(
      (result) => {
        this.pendingRequests.delete(internalId);
        this.respond(sendResponse, this.successResponse(message.id, result));
      },
      (error) => {
        this.pendingRequests.delete(internalId);
        this.respond(
          sendResponse,
          this.errorResponse(message.id, this.serializeError(error)),
        );
      },
    );
  }

  private handlePopupFetch(
    message: LynxxPopupFetch,
    sender: SenderLike,
    sendResponse: (response: unknown) => void,
  ): void {
    try {
      this.policy.verifyExtensionSender(sender, this.extensionId);
    } catch (error) {
      this.respond(sendResponse, {
        channel: LYNXX_CHANNEL.RPC_RESPONSE,
        id: message.id,
        ok: false,
        error: this.serializeError(error),
      });
      return;
    }

    const view = this.pendingRequests.get(message.id);
    this.respond(
      sendResponse,
      view
        ? { channel: LYNXX_CHANNEL.RPC_RESPONSE, id: message.id, ok: true, result: view }
        : this.errorResponse(message.id, {
            code: LY_NXX_ERROR_CODES.INVALID_REQUEST,
            message: "unknown or already-settled request id",
          }),
    );
  }

  private handlePopupDecision(
    message: LynxxPopupDecision,
    sender: SenderLike,
    sendResponse: (response: unknown) => void,
  ): void {
    try {
      this.policy.verifyExtensionSender(sender, this.extensionId);
    } catch (error) {
      this.respond(
        sendResponse,
        this.errorResponse(message.id, this.serializeError(error)),
      );
      return;
    }

    if (message.approved) {
      if (typeof message.signedXdr !== "string" || message.signedXdr.length === 0) {
        this.queue.rejectActive(
          new LynxxRpcError(
            LY_NXX_ERROR_CODES.INTERNAL_ERROR,
            "Popup approved without a signed transaction",
          ),
          message.id,
        );
      } else {
        this.queue.resolveActive(message.signedXdr, message.id);
      }
    } else {
      this.queue.rejectActive(userRejectedError(), message.id);
    }

    const ack: LynxxAck = { channel: LYNXX_CHANNEL.ACK, id: message.id };
    this.respond(sendResponse, ack);
  }

  private async presentPopup(
    task: QueueTask<string>,
    view: PopupRequestView,
  ): Promise<void> {
    this.pendingRequests.set(view.id, view);

    try {
      const opened = await this.adapter.createPopup(
        `${this.popupUrl}${this.popupUrl.includes("?") ? "&" : "?"}requestId=${encodeURIComponent(view.id)}`,
      );
      this.popupWindowId = opened.windowId;
    } catch (error) {
      this.pendingRequests.delete(view.id);
      throw new LynxxRpcError(
        LY_NXX_ERROR_CODES.POPUP_OPEN_FAILED,
        "Could not open the confirmation popup",
        error,
      );
    }
  }

  private handlePopupClose(windowId: number): void {
    if (this.popupWindowId !== windowId) {
      return;
    }
    this.popupWindowId = null;
    // If the active request was already settled (approved/rejected), this is
    // a no-op and the queue has already advanced.
    this.queue.rejectActive(userRejectedError());
  }

  private respond(sendResponse: (response: unknown) => void, response: unknown): void {
    sendResponse(response);
  }

  private successResponse(id: string, result: unknown): LynxxResponse {
    return { channel: LYNXX_CHANNEL.RPC_RESPONSE, id, ok: true, result };
  }

  private errorResponse(
    id: string,
    error: { code: (typeof LY_NXX_ERROR_CODES)[keyof typeof LY_NXX_ERROR_CODES]; message: string },
  ): LynxxResponse {
    return {
      channel: LYNXX_CHANNEL.RPC_RESPONSE,
      id,
      ok: false,
      error,
    };
  }

  private serializeError(error: unknown): {
    code: (typeof LY_NXX_ERROR_CODES)[keyof typeof LY_NXX_ERROR_CODES];
    message: string;
  } {
    if (error instanceof LynxxRpcError) {
      return error.toPayload();
    }
    if (error instanceof Error) {
      return {
        code: LY_NXX_ERROR_CODES.INTERNAL_ERROR,
        message: error.message,
      };
    }
    return {
      code: LY_NXX_ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected error while processing the request",
    };
  }
}

/** Helper for the signing methods the queue accepts. */
export function isSigningMethod(value: unknown): value is LynxxSigningMethod {
  return value === "signTransaction" || value === "signAuthEntry";
}
