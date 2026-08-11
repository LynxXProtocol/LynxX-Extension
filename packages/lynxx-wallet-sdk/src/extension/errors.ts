/**
 * Machine-readable error codes surfaced by the LynxX provider bridge and
 * background service worker. Each code maps to a stable, documented outcome
 * so dApps and UI layers can react without string-matching on messages.
 */
export const LY_NXX_ERROR_CODES = {
  /** User dismissed the signing popup (window closed) without deciding. */
  USER_REJECTED: "USER_REJECTED",
  /** Sender origin or frame is not trusted (iframe, opaque origin, or
   * origin outside the configured allowlist). */
  ORIGIN_MISMATCH: "ORIGIN_MISMATCH",
  /** A wallet must be connected before a signing method is called. */
  NOT_CONNECTED: "NOT_CONNECTED",
  /** The extension could not open its confirmation popup. */
  POPUP_OPEN_FAILED: "POPUP_OPEN_FAILED",
  /** Message failed structural validation (unknown channel/method). */
  INVALID_REQUEST: "INVALID_REQUEST",
  /** Unexpected internal failure while processing the request. */
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type LynxxErrorCode = (typeof LY_NXX_ERROR_CODES)[keyof typeof LY_NXX_ERROR_CODES];

/** Serializable error payload exchanged over runtime messaging. */
export interface LynxxErrorPayload {
  readonly code: LynxxErrorCode;
  readonly message: string;
}

/**
 * Error thrown by the provider bridge and background service worker when an
 * RPC call fails. Carries a stable `code` plus an optional nested `cause`.
 */
export class LynxxRpcError extends Error {
  readonly code: LynxxErrorCode;
  readonly cause?: unknown;

  constructor(code: LynxxErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "LynxxRpcError";
    this.code = code;
    this.cause = cause;
  }

  toPayload(): LynxxErrorPayload {
    return { code: this.code, message: this.message };
  }
}

/** Builds a USER_REJECTED error (popup closed before a decision). */
export function userRejectedError(): LynxxRpcError {
  return new LynxxRpcError(
    LY_NXX_ERROR_CODES.USER_REJECTED,
    "User dismissed the signing request.",
  );
}

/** Builds an ORIGIN_MISMATCH security exception. */
export function originMismatchError(reason: string): LynxxRpcError {
  return new LynxxRpcError(
    LY_NXX_ERROR_CODES.ORIGIN_MISMATCH,
    `Signing request rejected: ${reason}`,
  );
}
