import type { Step } from "../core/schema";
import type { RunContext } from "../core/context";

// `value` present = this step is a producer and feeds $value/$saveAs.
// `note` is what the toast reports; a pure side-effect step sets only this.
export type StepResult = { value?: string; note?: string };

export type Handler = (step: Step, ctx: RunContext) => Promise<StepResult>;
