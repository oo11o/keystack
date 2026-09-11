import type { Binding } from "./schema";

// Exact equality on all four modifiers, so ⌃⌥1 does not also fire on ⌃⌥⇧1.
export function matches(e: KeyboardEvent, b: Binding): boolean {
  return (
    e.code === b.code &&
    e.ctrlKey === b.ctrl &&
    e.altKey === b.alt &&
    e.shiftKey === b.shift &&
    e.metaKey === b.meta
  );
}
