import { originMismatchError, type LynxxRpcError } from "./errors";

/**
 * Minimal structural view of the browser-provided `MessageSender`. Only the
 * fields needed for origin isolation are used.
 */
export interface SenderLike {
  /** Scheme, host and port of the page/frame that sent the message. */
  origin?: string;
  /** 0 for the top frame; >0 for sub-frames. */
  frameId?: number;
  /** Present when the message came from a tab (web page), absent otherwise. */
  tab?: { id?: number } | null;
  /** Full URL of the sending frame / extension page. */
  url?: string;
  /** Extension id for extension-context senders (popup, options, ...). */
  id?: string;
}

/** A sender that passed origin isolation, with its canonical origin. */
export interface VerifiedOrigin {
  readonly origin: string;
}

export interface OriginPolicyOptions {
  /**
   * Optional strict allowlist of origins permitted to request signatures.
   * When provided and non-empty, every request must come from one of these
   * exact origins (`https://app.example.com`). Kills clickjacking / phishing
   * pages hosted on an attacker's own domain.
   */
  allowedOrigins?: readonly string[];
  /** Require the sender to be the top frame (`frameId === 0`). Default `true`. */
  requireTopFrame?: boolean;
}

/**
 * Enforces strict CORS-style origin isolation on every background message.
 *
 * Origin and frame id come from the browser-provided `MessageSender`, which
 * the page cannot forge. Cross-origin nested iframes cannot claim a top-frame
 * origin, and an opaque (`"null"`) origin is rejected outright.
 */
export class OriginPolicy {
  private readonly allowedOrigins?: ReadonlySet<string>;
  private readonly requireTopFrame: boolean;

  constructor(options: OriginPolicyOptions = {}) {
    this.allowedOrigins = options.allowedOrigins?.length
      ? new Set(options.allowedOrigins)
      : undefined;
    this.requireTopFrame = options.requireTopFrame ?? true;
  }

  /**
   * Validates a signing-request sender. Returns the canonical origin on
   * success, or throws an `ORIGIN_MISMATCH` {@link LynxxRpcError}.
   */
  verifyRequestSender(sender: SenderLike): VerifiedOrigin {
    const origin = this.rejectableWebSender(sender);
    return { origin };
  }

  /**
   * Validates a sender that must originate from the extension itself (the
   * confirmation popup). When `extensionId` is known, the sender must carry
   * the exact extension id and an extension-page (`chrome-extension://`)
   * URL. A windowed popup still reports a `tab`, so sender presence of a tab
   * alone is NOT treated as a web sender — the extension URL is the source of
   * truth. When the id is unknown (test doubles), the sender must not present
   * a web origin or web URL.
   */
  verifyExtensionSender(sender: SenderLike, extensionId?: string | null): void {
    if (typeof extensionId === "string" && extensionId.length > 0) {
      if (typeof sender.id !== "string" || sender.id !== extensionId) {
        throw originMismatchError("sender is not the LynxX extension");
      }
      if (
        typeof sender.url === "string" &&
        !sender.url.startsWith(`chrome-extension://${extensionId}`)
      ) {
        throw originMismatchError("sender URL is outside the extension");
      }
      return;
    }

    if (typeof sender.origin === "string" && sender.origin !== "null") {
      throw originMismatchError("extension messages must not carry a web origin");
    }
    if (typeof sender.url === "string" && /^https?:/i.test(sender.url)) {
      throw originMismatchError("extension messages must not originate from a web page");
    }
  }

  /**
   * Returns the canonical origin for a web sender, or throws `ORIGIN_MISMATCH`.
   */
  private rejectableWebSender(sender: SenderLike): string {
    if (typeof sender.origin !== "string" || sender.origin.length === 0) {
      throw this.reject("sender is missing an origin");
    }

    if (sender.origin === "null") {
      throw this.reject(
        "sender origin is opaque; nested or sandboxed iframes are not allowed",
      );
    }

    if (this.requireTopFrame) {
      const frameId = sender.frameId;
      if (typeof frameId !== "number" || !Number.isInteger(frameId) || frameId !== 0) {
        throw this.reject(
          `sender frameId ${String(frameId)} is not the top frame; embedded iframes are not allowed`,
        );
      }
    }

    const parsed = this.canonicalHttpOrigin(sender.origin);
    if (parsed === undefined) {
      throw this.reject(`origin "${sender.origin}" is not a valid http(s) origin`);
    }

    if (this.allowedOrigins && !this.allowedOrigins.has(parsed)) {
      throw this.reject(`origin "${parsed}" is not in the allowed origins allowlist`);
    }

    return parsed;
  }

  private reject(reason: string): LynxxRpcError {
    return originMismatchError(reason);
  }

  /**
   * Normalizes an origin to canonical `scheme://host[:port]` form. Returns
   * undefined when the value is not a valid http(s) origin.
   */
  private canonicalHttpOrigin(value: string): string | undefined {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return undefined;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }

    const hasExplicitPort = /:\d+$/.test(url.host);
    const isDefaultPort =
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443");

    if (isDefaultPort && hasExplicitPort) {
      return `${url.protocol}//${url.hostname}`;
    }
    return url.origin;
  }
}