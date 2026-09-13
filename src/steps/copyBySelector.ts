import type { Handler } from "./types";
import { readText } from "../page/dom";
import { copyToClipboard } from "../page/clipboard";

export const copyBySelector: Handler = async (step) => {
  if (step.type !== "copyBySelector") throw new Error("wrong handler");
  const text = readText(step.selector);
  await copyToClipboard(text);
  return { note: `copied "${text}"` };
};
