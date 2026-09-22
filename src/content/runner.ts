import type { Stack, Step } from "../core/schema";
import { MAX_VARS, seedSecrets, type RunContext } from "../core/context";
import { seedBuiltins } from "../page/builtins";
import { navigateHere } from "../page/navigate";
import { saveResume } from "../background/client";
import { makeRedactor } from "../core/redact";
import type { ResumeRecord } from "../background/protocol";
import { handlers } from "../steps";

// How long a suspended stack stays claimable. Long enough for a slow page
// to load, short enough that a navigation which never lands cannot leave a
// stack lying in wait on a site it was never meant to touch.
export const RESUME_TTL_MS = 15_000;

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

// What a resumed run starts from — the surviving half of a stack suspended
// by a navigation step. Shaped by protocol.ts, since it travelled through
// the worker to get here.
export type Resume = Pick<ResumeRecord, "nextStep" | "vars" | "notes">;

// The context is created here and dies with this function — no global
// store, so a value cannot leak between runs or between stacks.
// `allStacks` is only there for the $stacks builtin (the cheatsheet popup
// lists them); it defaults to this stack alone so callers that don't care
// can ignore it.
// `resume` continues a stack that navigated away mid-run: its step-written
// variables and notes are restored, while builtins and secrets are seeded
// fresh — builtins because they describe the page, and this is a different
// page; secrets because they are deliberately never persisted.
// Returns one note per step that reported something, in run order.
export async function runStack(
  stack: Stack,
  allStacks: Stack[] = [stack],
  secrets: Record<string, string> = {},
  resume?: Resume
): Promise<string[]> {
  const ctx: RunContext = new Map();
  // Before step 1, so every step can read them.
  seedBuiltins(ctx, allStacks, stack);
  seedSecrets(ctx, secrets);
  const seeded = ctx.size; // builtins + secrets are not charged to the step budget

  // Which keys a step wrote, so a suspend can persist exactly those. A
  // restored variable is still step-written and is charged to the budget,
  // and may legitimately shadow a builtin (a producer with saveAs: "url").
  const written = new Set<string>(resume?.vars.map(([name]) => name));
  for (const [name, value] of resume?.vars ?? []) ctx.set(name, value);

  const notes: string[] = [...(resume?.notes ?? [])];
  try {
    for (let i = resume?.nextStep ?? 0; i < stack.steps.length; i++) {
      const step = stack.steps[i];
      try {
        const handler = handlers[step.type];
        if (!handler) throw new Error(`Unknown step type "${step.type}"`);
        const { value, note, navigateTo } = await handler(step, ctx);
        if (value !== undefined) {
          // MAX_VARS caps what *steps* write; seeded values are not charged
          // against that budget.
          if (ctx.size >= MAX_VARS + seeded) {
            throw new Error(`too many variables (max ${MAX_VARS})`);
          }
          remember(ctx, written, "value", value);
          remember(ctx, written, step.id, value); // every producer is reachable as $<its own id>, free of charge
          if ("saveAs" in step && step.saveAs) remember(ctx, written, step.saveAs, value);
        }
        if (note) notes.push(note);
        if (navigateTo) {
          // Park the rest of the stack *before* the page starts unloading;
          // once location.assign runs there is no guarantee another await
          // ever resolves. Nothing to park if this was the last step.
          const next = i + 1;
          if (next < stack.steps.length) {
            const redact = makeRedactor(secrets);
            await saveResume({
              stackId: stack.id,
              nextStep: next,
              // vars are live data — a later step interpolates them, so they
              // cross unmasked. notes are display data and nothing reads
              // them back, so they cross masked: a suspended stack must not
              // park a token in storage just to caption a toast later. The
              // presenter would have masked them on screen anyway, so the
              // resumed toast reads exactly the same.
              vars: [...written].map((name) => [name, ctx.get(name)!]),
              notes: notes.map(redact),
              expiresAt: Date.now() + RESUME_TTL_MS
            });
          }
          navigateHere(navigateTo);
          break; // this document is on its way out
        }
      } catch (err) {
        throw new StepError((err as Error).message, [...notes], i, step);
      }
    }
    return notes;
  } finally {
    ctx.clear();
  }
}

function remember(ctx: RunContext, written: Set<string>, name: string, value: string): void {
  ctx.set(name, value);
  written.add(name);
}
