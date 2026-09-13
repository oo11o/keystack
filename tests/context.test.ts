import { describe, it, expect } from "vitest";
import { resolve } from "../src/core/context";

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
