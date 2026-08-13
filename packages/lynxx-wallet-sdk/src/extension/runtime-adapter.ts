import type { SenderLike } from "./origin-policy";

/** Function returned when subscribing to a runtime event; call to unsubscribe. */
export type Unsubscribe = () => void;

/** Callback invoked for every runtime message reaching the worker. */
export type RuntimeMessageListener = (
  message: unknown,
  sender: SenderLike,
  sendResponse: (response: unknown) => void,
) => boolean | void;

export interface OpenedPopup {
  readonly windowId: number;
  readonly tabId?: number;
}

/**
 * Browser surface the background worker needs. Abstracted so tests can run
 * with an in-memory double and real builds can target Chrome (Chromium
 * `chrome.*`) without browser-specific types leaking into the SDK.
 */
export interface RuntimeAdapter {
  /** Route for page/extension → worker messages. */
  onMessage(listener: RuntimeMessageListener): Unsubscribe;

  /** Fired when any browser window is destroyed (used to detect popup close). */
  onPopupClose(listener: (windowId: number) => void): Unsubscribe;

  /** Opens the confirmation popup window. */
  createPopup(url: string): Promise<OpenedPopup>;

  /** Closes a popup window by id. */
  closePopup(windowId: number): Promise<void>;

  /** Returns the extension id for extension-context senders. */
  getExtensionId(): string | null;
}

/**
 * Chrome (Manifest V3) adapter. Uses the global `chrome` namespace which is
 * injected by the browser into every extension context; safe to reference
 * only after this adapter is constructed inside a worker/content script.
 */
export function createChromeRuntimeAdapter(): RuntimeAdapter {
  const runtime = globalThis.chrome?.runtime;
  const windows = globalThis.chrome?.windows;

  if (!runtime || !windows) {
    throw new Error(
      "chrome.runtime / chrome.windows are unavailable. The LynxX extension must run inside a Chrome (Manifest V3) extension context.",
    );
  }

  return {
    onMessage(listener) {
      const handler = (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ): true | undefined => {
        const keepChannelOpen = listener(message, sender as SenderLike, sendResponse);
        // Listener returns true while it manages the response asynchronously.
        return keepChannelOpen === true ? true : undefined;
      };
      runtime.onMessage.addListener(handler);
      return () => runtime.onMessage.removeListener(handler);
    },

    onPopupClose(listener) {
      const handler = (windowId: number) => listener(windowId);
      windows.onRemoved.addListener(handler);
      return () => windows.onRemoved.removeListener(handler);
    },

    async createPopup(url) {
      const created = await windows.create({ url, type: "popup", focused: true });
      if (typeof created?.id !== "number") {
        throw new Error("Failed to open confirmation popup: no window id returned");
      }
      return { windowId: created.id, tabId: created.tabs?.[0]?.id };
    },

    async closePopup(windowId) {
      await windows.remove(windowId);
    },

    getExtensionId() {
      return runtime.id ?? null;
    },
  };
}