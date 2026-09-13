import type { Stack } from "../core/schema";
import type { RunContext } from "../core/context";
import { formatBinding } from "../core/keys";

// "Ctrl(⌃)+Opt(⌥)+1  Copy Tender", one enabled stack per line, chords padded
// to a common width so the names line up.
export function formatStackList(stacks: Stack[]): string {
  const rows = stacks.filter((s) => s.enabled).map((s) => [formatBinding(s.binding), s.name]);
  const width = rows.reduce((max, [chord]) => Math.max(max, chord.length), 0);
  return rows.map(([chord, name]) => `${chord.padEnd(width)}  ${name}`).join("\n");
}

// Built-in variables, seeded before step 1 so every step can read them and
// the popup step needs no content mechanism of its own — its body is just a
// template like any other value. A producer with `saveAs: "url"` deliberately
// shadows one; that is allowed, the builtins are only defaults.
//
// Reads location/document/window directly, which is why this lives in
// page/ rather than core/context.ts — it cannot run outside a page (e.g. in
// a future service worker).
export function seedBuiltins(ctx: RunContext, stacks: Stack[], current?: Stack): void {
  ctx.set("url", location.href);
  ctx.set("title", document.title);
  ctx.set("selection", window.getSelection()?.toString() ?? "");
  ctx.set("stacks", formatStackList(stacks));
  ctx.set("stackName", current?.name ?? "");
}