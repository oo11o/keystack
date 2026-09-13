import type { Handler } from "./types";
import { resolve } from "../core/context";
import { showPopup } from "../ui/popup";

export const popup: Handler = async (step, ctx) => {
  if (step.type !== "popup") throw new Error("wrong handler");
  // The title falls back to the running stack's name — as a template, not a
  // special case: $stackName is just another builtin (see context.ts).
  const title = resolve(step.title ?? "$stackName", ctx);
  await showPopup(title, resolve(step.body, ctx)); // blocks until dismissed
  return { note: `popup "${title}"` };
};
