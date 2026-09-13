import type { Handler } from "./types";
import { readText } from "../page/dom";

export const readBySelector: Handler = async (step) => {
  if (step.type !== "readBySelector") throw new Error("wrong handler");
  const text = readText(step.selector);
  return { value: text, note: `read "${text}"` };
};
