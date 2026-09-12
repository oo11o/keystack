import type { Step } from "../core/schema";
import type { RunContext } from "../core/context";
import { resolve } from "../core/context";

// `value` present = this step is a producer and feeds $value/$saveAs.
// `note` is what the toast reports; a pure side-effect step sets only this.
type StepResult = { value?: string; note?: string };
type Handler = (step: Step, ctx: RunContext) => Promise<StepResult>;

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

function readText(selector: string): string {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`No element for "${selector}"`);
  const text = (el as HTMLInputElement).value ?? el.textContent?.trim() ?? "";
  if (!text) throw new Error(`Element "${selector}" is empty`);
  return text;
}

// Assigning el.value directly does not notify React — it overrides the
// native setter, so React's state never learns the value changed and
// reverts it on the next render. Use the prototype's native setter instead.
function writeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export const handlers: Record<Step["type"], Handler> = {
  async copyBySelector(step) {
    if (step.type !== "copyBySelector") throw new Error("wrong handler");
    const text = readText(step.selector);
    await copyToClipboard(text);
    return { note: `copied "${text}"` };
  },

  async readBySelector(step) {
    if (step.type !== "readBySelector") throw new Error("wrong handler");
    const text = readText(step.selector);
    return { value: text, note: `read "${text}"` };
  },

  async inputToSelector(step, ctx) {
    if (step.type !== "inputToSelector") throw new Error("wrong handler");
    const el = document.querySelector(step.selector);
    if (!el) throw new Error(`No element for "${step.selector}"`);
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
      throw new Error(`Element "${step.selector}" is not an input or textarea`);
    }
    const value = resolve(step.value, ctx);
    writeValue(el, value);
    return { note: `filled "${step.selector}"` };
  }
};
