import type { Handler } from "./types";
import { resolveHttpUrl } from "../page/navigate";

// openUrlInNewTab's sibling, and deliberately a separate verb rather than a
// flag on it: the contracts differ, not just the behaviour. Leaving this tab
// destroys the document, and with it the content script running the stack.
//
// The step does not navigate. It reports where it wants to go and lets the
// runner do it, because only the runner knows whether steps remain — and if
// they do, their state has to reach the worker *before* the page starts
// unloading. A step that called location.assign() itself would be racing
// that save. See runner.ts.
export const openUrlInCurrentTab: Handler = async (step, ctx) => {
  if (step.type !== "openUrlInCurrentTab") throw new Error("wrong handler");
  const url = resolveHttpUrl(step.url, ctx);
  return { note: `went to ${url}`, navigateTo: url };
};
