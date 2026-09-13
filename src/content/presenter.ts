import type { Settings, Stack } from "../core/schema";
import { showResultToast, type RunOutcome } from "../ui/toast";

function redactOutcome(outcome: RunOutcome, redact: (text: string) => string): RunOutcome {
  const notes = outcome.notes.map(redact);
  return outcome.ok
    ? { ...outcome, notes }
    : { ...outcome, notes, message: redact(outcome.message) };
}

// A popup step is already the visible confirmation of success — a toast
// on top of it would be redundant. Failure still needs the toast: the
// popup may never have been reached, or the error may be about the popup
// step itself (e.g. an unknown $var in its body).
//
// `redact` masks secret values on their way to the screen; the run itself
// used the real ones. See core/redact.ts.
export function present(
  chord: string,
  stack: Stack,
  outcome: RunOutcome,
  settings: Settings,
  redact: (text: string) => string = (text) => text
): void {
  const sawPopup = stack.steps.some((step) => step.type === "popup");
  if (outcome.ok && sawPopup) return;
  showResultToast(chord, stack.name, redactOutcome(outcome, redact), settings.toast);
}
