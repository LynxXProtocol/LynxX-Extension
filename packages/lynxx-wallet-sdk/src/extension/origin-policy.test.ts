import { describe, expect, it } from "vitest";
import { LY_NXX_ERROR_CODES, LynxxRpcError } from "./errors";
import { OriginPolicy, type SenderLike } from "./origin-policy";

const ORIGIN = "https://app.example.com";

/** Asserts that `fn` throws an ORIGIN_MISMATCH LynxxRpcError. */
function expectOriginMismatch(fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(LynxxRpcError);
    expect((error as LynxxRpcError).code).toBe(LY_NXX_ERROR_CODES.ORIGIN_MISMATCH);
    return;
  }
  throw new Error("expected an ORIGIN_MISMATCH error, but none was thrown");
}

const topFrameSender = (overrides: Partial<SenderLike> = {}): SenderLike => ({
  origin: ORIGIN,
  frameId: 0,
  tab: { id: 1 },
  url: `${ORIGIN}/index.html`,
  ...overrides,
});

describe("OriginPolicy.verifyRequestSender", () => {
  const policy = new OriginPolicy();

  it("accepts a top-frame https sender", () => {
    expect(policy.verifyRequestSender(topFrameSender()).origin).toBe(ORIGIN);
  });

  it("rejects embedded iframes with frameId !== 0", () => {
    expectOriginMismatch(() => policy.verifyRequestSender(topFrameSender({ frameId: 1 })));
    expectOriginMismatch(() => policy.verifyRequestSender(topFrameSender({ frameId: 5 })));
  });

  it("rejects a missing or non-integer frameId", () => {
    const { frameId: _omit, ...rest } = topFrameSender();
    void _omit;
    expectOriginMismatch(() => policy.verifyRequestSender(rest));
  });

  it("rejects opaque (null) origins from sandboxed iframes", () => {
    expectOriginMismatch(() => policy.verifyRequestSender(topFrameSender({ origin: "null" })));
  });

  it("rejects senders with no origin", () => {
    const { origin: _omit, ...rest } = topFrameSender();
    void _omit;
    expectOriginMismatch(() => policy.verifyRequestSender(rest));
  });

  it("rejects non-http(s) origins", () => {
    expectOriginMismatch(() => policy.verifyRequestSender(topFrameSender({ origin: "file:///etc/passwd" })));
    expectOriginMismatch(() => policy.verifyRequestSender(topFrameSender({ origin: "chrome-extension://abc" })));
  });

  it("rejects origins outside the configured allowlist", () => {
    const strict = new OriginPolicy({ allowedOrigins: [ORIGIN] });
    expect(strict.verifyRequestSender(topFrameSender()).origin).toBe(ORIGIN);
    expectOriginMismatch(() =>
      strict.verifyRequestSender(topFrameSender({ origin: "https://evil.example.com" })),
    );
  });

  it("normalizes explicit default ports to their canonical origin", () => {
    expect(policy.verifyRequestSender(topFrameSender({ origin: "https://app.example.com:443" })).origin).toBe(ORIGIN);
    expect(policy.verifyRequestSender(topFrameSender({ origin: "http://app.example.com:80" })).origin).toBe("http://app.example.com");
  });

  it("can disable the top-frame requirement when configured", () => {
    const relaxed = new OriginPolicy({ requireTopFrame: false });
    expect(relaxed.verifyRequestSender(topFrameSender({ frameId: 3 })).origin).toBe(ORIGIN);
  });
});

describe("OriginPolicy.verifyExtensionSender", () => {
  const EXT_ID = "test-extension-id";
  const policy = new OriginPolicy();

  it("accepts our own windowed popup sender (tab present, extension url)", () => {
    const popup: SenderLike = {
      id: EXT_ID,
      url: `chrome-extension://${EXT_ID}/popup/sign.html`,
      origin: `chrome-extension://${EXT_ID}`,
      tab: { id: 101 },
      frameId: 0,
    };
    expect(() => policy.verifyExtensionSender(popup, EXT_ID)).not.toThrow();
  });

  it("rejects a content-script sender reporting a web page url", () => {
    const contentScript: SenderLike = {
      id: EXT_ID,
      url: `${ORIGIN}/index.html`,
      origin: ORIGIN,
      tab: { id: 1 },
      frameId: 0,
    };
    expectOriginMismatch(() => policy.verifyExtensionSender(contentScript, EXT_ID));
  });

  it("rejects senders from a different extension", () => {
    const other: SenderLike = {
      id: "other-extension",
      url: "chrome-extension://other-extension/evil.html",
    };
    expectOriginMismatch(() => policy.verifyExtensionSender(other, EXT_ID));
  });

  it("rejects extension senders with no id", () => {
    expectOriginMismatch(() =>
      policy.verifyExtensionSender({ url: `chrome-extension://${EXT_ID}/popup.html` }, EXT_ID),
    );
  });

  it("rejects web origins when the extension id is unknown", () => {
    expectOriginMismatch(() =>
      policy.verifyExtensionSender({ origin: "https://evil.example.com" }),
    );
  });

  it("rejects web urls when the extension id is unknown", () => {
    expectOriginMismatch(() =>
      policy.verifyExtensionSender({ url: "https://evil.example.com/hook.js" }),
    );
  });

  it("accepts an extension sender when the extension id is unknown and no web url/origin is present", () => {
    expect(() => policy.verifyExtensionSender({ id: EXT_ID })).not.toThrow();
  });
});
