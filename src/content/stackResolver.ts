import type { Config, Stack } from "../core/schema";
import { matches } from "../core/keys";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

async function loadConfig(): Promise<Config> {
  const url = chrome.runtime.getURL("config/stacks.json");
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

// A matched stack plus every stack in the config — the latter is only for
// the $stacks builtin (the cheatsheet popup lists them), carried alongside
// so the executor doesn't need a second fetch of its own.
export type Route = { stack: Stack; allStacks: Stack[] };

// Resolves a keydown event to the stack it should run, if any. A pure
// lookup — no preventDefault, no logging, no side effects — so the caller
// decides what "claiming" the keystroke actually means.
export async function resolveStack(e: KeyboardEvent): Promise<Route | null> {
  if (isTypingTarget(e.target)) return null;

  let config: Config;
  try {
    config = await loadConfig();
  } catch {
    return null; // config missing/unreachable — nothing to match against
  }

  const stack = config.stacks.find((s) => s.enabled && matches(e, s.binding));
  return stack ? { stack, allStacks: config.stacks } : null;
}
