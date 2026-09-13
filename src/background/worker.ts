// The service worker: the one context in the extension that can fetch a
// cross-origin URL without the page's own CORS restrictions applying, given
// host_permissions for that origin (see manifest.json). A content script's
// own fetch() is still subject to the page's CORS/CSP.
import { FETCH_MESSAGE_TYPE, type FetchRequest, type FetchResponse } from "./protocol";

chrome.runtime.onMessage.addListener((message: FetchRequest, _sender, sendResponse) => {
  if (message?.type !== FETCH_MESSAGE_TYPE) return; // not ours — let another listener handle it

  (async (): Promise<FetchResponse> => {
    try {
      const res = await fetch(message.url);
      const body = await res.text();
      return { ok: res.ok, status: res.status, body };
    } catch (err) {
      return { error: (err as Error).message };
    }
  })().then(sendResponse);

  return true; // keep the message channel open for the async sendResponse above
});
