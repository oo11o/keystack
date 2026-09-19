import type { Handler } from "./types";
import { resolve } from "../core/context";
import { prettyJson } from "../core/json";
import { showPopup } from "../ui/popup";

// popup's sibling for bodies too big to read by scrolling — a fetched API
// payload runs to hundreds of lines. Same fields, same $stackName title
// fallback; the difference is entirely in how the body is rendered.
export const popupJson: Handler = async (step, ctx) => {
  if (step.type !== "popupJson") throw new Error("wrong handler");
  const title = resolve(step.title ?? "$stackName", ctx);
  const body = prettyJson(resolve(step.body, ctx));
  await showPopup(title, body, { filter: true }); // blocks until dismissed
  return { note: `popup "${title}"` };
};
