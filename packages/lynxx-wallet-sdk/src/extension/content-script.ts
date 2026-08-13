import {
  LYNXX_CHANNEL,
  type LynxxResponse,
  type LynxxRpcRequest,
} from "./messages";
import {
  PAGE_REQUEST_CHANNEL,
  PAGE_RESPONSE_CHANNEL,
  type LynxxProvider,
} from "./provider-bridge";

/**
 * In-page provider injected by the content script. Runs in the page's world
 * and talks to the content script over `window.postMessage`; it never touches
 * `chrome.*` APIs directly.
 */
const PAGE_PROVIDER_SOURCE = `(() => {
  if (window.lynxx) { return; }
  var REQ = ${JSON.stringify(PAGE_REQUEST_CHANNEL)};
  var RES = ${JSON.stringify(PAGE_RESPONSE_CHANNEL)};
  var seq = 0;
  var pending = new Map();
  window.addEventListener("message", function (event) {
    if (event.source !== window) { return; }
    var data = event.data;
    if (!data || data.channel !== RES || typeof data.id !== "string") { return; }
    var entry = pending.get(data.id);
    if (!entry) { return; }
    pending.delete(data.id);
    var res = data.response;
    if (res && res.ok === true) {
      entry.resolve(res.result);
    } else {
      var error = new Error((res && res.error && res.error.message) || "LynxX request failed");
      error.code = (res && res.error && res.error.code) || "INTERNAL_ERROR";
      entry.reject(error);
    }
  });
  function call(method, params) {
    var id = "lnx_" + (++seq).toString(36);
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
      window.postMessage({ channel: REQ, id: id, method: method, params: params }, "*");
    });
  }
  window.lynxx = {
    isLynxX: true,
    signTransaction: function (xdr) { return call("signTransaction", { xdr: xdr }); },
    signAuthEntry: function (authEntry) { return call("signAuthEntry", { authEntry: authEntry }); }
  };
})();`;

function injectPageProvider(): void {
  const element = document.createElement("script");
  element.textContent = PAGE_PROVIDER_SOURCE;
  element.setAttribute("data-lynxx-provider", "true");
  (document.head || document.documentElement).appendChild(element);
  element.remove();
}

function relayPageRequest(event: MessageEvent): void {
  const data = event.data as { channel?: string } | undefined;
  if (event.source !== window || data?.channel !== PAGE_REQUEST_CHANNEL) {
    return;
  }

  const pageMessage = event.data as {
    channel: string;
    id: string;
    method: string;
    params: unknown;
  };

  const request: LynxxRpcRequest = {
    channel: LYNXX_CHANNEL.RPC_REQUEST,
    id: pageMessage.id,
    method: pageMessage.method as LynxxRpcRequest["method"],
    params: pageMessage.params as LynxxRpcRequest["params"],
  };

  const responseChannel = (response: LynxxResponse) => {
    window.postMessage(
      { channel: PAGE_RESPONSE_CHANNEL, id: pageMessage.id, response },
      "*",
    );
  };

  try {
    void chrome.runtime.sendMessage(request, responseChannel);
  } catch (error) {
    responseChannel({
      channel: LYNXX_CHANNEL.RPC_RESPONSE,
      id: pageMessage.id,
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Bridge failed",
      },
    });
  }
}

/**
 * LynxX content script. Activates only in the top frame (embedded iframes can
 * never reach the background worker — a second, redundant layer behind the
 * background's own frameId check). Injects `window.lynxx` into the page and
 * relays signing requests to the background service worker.
 */
export function installLynxxContentScript(): void {
  if (window.self !== window.top) {
    return;
  }

  injectPageProvider();
  window.addEventListener("message", relayPageRequest);
}

/** Reference for SDK consumers that want the provider type in their bundle. */
export type { LynxxProvider };

installLynxxContentScript();