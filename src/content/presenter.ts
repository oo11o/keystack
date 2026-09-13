import type { Settings, Stack } from "../core/schema";
import { showResultToast, type RunOutcome } from "../ui/toast";

// A popup step is already the visible confirmation of success — a toast
// on top of it would be redundant. Failure still needs the toast: the
// popup may never have been reached, or the error may be about the popup
// step itself (e.g. an unknown $var in its body).
export function present(chord: string, stack: Stack, outcome: RunOutcome, settings: Settings): void {
  const sawPopup = stack.steps.some((step) => step.type === "popup");
  if (outcome.ok && sawPopup) return;
  showResultToast(chord, stack.name, outcome, settings.toast);
}
