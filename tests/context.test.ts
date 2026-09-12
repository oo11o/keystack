import { describe, it, expect } from "vitest";
import { BUILTINS, resolve, seedBuiltins } from "../src/core/context";
import { formatBinding } from "../src/core/keys";
import type { Stack } from "../src/core/schema";

describe("resolve", () => {
  it("substitutes a bare $value", () => {
    const ctx = new Map([["value", "abc"]]);
    expect(resolve("$value", ctx)).toBe("abc");
  });

  it("substitutes a placeholder embedded in literal text", () => {
    const ctx = new Map([["id", "42"]]);
    expect(resolve("TENDER-$id", ctx)).toBe("TENDER-42");
  });

  it("substitutes two placeholders in one string", () => {
    const ctx = new Map([["a", "1"], ["b", "2"]]);
    expect(resolve("$a-$b", ctx)).toBe("1-2");
  });

  it("$$ produces a literal $", () => {
    const ctx = new Map<string, string>();
    expect(resolve("$$100", ctx)).toBe("$100");
  });

  it("throws naming the unknown variable", () => {
    const ctx = new Map<string, string>();
    expect(() => resolve("$typo", ctx)).toThrow('unknown variable "$typo"');
  });
});

describe("seedBuiltins", () => {
  const stack = (id: string, name: string, code: string, enabled = true): Stack => ({
    id,
    name,
    binding: { code, ctrl: true, alt: true, shift: false, meta: false },
    enabled,
    steps: []
  });

  it("fills every builtin named in BUILTINS", () => {
    const ctx = new Map<string, string>();
    seedBuiltins(ctx, [stack("a", "A", "Digit1")]);
    for (const name of BUILTINS) expect(ctx.has(name)).toBe(true);
  });

  it("$stacks lists only enabled stacks, chord first, names aligned", () => {
    const ctx = new Map<string, string>();
    seedBuiltins(ctx, [
      stack("a", "Copy Tender", "Digit1"),
      stack("b", "Sync", "Digit2"),
      stack("c", "Off", "Digit3", false)
    ]);
    const lines = ctx.get("stacks")!.split("\n");
    expect(lines).toHaveLength(2); // the disabled stack is not listed
    expect(lines[0]).toBe(`${formatBinding(stack("a", "A", "Digit1").binding)}  Copy Tender`);
    expect(lines[0].indexOf("Copy Tender")).toBe(lines[1].indexOf("Sync")); // aligned
  });

  it("$stackName is the running stack's name", () => {
    const ctx = new Map<string, string>();
    const current = stack("a", "Copy Tender", "Digit1");
    seedBuiltins(ctx, [current], current);
    expect(resolve("$stackName", ctx)).toBe("Copy Tender");
  });

  it("a step can shadow a builtin by writing over it", () => {
    const ctx = new Map<string, string>();
    seedBuiltins(ctx, []);
    ctx.set("url", "https://example.test/overridden"); // what saveAs: "url" would do
    expect(resolve("$url", ctx)).toBe("https://example.test/overridden");
  });
});
