import type { Step } from "../core/schema";
import type { RunContext } from "../core/context";

// `value` present = this step is a producer and feeds $value/$saveAs.
// `note` is what the toast reports; a pure side-effect step sets only this.
// `navigateTo` = this step wants the current tab sent to that URL. The
// runner performs it, last, after parking whatever is left of the stack —
// the step only declares the destination. Stated as data rather than as a
// step type the runner recognises, so the loop stays ignorant of which
// steps exist.
export type StepResult = { value?: string; note?: string; navigateTo?: string };

export type Handler = (step: Step, ctx: RunContext) => Promise<StepResult>;
