import { describe, it, expect } from "vitest";
import { resolve, BUILTINS } from "../src/core/context";
import { formatBinding } from "../src/core/keys";
import type { Stack } from "../src/core/schema";
import { seedBuiltins } from "../src/page/builtins";

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
