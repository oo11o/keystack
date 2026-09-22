// URL handling shared by the URL steps (openUrlInNewTab, openUrlInCurrentTab,
// fetchUrl). Touches `location`, so it lives in page/ rather than core/ —
// same split as dom.ts and clipboard.ts.
import { resolve, type RunContext } from "../core/context";

// Relative URLs resolve against the current page, so a stack can say
// "/cron/sync.php?id=$s1" without hardcoding the host it runs on.
// Only http/https are allowed: a stacks.json can be shared or imported, and
// `javascript:` in window.open (or a fetch target) would be a code-execution
// footgun none of these steps is meant to offer.
export function toHttpUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw, location.href);
  } catch {
    throw new Error(`Invalid URL "${raw}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`only http/https URLs are supported, got "${parsed.protocol}"`);
  }
  return parsed.href;
}

// The prologue every URL step shares: substitute $vars, then validate. The
// transform is applied per value and never to the template around it, so a
// value holding & or = lands as one query parameter instead of injecting
// another (see core/context.ts).
export function resolveHttpUrl(template: string, ctx: RunContext): string {
  return toHttpUrl(resolve(template, ctx, encodeURIComponent));
}

// Passing "noopener" would make window.open always return null, leaving a
// blocked popup indistinguishable from a successful one — and for a hotkey
// a silent no-op is the worst possible outcome. So we keep the handle and
// check it. Dropping noopener costs nothing here: the destination origin is
// whatever the stack author wrote in their own config, and interpolated
// values are percent-encoded, so a value read off the page cannot steer the
// tab to a different origin.
export function openTab(url: string): void {
  const win = window.open(url, "_blank");
  if (!win) throw new Error("Browser blocked the new tab — allow popups for this site");
}

// assign, not replace: the page you left stays in history, so Back returns
// to it. Nothing to check afterwards — unlike window.open there is no handle
// and no blocker; the document is on its way out either way.
export function navigateHere(url: string): void {
  location.assign(url);
}
