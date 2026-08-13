import {
  LynxxRpcError,
  LY_NXX_ERROR_CODES,
  type LynxxErrorCode,
} from "./errors";
import {
  LYNXX_CHANNEL,
  type LynxxRpcRequest,
  type LynxxResponse,
  type LynxxSigningMethod,
  type LynxxSigningParams,
  createRequestId,
} from "./messages";

/** The `window.lynxx` provider surface exposed to dApps. */
export interface LynxxProvider {
  readonly isLynxX: true;
  /** Requests signatures for a base64 XDR transaction. Resolves with signed XDR. */
  signTransaction(xdr: string): Promise<string>;
  /** Requests authorization entry signing (Soroban). Resolves with signed entry. */
  signAuthEntry(authEntry: string): Promise<string>;
}

/** Global augmentation so dApps can type-check `window.lynxx`. */
declare global {
  interface Window {
    /** The LynxX wallet provider injected by the extension content script. */
    lynxx?: LynxxProvider;
  }
}

export type ProviderSend = (
  message: LynxxRpcRequest,
  callback: (response: LynxxResponse) => void,
) => void;

/** Result of a signing request passed to the injected page provider. */
export interface PageRequest {
  readonly channel: string;
  readonly id: string;
  readonly method: LynxxSigningMethod;
  readonly params: LynxxSigningParams;
}

export interface PageResponse {
  readonly channel: string;
  readonly id: string;
  readonly response: LynxxResponse;
}

export const PAGE_REQUEST_CHANNEL = "lynxx:page-request";
export const PAGE_RESPONSE_CHANNEL = "lynxx:page-response";

/**
 * Content-script side transport adapter. Executes `signTransaction` /
 * `signAuthEntry` against the background worker and maps every outcome to a
 * {@link LynxxRpcError} with a stable code.
 */
export class LynxxProviderBridge implements LynxxProvider {
  readonly isLynxX = true as const;

  constructor(private readonly send: ProviderSend) {}

  signTransaction(xdr: string): Promise<string> {
    return this.call("signTransaction", { xdr });
  }

  signAuthEntry(authEntry: string): Promise<string> {
    return this.call("signAuthEntry", { authEntry });
  }

  private call(
    method: LynxxSigningMethod,
    params: LynxxSigningParams,
  ): Promise<string> {
    const id = createRequestId();
    const request: LynxxRpcRequest = {
      channel: LYNXX_CHANNEL.RPC_REQUEST,
      id,
      method,
      params,
    };

    return new Promise<string>((resolve, reject) => {
      this.send(request, (response) => {
        if (!response || response.channel !== LYNXX_CHANNEL.RPC_RESPONSE) {
          reject(
            new LynxxRpcError(
              LY_NXX_ERROR_CODES.INTERNAL_ERROR,
              "Malformed response from the LynxX background worker",
            ),
          );
          return;
        }
        if (response.ok) {
          resolve(response.result as string);
          return;
        }
        reject(
          new LynxxRpcError(
            response.error.code,
            response.error.message,
          ),
        );
      });
    });
  }
}

/**
 * Creates the in-page `window.lynxx` provider. Communicates with the content
 * script over a `window.postMessage` bridge with request/response id
 * correlation, so pages never talk to the extension background directly.
 */
export function createProvider(
  post: (message: unknown, targetOrigin: string) => void,
  addListener: (cb: (event: MessageEvent) => void) => void,
): LynxxProvider {
  let sequence = 0;
  const pending = new Map<
    string,
    { resolve(value: string): void; reject(error: unknown): void }
  >();

  addListener((event: MessageEvent) => {
    // Only messages posted back into the current window by the content
    // script bridge are honored; a cross-origin iframe can never spoof
    // `event.source === window`.
    if (event.source !== window) {
      return;
    }
    const data = event.data as Partial<PageResponse> | undefined;
    if (!data || data.channel !== PAGE_RESPONSE_CHANNEL || typeof data.id !== "string") {
      return;
    }
    const entry = pending.get(data.id);
    if (!entry) {
      return;
    }
    pending.delete(data.id);
    const response = data.response as LynxxResponse | undefined;
    if (response?.ok) {
      entry.resolve(response.result as string);
    } else {
      const code = (response?.error?.code ?? LY_NXX_ERROR_CODES.INTERNAL_ERROR) as LynxxErrorCode;
      entry.reject(
        new LynxxRpcError(
          code,
          response?.error?.message ?? "LynxX request failed",
        ),
      );
    }
  });

  function call(
    method: LynxxSigningMethod,
    params: LynxxSigningParams,
  ): Promise<string> {
    const id = `lnx_${(++sequence).toString(36)}_${createRequestId().slice(-8)}`;
    const message: PageRequest = {
      channel: PAGE_REQUEST_CHANNEL,
      id,
      method,
      params,
    };
    return new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      post(message, "*");
    });
  }

  return {
    isLynxX: true,
    signTransaction: (xdr: string) => call("signTransaction", { xdr }),
    signAuthEntry: (authEntry: string) => call("signAuthEntry", { authEntry }),
  };
}