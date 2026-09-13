import type { Handler } from "./types";
import { resolve } from "../core/context";
import { toHttpUrl } from "../page/navigate";
import { fetchInBackground } from "../background/client";
import { showSpinner } from "../ui/spinner";

// Module-level, not per-call: a hotkey mashed twice before the first request
// lands would otherwise fire the endpoint (e.g. a sync trigger) a second
// time before the first result is even known. One fetchUrl at a time across
// the whole page, regardless of which stack or chord it came from.
let inFlight = false;

// Some endpoints return JSON with non-ASCII text escaped as \uXXXX — valid
// JSON, but unreadable as raw text (a Cyrillic message shows up as literal
// backslash-u sequences). Parsing and re-stringifying decodes those escapes
// back into real characters; JSON.stringify does not re-escape them. A
// non-JSON body (plain text, HTML) fails to parse and is returned as-is.
function displayBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export const fetchUrl: Handler = async (step, ctx) => {
  if (step.type !== "fetchUrl") throw new Error("wrong handler");
  if (inFlight) throw new Error("A fetchUrl request is already in progress — wait for it to finish");

  const url = toHttpUrl(resolve(step.url, ctx, encodeURIComponent));

  // Origin + path only, no query string: a $secret_* substituted into the
  // URL is only masked later, at the presentation boundary (core/redact.ts)
  // — showing the full URL here would put it on screen unmasked.
  const { origin, pathname } = new URL(url);
  const hide = showSpinner(`Fetching ${origin}${pathname}…`);
  inFlight = true;
  try {
    const { ok, status, body } = await fetchInBackground(url);
    const text = displayBody(body);
    // Truncated: an error page's body can be arbitrarily long, and this text
    // ends up in a StepError message shown on a toast.
    if (!ok) throw new Error(`fetchUrl ${status}: ${text.slice(0, 200)}`);
    return { value: text, note: `fetched ${url} (${status})` };
  } finally {
    hide();
    inFlight = false;
  }
};
