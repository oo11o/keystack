// An in-page overlay panel: headline, scrollable body, ESC to close.
//
// Same Shadow DOM reasoning as toast.ts — a page's own CSS (`div { … !important }`)
// cannot reach inside, in either direction. One host is created lazily and
// reused for the life of the page.
//
// Unlike the toast, this has a lifecycle: a document-level keydown listener
// lives for as long as the popup is open, so close() is the single place that
// tears everything down and it must be safe to call twice.

let popupHost: HTMLElement | null = null;
let popupRoot: ShadowRoot | null = null;

// Only one popup exists at a time; opening a second closes the first (and
// resolves its promise), the same "latest wins" rule the toast follows.
let closeCurrent: (() => void) | null = null;

function getPopupRoot(): ShadowRoot {
  if (popupRoot) return popupRoot;
  popupHost = document.createElement("div");
  popupHost.id = "keystack-popup-host";
  document.documentElement.appendChild(popupHost);

  popupRoot = popupHost.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(0, 0, 0, .45);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .panel {
      display: flex;
      flex-direction: column;
      min-width: min(480px, 92vw); /* a three-line cheatsheet shouldn't be a tiny box */
      max-width: min(760px, 92vw);
      max-height: 80vh;
      background: #1f2328;
      color: #fff;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, .45);
      font: 13px/1.5 -apple-system, system-ui, sans-serif;
      outline: none;
    }
    .head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, .12);
    }
    .title {
      flex: 1;
      font-size: 17px;
      font-weight: 700;
      word-break: break-word;
    }
    .close {
      flex: none;
      cursor: pointer;
      border: 0;
      background: transparent;
      color: inherit;
      opacity: .7;
      font-size: 20px;
      line-height: 1;
      padding: 2px 6px;
    }
    .close:hover { opacity: 1; }
    .body {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 16px 20px;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13.5px;
      line-height: 1.6;
    }
    .foot {
      flex: none;
      padding: 10px 20px;
      border-top: 1px solid rgba(255, 255, 255, .12);
      font-size: 11px;
      opacity: .6;
      text-align: center;
    }
  `;
  popupRoot.appendChild(style);
  return popupRoot;
}

// Resolves when the popup is closed — by ESC, by a click on the backdrop, or
// by the × button. Awaiting it is what makes a popup step a checkpoint in a
// stack: the steps after it run once you dismiss it.
export function showPopup(title: string, body: string): Promise<void> {
  closeCurrent?.();

  const root = getPopupRoot();

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.tabIndex = -1; // focusable, so ↑/↓/PgDn scroll the body

  const head = document.createElement("div");
  head.className = "head";
  const titleEl = document.createElement("span");
  titleEl.className = "title";
  titleEl.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close");
  head.append(titleEl, closeBtn);

  const bodyEl = document.createElement("div");
  bodyEl.className = "body";
  bodyEl.textContent = body;

  const foot = document.createElement("div");
  foot.className = "foot";
  foot.textContent = "esc to close";

  panel.append(head, bodyEl, foot);
  backdrop.appendChild(panel);
  root.appendChild(backdrop);

  const previouslyFocused = document.activeElement as HTMLElement | null;
  panel.focus();

  return new Promise<void>((resolve) => {
    let closed = false;

    // Capture phase + stopPropagation, so a page with its own ESC handler
    // (any modal-heavy app) does not also react to the key that closed us.
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };

    const close = () => {
      if (closed) return; // ESC, backdrop and × all land here; only the first wins
      closed = true;
      document.removeEventListener("keydown", onKeydown, true);
      backdrop.remove();
      if (closeCurrent === close) closeCurrent = null;
      previouslyFocused?.focus?.();
      resolve();
    };

    document.addEventListener("keydown", onKeydown, true);
    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(); // clicks inside the panel keep it open
    });

    closeCurrent = close;
  });
}
