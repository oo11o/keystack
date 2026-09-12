import { describe, it, expect } from "vitest";
import { matches, formatBinding } from "../src/core/keys";
import type { Binding } from "../src/core/schema";

const binding: Binding = { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false };

function keydown(overrides: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    code: "Digit1",
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    ...overrides
  });
}

describe("matches", () => {
  it("matches the exact chord", () => {
    expect(matches(keydown(), binding)).toBe(true);
  });

  it("rejects the same key with an extra modifier", () => {
    expect(matches(keydown({ shiftKey: true }), binding)).toBe(false);
  });

  it("rejects a different physical key", () => {
    expect(matches(keydown({ code: "Digit2" }), binding)).toBe(false);
  });

  it("rejects a missing required modifier", () => {
    expect(matches(keydown({ altKey: false }), binding)).toBe(false);
  });
});

describe("formatBinding", () => {
  it("formats modifiers and a digit key", () => {
    expect(formatBinding(binding)).toBe("Ctrl+Alt+1");
  });

  it("formats a letter key", () => {
    expect(formatBinding({ code: "KeyA", ctrl: false, alt: true, shift: true, meta: false }))
      .toBe("Alt+Shift+A");
  });

  it("passes through a non-alphanumeric code as-is", () => {
    expect(formatBinding({ code: "F1", ctrl: true, alt: false, shift: false, meta: false }))
      .toBe("Ctrl+F1");
  });
});
