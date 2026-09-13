// Opening tabs. Touches `window`/`location`, so it lives in page/ rather
// than core/ — same split as dom.ts and clipboard.ts.

// Relative URLs resolve against the current page, so a stack can say
// "/cron/sync.php?id=$s1" without hardcoding the host it runs on.
// Only http/https are allowed: a stacks.json can be shared or imported, and
// `javascript:` in window.open would run in the page's context.
export function toHttpUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw, location.href);
  } catch {
    throw new Error(`Invalid URL "${raw}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`openUrl supports only http/https URLs, got "${parsed.protocol}"`);
  }
  return parsed.href;
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