import type { Step } from "../core/schema";

// One-line human summary of a step, for display only (not used at run time).
export function describeStep(step: Step): string {
  switch (step.type) {
    case "copyBySelector":
      return `Copy from ${step.selector}`;
    case "readBySelector":
      return step.saveAs
        ? `Read from ${step.selector} → $${step.saveAs}`
        : `Read from ${step.selector}`;
    case "inputToSelector":
      return `Fill ${step.selector} with "${step.value}"`;
  }
}
