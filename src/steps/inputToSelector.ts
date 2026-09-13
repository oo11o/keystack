import type { Handler } from "./types";
import { resolve } from "../core/context";
import { writeValue } from "../page/dom";

export const inputToSelector: Handler = async (step, ctx) => {
  if (step.type !== "inputToSelector") throw new Error("wrong handler");
  const el = document.querySelector(step.selector);
  if (!el) throw new Error(`No element for "${step.selector}"`);
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    throw new Error(`Element "${step.selector}" is not an input or textarea`);
  }
  const value = resolve(step.value, ctx);
  writeValue(el, value);
  return { note: `filled "${step.selector}"` };
};
