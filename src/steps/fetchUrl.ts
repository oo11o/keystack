import type { Handler } from "./types";
import { prettyJson } from "../core/json";
import { resolveHttpUrl } from "../page/navigate";
import { fetchInBackground } from "../background/client";
import { showSpinner } from "../ui/spinner";

// Module-level, not per-call: a hotkey mashed twice before the first request
// lands would otherwise fire the endpoint (e.g. a sync trigger) a second
// time before the first result is even known. One fetchUrl at a time across
// the whole page, regardless of which stack or chord it came from.
let inFlight = false;

export const fetchUrl: Handler = async (step, ctx) => {
  if (step.type !== "fetchUrl") throw new Error("wrong handler");
  if (inFlight) throw new Error("A fetchUrl request is already in progress — wait for it to finish");

  const url = resolveHttpUrl(step.url, ctx);

  // Origin + path only, no query string: a $secret_* substituted into the
  // URL is only masked later, at the presentation boundary (core/redact.ts)
  // — showing the full URL here would put it on screen unmasked.
  const { origin, pathname } = new URL(url);
  const hide = showSpinner(`Fetching ${origin}${pathname}…`);
  inFlight = true;
  try {
    const { ok, status, body } = await fetchInBackground(url);
    const text = prettyJson(body);
    // Truncated: an error page's body can be arbitrarily long, and this text
    // ends up in a StepError message shown on a toast.
    if (!ok) throw new Error(`fetchUrl ${status}: ${text.slice(0, 200)}`);
    return { value: text, note: `fetched ${url} (${status})` };
  } finally {
    hide();
    inFlight = false;
  }
};
