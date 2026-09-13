import type { Stack, Step } from "../core/schema";
import { BUILTINS, MAX_VARS, type RunContext } from "../core/context";
import { seedBuiltins } from "../page/builtins";
import { handlers } from "../steps";

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