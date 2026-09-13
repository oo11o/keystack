import type { Handler } from "./types";
import { resolve } from "../core/context";
import { openTab, toHttpUrl } from "../page/navigate";

export const openUrl: Handler = async (step, ctx) => {
  if (step.type !== "openUrl") throw new Error("wrong handler");
  const url = toHttpUrl(resolve(step.url, ctx, encodeURIComponent));
  openTab(url);
  return { note: `opened ${url}` };
};