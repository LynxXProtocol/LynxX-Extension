/**
 * Wire protocol shared by the in-page `window.lynxx` provider, the content
 * script bridge, the background service worker, and the confirmation popup.
 *
 * Channels:
 * - `rpc-request`:  content script → background worker. A signing request.
 * - `popup-fetch`:  confirmation popup → background worker. Request details
 *                   for the popup to render.
 * - `popup-decision`: confirmation popup → background worker. User approve /
 *                   reject for the active request.
 * - `rpc-response`:  background worker → caller. Result or error.
 * - `ack`:           background worker → popup. Confirmation a decision was
 *                   recorded.
 *
 * The request body intentionally carries NO origin/frame metadata. The
 * background worker derives `sender.origin` and `sender.frameId` from the
 * browser-provided `MessageSender` object — never from the (untrusted)
 * message payload, which an embedded iframe could forge.
 */

export const LYNXX_CHANNEL = {
  RPC_REQUEST: "lynxx:rpc-request",
  POPUP_FETCH: "lynxx:popup-fetch",
  POPUP_DECISION: "lynxx:popup-decision",
  RPC_RESPONSE: "lynxx:rpc-response",
  ACK: "lynxx:ack",
} as const;

export type LynxxChannel = (typeof LYNXX_CHANNEL)[keyof typeof LYNXX_CHANNEL];

/** Signing methods that flow through the FIFO ProviderQueue. */
export const LYNXX_SIGNING_METHODS = ["signTransaction", "signAuthEntry"] as const;

export type LynxxSigningMethod = (typeof LYNXX_SIGNING_METHODS)[number];

export interface SignTransactionParams {
  readonly xdr: string;
}

export interface SignAuthEntryParams {
  readonly authEntry: string;
}

export type LynxxSigningParams = SignTransactionParams | SignAuthEntryParams;

export interface LynxxRpcRequest<P = LynxxSigningParams> {
  readonly channel: typeof LYNXX_CHANNEL.RPC_REQUEST;
  readonly id: string;
  readonly method: LynxxSigningMethod;
  readonly params: P;
}

/** Popup asks the worker for the request it was opened for. */
export interface LynxxPopupFetch {
  readonly channel: typeof LYNXX_CHANNEL.POPUP_FETCH;
  readonly id: string;
}

/** Popup tells the worker the user approved or rejected. */
export interface LynxxPopupDecision {
  readonly channel: typeof LYNXX_CHANNEL.POPUP_DECISION;
  readonly id: string;
  readonly approved: boolean;
  readonly signedXdr?: string;
}

export interface LynxxSuccessResponse<Result = unknown> {
  readonly channel: typeof LYNXX_CHANNEL.RPC_RESPONSE;
  readonly id: string;
  readonly ok: true;
  readonly result: Result;
}

export interface LynxxErrorResponse {
  readonly channel: typeof LYNXX_CHANNEL.RPC_RESPONSE;
  readonly id: string;
  readonly ok: false;
  readonly error: {
    readonly code: import("./errors").LynxxErrorCode;
    readonly message: string;
  };
}

export type LynxxResponse<Result = unknown> =
  | LynxxSuccessResponse<Result>
  | LynxxErrorResponse;

export interface LynxxAck {
  readonly channel: typeof LYNXX_CHANNEL.ACK;
  readonly id: string;
}

export type LynxxOutboundMessage =
  | LynxxRpcRequest
  | LynxxPopupFetch
  | LynxxPopupDecision;

export type LynxxInboundMessage = LynxxResponse | LynxxAck;

/** Request details served back to the confirmation popup for rendering. */
export interface PopupRequestView {
  readonly id: string;
  readonly method: LynxxSigningMethod;
  readonly params: LynxxSigningParams;
  readonly origin: string;
}

export function isLynxxRpcRequest(
  message: unknown,
): message is LynxxRpcRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as LynxxRpcRequest).channel === LYNXX_CHANNEL.RPC_REQUEST
  );
}

export function isLynxxPopupFetch(message: unknown): message is LynxxPopupFetch {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as LynxxPopupFetch).channel === LYNXX_CHANNEL.POPUP_FETCH
  );
}

export function isLynxxPopupDecision(
  message: unknown,
): message is LynxxPopupDecision {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as LynxxPopupDecision).channel === LYNXX_CHANNEL.POPUP_DECISION
  );
}

export function isLynxxMessage(message: unknown): message is LynxxOutboundMessage {
  return isLynxxRpcRequest(message) || isLynxxPopupFetch(message) || isLynxxPopupDecision(message);
}

/** Monotonic request id generator (also used for nonce ordering assertions). */
export function createRequestId(): string {
  return `lnx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}