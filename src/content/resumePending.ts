import { loadConfig } from "./stackResolver";
import { executeStack } from "./stackExecutor";
import { takeResume } from "../background/client";

// Runs once per page load, before any keystroke: if the previous page in
// this tab suspended a stack by navigating here, pick it up where it left
// off. This is the other half of the navigation boundary — the content
// script that started the stack died with its page, so a fresh one finishes
// the job.
//
// Silent when there is nothing to resume, which is the overwhelmingly
// common case: one message to the worker per page load, no config fetch.
export async function resumePending(): Promise<void> {
  const record = await takeResume();
  if (!record) return;

  const config = await loadConfig().catch(() => null);
  if (!config) return; // config unreachable — nothing to resume against

  // The stack may have been renamed, disabled or deleted while the page was
  // loading. Dropping the record is the right answer: half a stack is worse
  // than none, and the record is already consumed.
  const stack = config.stacks.find((s) => s.id === record.stackId);
  if (!stack || !stack.enabled) return;
  if (record.nextStep >= stack.steps.length) return; // edited out from under us

  await executeStack(stack, config.stacks, record);
}
