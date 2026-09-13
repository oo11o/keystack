import type { Settings, Stack } from "../core/schema";
import { DEFAULT_SETTINGS } from "../core/schema";
import { formatBinding } from "../core/keys";
import { runStack, StepError } from "./runner";
import { logDebug } from "./debugLog";
import { present } from "./presenter";
import { loadSecrets } from "./secrets";
import { makeRedactor } from "../core/redact";
import type { RunOutcome } from "../ui/toast";

async function loadSettings(): Promise<Settings> {
  try {
    const url = chrome.runtime.getURL("config/settings.json");
    const res = await fetch(url, { cache: "no-store" });
    return { ...DEFAULT_SETTINGS, ...(await res.json()) };
  } catch {
    return DEFAULT_SETTINGS; // settings.json missing/unreachable — fall back quietly
  }
}

// Runs a stack and maps the result (or thrown StepError) to a RunOutcome.
// Pure with respect to presentation: no logging, no toast.
async function resolveOutcome(
  stack: Stack,
  allStacks: Stack[],
  secrets: Record<string, string>
): Promise<RunOutcome> {
  try {
    const notes = await runStack(stack, allStacks, secrets);
    return { ok: true, notes };
  } catch (err) {
    if (err instanceof StepError) {
      return {
        ok: false,
        notes: err.notes,
        stepIndex: err.stepIndex,
        stepType: err.step.type,
        message: err.message
      };
    }
    return { ok: false, notes: [], stepIndex: -1, stepType: "error", message: (err as Error).message };
  }
}

// Runs an already-resolved stack end to end: debug logging, execution, and
// presenting the outcome (toast) — unless a popup step already showed the
// confirmation.
export async function executeStack(stack: Stack, allStacks: Stack[]): Promise<void> {
  const [settings, secrets] = await Promise.all([loadSettings(), loadSecrets()]);
  const chord = formatBinding(stack.binding);
  logDebug(chord, stack, settings.debug);

  const outcome = await resolveOutcome(stack, allStacks, secrets);
  present(chord, stack, outcome, settings, makeRedactor(secrets));
}
