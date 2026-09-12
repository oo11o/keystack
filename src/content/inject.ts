import type { Config, Settings, Stack, Step } from "../core/schema";
import { DEFAULT_SETTINGS } from "../core/schema";
import { matches, formatBinding } from "../core/keys";
import { BUILTINS, MAX_VARS, seedBuiltins, type RunContext } from "../core/context";
import { handlers } from "./steps";
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

// Thrown by runStack on failure so the caller can render the steps that
// already succeeded alongside the one that broke, instead of losing that
// progress behind a single error message.
export class StepError extends Error {
  constructor(
    message: string,
    public readonly notes: string[], // notes from steps before the failure
    public readonly stepIndex: number,
    public readonly step: Step
  ) {
    super(message);
  }
}

// The context is created here and dies with this function — no global
// store, so a value cannot leak between runs or between stacks.
// `allStacks` is only there for the $stacks builtin (the cheatsheet popup
// lists them); it defaults to this stack alone so callers that don't care
// can ignore it.
// Returns one note per step that reported something, in run order.
export async function runStack(stack: Stack, allStacks: Stack[] = [stack]): Promise<string[]> {
  const ctx: RunContext = new Map();
  seedBuiltins(ctx, allStacks, stack); // before step 1, so every step can read them
  const notes: string[] = [];
  try {
    for (let i = 0; i < stack.steps.length; i++) {
      const step = stack.steps[i];
      try {
        const handler = handlers[step.type];
        if (!handler) throw new Error(`Unknown step type "${step.type}"`);
        const { value, note } = await handler(step, ctx);
        if (value !== undefined) {
          // MAX_VARS caps what *steps* write; the seeded builtins are not
          // charged against that budget.
          if (ctx.size >= MAX_VARS + BUILTINS.length) {
            throw new Error(`too many variables (max ${MAX_VARS})`);
          }
          ctx.set("value", value);
          ctx.set(step.id, value); // every producer is reachable as $<its own id>, free of charge
          if ("saveAs" in step && step.saveAs) ctx.set(step.saveAs, value);
        }
        if (note) notes.push(note);
      } catch (err) {
        throw new StepError((err as Error).message, [...notes], i, step);
      }
    }
    return notes;
  } finally {
    ctx.clear();
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
