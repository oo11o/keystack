import type { Stack } from "./schema";
import { formatBinding } from "./keys";

// Born on keypress, wiped when the run ends — see runStack() in inject.ts.
// There is no global store, so a value cannot leak between runs or between
// stacks: there is nowhere for it to persist.
export type RunContext = Map<string, string>;

export const MAX_VARS = 64;

export function resolve(template: string, ctx: RunContext): string {
  return template.replace(/\$\$|\$(\w+)/g, (match, name: string | undefined) => {
    if (match === "$$") return "$";
    if (!ctx.has(name!)) throw new Error(`unknown variable "$${name}"`);
    return ctx.get(name!)!;
  });
}

// Built-in variables, seeded before step 1 so every step can read them and
// the popup step needs no content mechanism of its own — its body is just a
// template like any other value. A producer with `saveAs: "url"` deliberately
// shadows one; that is allowed, the builtins are only defaults.
export const BUILTINS = ["url", "title", "selection", "stacks", "stackName"] as const;

// "Ctrl(⌃)+Opt(⌥)+1  Copy Tender", one enabled stack per line, chords padded
// to a common width so the names line up.
export function formatStackList(stacks: Stack[]): string {
  const rows = stacks.filter((s) => s.enabled).map((s) => [formatBinding(s.binding), s.name]);
  const width = rows.reduce((max, [chord]) => Math.max(max, chord.length), 0);
  return rows.map(([chord, name]) => `${chord.padEnd(width)}  ${name}`).join("\n");
}

export function seedBuiltins(ctx: RunContext, stacks: Stack[], current?: Stack): void {
  ctx.set("url", location.href);
  ctx.set("title", document.title);
  ctx.set("selection", window.getSelection()?.toString() ?? "");
  ctx.set("stacks", formatStackList(stacks));
  ctx.set("stackName", current?.name ?? "");
}
