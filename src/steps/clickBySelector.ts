import type { Handler } from "./types";

// el.click() rather than a synthesised MouseEvent: the native method
// dispatches a real, bubbling click, which is what delegated handlers —
// React's root-level listener among them — are waiting for. Nothing here
// needs the native-setter trick writeValue() has to do for inputs.
//
// Only clicks. If the click leaves the page — a submit button, a link — the
// content script dies with it and any steps after this one are lost, since
// nothing was parked for the next page to claim. Put such a click last.
export const clickBySelector: Handler = async (step) => {
  if (step.type !== "clickBySelector") throw new Error("wrong handler");
  const el = document.querySelector(step.selector);
  if (!el) throw new Error(`No element for "${step.selector}"`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Element "${step.selector}" is not clickable`);
  }
  el.click();
  return { note: `clicked "${step.selector}"` };
};
