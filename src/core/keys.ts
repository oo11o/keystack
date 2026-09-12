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

// "Digit1" -> "1", "KeyA" -> "A"; anything else (F1, Space, ...) passes through as-is.
function keyLabel(code: string): string {
  const digit = code.match(/^Digit(\d)$/);
  if (digit) return digit[1];
  const letter = code.match(/^Key([A-Z])$/);
  if (letter) return letter[1];
  return code;
}

// e.g. { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false } -> "Ctrl+Alt+1"
export function formatBinding(b: Binding): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push("Ctrl");
  if (b.alt) parts.push("Alt");
  if (b.shift) parts.push("Shift");
  if (b.meta) parts.push("Meta");
  parts.push(keyLabel(b.code));
  return parts.join("+");
}
