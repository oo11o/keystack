import type { Handler } from "./types";
import { openTab, resolveHttpUrl } from "../page/navigate";

export const openUrlInNewTab: Handler = async (step, ctx) => {
  if (step.type !== "openUrlInNewTab") throw new Error("wrong handler");
  const url = resolveHttpUrl(step.url, ctx);
  openTab(url);
  return { note: `opened ${url}` };
};
