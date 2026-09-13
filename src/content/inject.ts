import type { Config, Settings } from "../core/schema";
import { DEFAULT_SETTINGS } from "../core/schema";
import { matches, formatBinding } from "../core/keys";
import { runStack, StepError } from "./runner";
import { showResultToast, type RunOutcome } from "../ui/toast";

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

async function loadSettings(): Promise<Settings> {
  try {
    const url = chrome.runtime.getURL("config/settings.json");
    const res = await fetch(url, { cache: "no-store" });
    return { ...DEFAULT_SETTINGS, ...(await res.json()) };
  } catch {
    return DEFAULT_SETTINGS; // settings.json missing/unreachable — fall back quietly
  }
}

document.addEventListener(
  "keydown",
  async (e) => {
    if (isTypingTarget(e.target)) return;

    let config: Config;
    try {
      config = await loadConfig();
    } catch (err) {
      // Config missing/unreachable — nothing to match against.
      return;
    }

    const stack = config.stacks.find((s) => s.enabled && matches(e, s.binding));
    if (!stack) return;

    e.preventDefault();
    e.stopPropagation();

    const settings = await loadSettings();
    const chord = formatBinding(stack.binding);
    if (settings.debug) {
      console.log(`[Keystack] ${chord} → "${stack.name}" (${stack.id})`);
    }

    let outcome: RunOutcome;
    try {
      const notes = await runStack(stack, config.stacks);
      outcome = { ok: true, notes };
    } catch (err) {
      if (err instanceof StepError) {
        outcome = { ok: false, notes: err.notes, stepIndex: err.stepIndex, stepType: err.step.type, message: err.message };
      } else {
        outcome = { ok: false, notes: [], stepIndex: -1, stepType: "error", message: (err as Error).message };
      }
    }
    // A popup step is already the visible confirmation of success — a toast
    // on top of it would be redundant. Failure still needs the toast: the
    // popup may never have been reached, or the error may be about the popup
    // step itself (e.g. an unknown $var in its body).
    const sawPopup = stack.steps.some((step) => step.type === "popup");
    if (outcome.ok && sawPopup) return;

    showResultToast(chord, stack.name, outcome, settings.toast);
  },
  true
);