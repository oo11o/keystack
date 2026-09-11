import type { Step } from "../core/schema";

type Handler = (step: Extract<Step, { type: string }>) => Promise<string>;

// navigator.clipboard is undefined on non-secure contexts (plain http://
// pages, some iframes) — fall back to the legacy execCommand API there.
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Clipboard copy failed (no secure context and execCommand denied)");
}

export const handlers: Record<Step["type"], Handler> = {
  async copyBySelector(step) {
    if (step.type !== "copyBySelector") throw new Error("wrong handler");
    const el = document.querySelector(step.selector);
    if (!el) throw new Error(`No element for "${step.selector}"`);
    const text = (el as HTMLInputElement).value ?? el.textContent?.trim() ?? "";
    if (!text) throw new Error(`Element "${step.selector}" is empty`);
    await copyToClipboard(text);
    return text;
  }
};
