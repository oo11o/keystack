import type { Config, Stack } from "../core/schema";
import { matches } from "../core/keys";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

// Exported for the resume path, which needs the same config but is not
// driven by a keystroke (content/resumePending.ts).
export async function loadConfig(): Promise<Config> {
  const url = chrome.runtime.getURL("config/stacks.json");
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

// A matched stack plus every stack in the config — the latter is only for
// the $stacks builtin (the cheatsheet popup lists them), carried alongside
// so the executor doesn't need a second fetch of its own.
export type Route = { stack: Stack; allStacks: Stack[] };

// The config could not be read at all, so no chord can match and every
// hotkey is dead. Returned as data rather than shown from here: resolving
// stays a pure lookup, and the caller decides what to do about it.
export type ConfigError = { configError: string };

export function isConfigError(r: Route | ConfigError | null): r is ConfigError {
  return r !== null && "configError" in r;
}

// Only worth reporting a broken config when the keystroke plausibly was a
// chord. Without this, every character typed on a page would raise a toast,
// since stacks.json is re-read on every keydown. Shift is excluded on
// purpose — Shift+letter is ordinary typing, not a hotkey.
function looksLikeChord(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.altKey || e.metaKey;
}

// Resolves a keydown event to the stack it should run, if any. A pure
// lookup — no preventDefault, no logging, no side effects — so the caller
// decides what "claiming" the keystroke actually means.
export async function resolveStack(e: KeyboardEvent): Promise<Route | ConfigError | null> {
  if (isTypingTarget(e.target)) return null;

  let config: Config;
  try {
    config = await loadConfig();
  } catch (err) {
    // A missing config is normal (nothing configured yet); a malformed one
    // is a mistake worth showing. Both land here, so the message carries
    // the distinction rather than the control flow.
    return looksLikeChord(e) ? { configError: (err as Error).message } : null;
  }

  // Parsed, but not the shape we expect — `config.stacks.find` below would
  // throw inside a keydown listener, where nothing catches it.
  if (!Array.isArray(config?.stacks)) {
    return looksLikeChord(e) ? { configError: 'no "stacks" array in the config' } : null;
  }

  const stack = config.stacks.find((s) => s.enabled && matches(e, s.binding));
  return stack ? { stack, allStacks: config.stacks } : null;
}
