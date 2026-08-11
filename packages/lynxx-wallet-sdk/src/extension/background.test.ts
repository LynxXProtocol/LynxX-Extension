import { describe, expect, it, vi } from "vitest";
import { LynxxBackground } from "./background";
import type { SenderLike } from "./origin-policy";
import {
  type OpenedPopup,
  type RuntimeAdapter,
  type RuntimeMessageListener,
  type Unsubscribe,
} from "./runtime-adapter";

const EXT_ID = "test-extension-id";
const TAB_ORIGIN = "https://app.example.com";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Extracts the internal request id the background embeds in the popup URL. */
const requestIdOf = (popupUrl: string): string => popupUrl.split("requestId=")[1];

function rpcRequest(id: string, method = "signTransaction", params: unknown = { xdr: "xdr" }) {
  return { channel: "lynxx:rpc-request", id, method, params };
}

function popupFetch(id: string) {
  return { channel: "lynxx:popup-fetch", id };
}

function popupDecision(id: string, approved: boolean, signedXdr?: string) {
  return { channel: "lynxx:popup-decision", id, approved, signedXdr };
}

/**
 * In-memory RuntimeAdapter double. `sendTab` / `sendFrame` / `sendPopup` route
 * messages to the background listener with browser-shaped MessageSender
 * objects; `closeWindow` fires the popup-close event.
 */
class FakeRuntimeAdapter implements RuntimeAdapter {
  messageListener: RuntimeMessageListener | null = null;
  closeListener: ((windowId: number) => void) | null = null;

  popupUrls: string[] = [];
  openedWindows: number[] = [];
  closeCalls: number[] = [];
  private nextWindowId = 100;

  onMessage(listener: RuntimeMessageListener): Unsubscribe {
    this.messageListener = listener;
    return () => {
      if (this.messageListener === listener) {
        this.messageListener = null;
      }
    };
  }

  onPopupClose(listener: (windowId: number) => void): Unsubscribe {
    this.closeListener = listener;
    return () => {
      if (this.closeListener === listener) {
        this.closeListener = null;
      }
    };
  }

  async createPopup(url: string): Promise<OpenedPopup> {
    this.popupUrls.push(url);
    const windowId = this.nextWindowId++;
    this.openedWindows.push(windowId);
    return { windowId, tabId: windowId };
  }

  async closePopup(windowId: number): Promise<void> {
    this.closeCalls.push(windowId);
  }

  getExtensionId(): string | null {
    return EXT_ID;
  }

  private dispatch(payload: unknown, sender: SenderLike): Promise<unknown> {
    if (!this.messageListener) {
      throw new Error("no message listener registered");
    }
    return new Promise((resolve) => {
      this.messageListener!(payload, sender, (response) => resolve(response));
    });
  }

  /** Sends from the top frame of a web tab (the legitimate dApp page). */
  sendTab(payload: unknown): Promise<unknown> {
    return this.dispatch(payload, {
      origin: TAB_ORIGIN,
      frameId: 0,
      tab: { id: 7 },
      url: `${TAB_ORIGIN}/index.html`,
    });
  }

  /** Sends from an embedded / cross-origin iframe (frameId !== 0). */
  sendFrame(payload: unknown): Promise<unknown> {
    return this.dispatch(payload, {
      origin: "https://evil.example.com",
      frameId: 3,
      tab: { id: 7 },
      url: "https://evil.example.com/frame.html",
    });
  }

  /** Sends from our confirmation popup page. */
  sendPopup(payload: unknown): Promise<unknown> {
    return this.dispatch(payload, {
      id: EXT_ID,
      origin: `chrome-extension://${EXT_ID}`,
      url: `chrome-extension://${EXT_ID}/popup/sign.html`,
      tab: { id: 101 },
      frameId: 0,
    });
  }

  closeWindow(windowId: number): void {
    this.closeListener?.(windowId);
  }
}

const startBackground = (adapter = new FakeRuntimeAdapter()) =>
  new LynxxBackground({ popupUrl: "popup/sign.html", adapter }).start();

describe("LynxxBackground (request queue + origin isolation)", () => {
  it("queues 10 concurrent requests sequentially without modal overlap", async () => {
    const adapter = new FakeRuntimeAdapter();
    const bg = startBackground(adapter);

    const senders = Array.from({ length: 10 }, (_, i) =>
      adapter.sendTab(rpcRequest(`req-${i}`, "signTransaction", { xdr: `xdr-${i}` })),
    );

    // Only the first popup may be open while all ten are queued.
    await vi.waitFor(() => expect(adapter.popupUrls).toHaveLength(1));

    for (let i = 0; i < 10; i++) {
      expect(adapter.popupUrls).toHaveLength(i + 1);
      const internalId = requestIdOf(adapter.popupUrls[i]);
      await adapter.sendPopup(popupDecision(internalId, true, `SIGNED-${i}`));
      await expect(senders[i]).resolves.toMatchObject({
        channel: "lynxx:rpc-response",
        id: `req-${i}`,
        ok: true,
        result: `SIGNED-${i}`,
      });
      if (i < 9) {
        await vi.waitFor(() => expect(adapter.popupUrls).toHaveLength(i + 2));
      }
    }

    expect(adapter.popupUrls).toHaveLength(10);
    expect(adapter.openedWindows).toHaveLength(10);
    bg.dispose();
  });

  it("serves request details to the popup with the verified origin", async () => {
    const adapter = new FakeRuntimeAdapter();
    const bg = startBackground(adapter);

    const sender = adapter.sendTab(rpcRequest("req-0"));
    await vi.waitFor(() => expect(adapter.popupUrls).toHaveLength(1));

    const internalId = requestIdOf(adapter.popupUrls[0]);
    const fetched = await adapter.sendPopup(popupFetch(internalId));
    expect(fetched).toMatchObject({
      ok: true,
      result: {
        id: internalId,
        method: "signTransaction",
        origin: TAB_ORIGIN,
      },
    });

    await adapter.sendPopup(popupDecision(internalId, true, "SIGNED"));
    await expect(sender).resolves.toMatchObject({ ok: true, result: "SIGNED" });
    bg.dispose();
  });

  it("rejects the active request with USER_REJECTED when the popup closes", async () => {
    const adapter = new FakeRuntimeAdapter();
    const bg = startBackground(adapter);

    const first = adapter.sendTab(rpcRequest("req-0"));
    const second = adapter.sendTab(rpcRequest("req-1"));
    await vi.waitFor(() => expect(adapter.popupUrls).toHaveLength(1));

    adapter.closeWindow(adapter.openedWindows[0]);

    await expect(first).resolves.toMatchObject({
      ok: false,
      error: { code: "USER_REJECTED" },
    });
    await vi.waitFor(() => expect(adapter.popupUrls).toHaveLength(2));

    await adapter.sendPopup(popupDecision(requestIdOf(adapter.popupUrls[1]), true, "SIGNED-1"));
    await expect(second).resolves.toMatchObject({ ok: true, result: "SIGNED-1" });
    expect(adapter.popupUrls).toHaveLength(2);
    bg.dispose();
  });

  it("rejects iframe signing requests with ORIGIN_MISMATCH", async () => {
    const adapter = new FakeRuntimeAdapter();
    const bg = startBackground(adapter);

    const response = await adapter.sendFrame(rpcRequest("req-evil"));

    expect(response).toMatchObject({
      ok: false,
      error: { code: "ORIGIN_MISMATCH" },
    });
    expect(adapter.popupUrls).toHaveLength(0);
    bg.dispose();
  });

  it("rejects popup decisions sent from a web content script", async () => {
    const adapter = new FakeRuntimeAdapter();
    const bg = startBackground(adapter);

    const sender = adapter.sendTab(rpcRequest("req-0"));
    await vi.waitFor(() => expect(adapter.popupUrls).toHaveLength(1));

    const spoofed = await adapter.sendFrame(popupDecision("req-0", true, "SIGNED"));

    expect(spoofed).toMatchObject({ ok: false, error: { code: "ORIGIN_MISMATCH" } });
    // The real popup can still decide.
    await adapter.sendPopup(popupDecision(requestIdOf(adapter.popupUrls[0]), false));
    await expect(sender).resolves.toMatchObject({ ok: false, error: { code: "USER_REJECTED" } });
    bg.dispose();
  });

  it("rejects requests with an unsupported signing method", async () => {
    const adapter = new FakeRuntimeAdapter();
    const bg = startBackground(adapter);

    const response = await adapter.sendTab(rpcRequest("req-0", "hackTheWallet"));

    expect(response).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(adapter.popupUrls).toHaveLength(0);
    bg.dispose();
  });

  it("does not corrupt state when two tabs reuse the same request id", async () => {
    const adapter = new FakeRuntimeAdapter();
    const bg = startBackground(adapter);

    // Both tabs number their first request as "lnx_1".
    const tabA = adapter.sendTab(rpcRequest("lnx_1", "signTransaction", { xdr: "A" }));
    const tabB = adapter.sendTab(rpcRequest("lnx_1", "signTransaction", { xdr: "B" }));
    await vi.waitFor(() => expect(adapter.popupUrls).toHaveLength(1));

    // The popup for tab A must render tab A's request, not tab B's.
    const firstInternalId = requestIdOf(adapter.popupUrls[0]);
    const fetchedA = await adapter.sendPopup(popupFetch(firstInternalId));
    expect(fetchedA).toMatchObject({ ok: true, result: { params: { xdr: "A" }, origin: TAB_ORIGIN } });

    await adapter.sendPopup(popupDecision(firstInternalId, true, "SIGNED-A"));
    await expect(tabA).resolves.toMatchObject({ ok: true, result: "SIGNED-A" });

    await vi.waitFor(() => expect(adapter.popupUrls).toHaveLength(2));
    const secondInternalId = requestIdOf(adapter.popupUrls[1]);
    expect(secondInternalId).not.toBe(firstInternalId);

    const fetchedB = await adapter.sendPopup(popupFetch(secondInternalId));
    expect(fetchedB).toMatchObject({ ok: true, result: { params: { xdr: "B" }, origin: TAB_ORIGIN } });

    await adapter.sendPopup(popupDecision(secondInternalId, true, "SIGNED-B"));
    await expect(tabB).resolves.toMatchObject({ ok: true, result: "SIGNED-B" });
    bg.dispose();
  });

  it("rejects in-flight requests and unregisters listeners on dispose", async () => {
    const adapter = new FakeRuntimeAdapter();
    const bg = startBackground(adapter);

    const sender = adapter.sendTab(rpcRequest("req-0"));
    await vi.waitFor(() => expect(adapter.popupUrls).toHaveLength(1));

    bg.dispose();

    await expect(sender).resolves.toMatchObject({
      ok: false,
      error: { code: "USER_REJECTED" },
    });
    expect(adapter.messageListener).toBeNull();
    expect(adapter.closeListener).toBeNull();
    expect(() => adapter.sendTab(rpcRequest("late"))).toThrow("no message listener");
  });

  it(
    "leaks no state after 1,000 sequential signing requests",
    async () => {
      const adapter = new FakeRuntimeAdapter();
      const bg = startBackground(adapter);

      for (let i = 0; i < 1000; i++) {
        const sender = adapter.sendTab(rpcRequest(`req-${i}`));
        await flush();
        expect(adapter.popupUrls).toHaveLength(i + 1);

        const internalId = requestIdOf(adapter.popupUrls[i]);
        await adapter.sendPopup(
          popupDecision(internalId, i % 2 === 0, i % 2 === 0 ? `SIGNED-${i}` : undefined),
        );
        await expect(sender).resolves.toMatchObject({
          ok: i % 2 === 0,
          ...(i % 2 === 0
            ? { result: `SIGNED-${i}` }
            : { error: { code: "USER_REJECTED" } }),
        });
        await flush();
      }

      expect(adapter.popupUrls).toHaveLength(1000);
      expect(
        (bg as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests.size,
      ).toBe(0);
      expect(
        (bg as unknown as { queue: { pendingCount: number; size: number } }).queue.pendingCount,
      ).toBe(0);
      expect((bg as unknown as { queue: { size: number } }).queue.size).toBe(0);
      expect(adapter.messageListener).not.toBeNull();
      bg.dispose();
    },
    30000,
  );
});
