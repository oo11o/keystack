// An in-page overlay panel: headline, scrollable body, ESC to close.
//
// Same Shadow DOM reasoning as toast.ts — a page's own CSS (`div { … !important }`)
// cannot reach inside, in either direction. One host is created lazily and
// reused for the life of the page.
//
// Unlike the toast, this has a lifecycle: a document-level keydown listener
// lives for as long as the popup is open, so close() is the single place that
// tears everything down and it must be safe to call twice.

import { filterLines, FILTER_MIN } from "../core/filterLines";

function line(className: string, text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  return el;
}

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
    /* A filtered panel is sized once, on open, and never again: the box must
       not twitch as you type. Width is pinned here (content-sized width would
       shrink as long lines are filtered out); height is pinned in JS, from
       the body's measured height, because only layout knows it. */
    .panel.filtered { width: min(760px, 92vw); }
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
    .filter {
      flex: none;
      width: 200px;
      padding: 5px 9px;
      border: 1px solid rgba(255, 255, 255, .18);
      border-radius: 6px;
      background: rgba(255, 255, 255, .06);
      color: inherit;
      font: inherit;
      outline: none;
    }
    .filter:focus { border-color: rgba(255, 255, 255, .45); }
    .filter::placeholder { color: rgba(255, 255, 255, .4); }
    /* The path names where a hit came from — it is not part of the payload,
       so it recedes. The rule between hits recedes further still. */
    .id, .path {
      color: rgba(255, 255, 255, .42);
      margin-top: 18px;
    }
    /* The ids and the path are one header block: the full gap goes above the
       first of them. The ids stack tight together, and the path gets a small
       gap of its own so it reads as a separate fact from the ids above it. */
    .id + .id { margin-top: 0; }
    .id + .path { margin-top: 8px; }
    .id:first-child, .path:first-child { margin-top: 0; }
    /* A drawn rule, not text — 24 dashes is a fixed width regardless of the
       panel, while border-top always spans the body's full width. */
    .sep {
      border-top: 1px solid rgba(255, 255, 255, .18);
      margin-top: 18px;
      height: 0;
    }
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

export type PopupOptions = {
  // Adds a search box to the head that filters the body line by line as you
  // type. A view over `body` only — clearing the box always restores the
  // full text, and nothing the step produced is affected.
  filter?: boolean;
};

// Resolves when the popup is closed — by ESC, by a click on the backdrop, or
// by the × button. Awaiting it is what makes a popup step a checkpoint in a
// stack: the steps after it run once you dismiss it.
export function showPopup(title: string, body: string, opts: PopupOptions = {}): Promise<void> {
  closeCurrent?.();

  const root = getPopupRoot();

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";

  const panel = document.createElement("div");
  panel.className = opts.filter ? "panel filtered" : "panel";
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
  const filterEl = opts.filter ? document.createElement("input") : null;
  if (filterEl) {
    filterEl.className = "filter";
    filterEl.type = "text";
    filterEl.placeholder = `filter (${FILTER_MIN}+ chars)`;
    filterEl.setAttribute("aria-label", "Filter lines");
  }

  head.append(titleEl, ...(filterEl ? [filterEl] : []), closeBtn);

  const bodyEl = document.createElement("div");
  bodyEl.className = "body";
  bodyEl.textContent = body;

  const foot = document.createElement("div");
  foot.className = "foot";
  foot.textContent = "esc to close";

  if (filterEl) {
    // Built as elements rather than one text node so the path can be dimmed
    // apart from the payload it heads.
    const render = () => {
      const { text, groups, shown, total, active } = filterLines(body, filterEl.value);
      bodyEl.textContent = "";
      if (!active) {
        bodyEl.textContent = text;
      } else {
        for (const [i, group] of groups.entries()) {
          if (i > 0) bodyEl.append(line("sep", "")); // drawn by CSS as a full-width rule
          // Starred in the text itself, not with ::before: the marker is
          // part of what the header says, and it survives being copied.
          for (const id of group.ids) bodyEl.append(line("id", `* ${id}`));
          if (group.path) bodyEl.append(line("path", `* ${group.path}`));
          bodyEl.append(line("hit", group.body));
        }
      }
      // The count only earns its place once filtering is on; below the
      // threshold it would just restate the body's own length.
      foot.textContent = active ? `${shown} of ${total} lines · esc to close` : "esc to close";
    };
    filterEl.addEventListener("input", render);
  }

  panel.append(head, bodyEl, foot);
  backdrop.appendChild(panel);
  root.appendChild(backdrop);

  // Measured after the panel is in the document, so this is the height the
  // full body actually settled at (already clamped by the panel's 80vh).
  // Freezing it here is what stops the box from resizing on every keystroke.
  // Guarded: a zero measurement means no layout (jsdom), and pinning 0 would
  // collapse the body.
  if (filterEl) {
    const settled = bodyEl.getBoundingClientRect().height;
    if (settled > 0) {
      bodyEl.style.height = `${settled}px`;
      bodyEl.style.flex = "none";
    }
  }

  const previouslyFocused = document.activeElement as HTMLElement | null;
  // With a filter, typing is the point — focus the box, not the panel. The
  // cost is that ↑/↓ no longer scroll the body while it has focus.
  (filterEl ?? panel).focus();

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
