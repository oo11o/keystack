import { describe, it, expect } from "vitest";
import { resolve, BUILTINS } from "../src/core/context";
import { formatBinding } from "../src/core/keys";
import type { Stack } from "../src/core/schema";
import type { StackSection } from "../src/core/match";
import { formatStackList, seedBuiltins } from "../src/page/builtins";

describe("seedBuiltins", () => {
  const stack = (id: string, name: string, code: string, enabled = true): Stack => ({
    id,
    name,
    binding: { code, ctrl: true, alt: true, shift: false, meta: false },
    enabled,
    steps: []
  });

  // $stacks is grouped by scope, so what seedBuiltins takes is sections.
  const everywhere = (...stacks: Stack[]): StackSection[] => [
    { level: "common", label: "Everywhere", stacks }
  ];

  it("fills every builtin named in BUILTINS", () => {
    const ctx = new Map<string, string>();
    seedBuiltins(ctx, everywhere(stack("a", "A", "Digit1")));
    for (const name of BUILTINS) expect(ctx.has(name)).toBe(true);
  });

  it("$stacks lists only enabled stacks, chord first, names aligned", () => {
    const ctx = new Map<string, string>();
    seedBuiltins(
      ctx,
      everywhere(
        stack("a", "Copy Tender", "Digit1"),
        stack("b", "Sync", "Digit2"),
        stack("c", "Off", "Digit3", false)
      )
    );
    const lines = ctx.get("stacks")!.split("\n");
    expect(lines).toHaveLength(2); // the disabled stack is not listed, and one section needs no heading
    expect(lines[0]).toBe(`${formatBinding(stack("a", "A", "Digit1").binding)}  Copy Tender`);
    expect(lines[0].indexOf("Copy Tender")).toBe(lines[1].indexOf("Sync")); // aligned
  });

  it("$stackName is the running stack's name", () => {
    const ctx = new Map<string, string>();
    const current = stack("a", "Copy Tender", "Digit1");
    seedBuiltins(ctx, everywhere(current), current);
    expect(resolve("$stackName", ctx)).toBe("Copy Tender");
  });

  it("a step can shadow a builtin by writing over it", () => {
    const ctx = new Map<string, string>();
    seedBuiltins(ctx, everywhere());
    ctx.set("url", "https://example.test/overridden"); // what saveAs: "url" would do
    expect(resolve("$url", ctx)).toBe("https://example.test/overridden");
  });
});

describe("formatStackList — the cheatsheet's three tiers", () => {
  const stack = (name: string, code: string, enabled = true): Stack => ({
    id: name,
    name,
    binding: { code, ctrl: true, alt: true, shift: false, meta: false },
    enabled,
    steps: []
  });

  const sections: StackSection[] = [
    { level: "url", label: "This URL · new tender", stacks: [stack("logoutLogin", "Digit8")] },
    { level: "domain", label: "This domain · dzo.lh", stacks: [stack("Sync", "Digit3")] },
    { level: "common", label: "Everywhere", stacks: [stack("Copy Tender", "Digit1")] }
  ];

  it("heads each tier and keeps them in the order they were given — narrowest first", () => {
    const lines = formatStackList(sections).split("\n");

    expect(lines.filter((l) => !l.startsWith(" ") && l !== "")).toEqual([
      "This URL · new tender",
      "This domain · dzo.lh",
      "Everywhere"
    ]);
  });

  it("indents the stacks under their heading and separates the tiers", () => {
    const text = formatStackList(sections);

    expect(text).toContain("\n\nThis domain · dzo.lh\n  ");
    expect(text.split("\n").filter((l) => l.includes("Sync"))[0].startsWith("  ")).toBe(true);
  });

  it("aligns names across every tier, not just within one", () => {
    // A long chord in one section still pushes the other sections' names over,
    // so the whole popup reads as one column.
    const wide = [
      {
        level: "url" as const,
        label: "This URL · x",
        stacks: [stack("Long", "ArrowDown")]
      },
      ...sections.slice(-1)
    ];
    const lines = formatStackList(wide).split("\n").filter((l) => l.startsWith("  "));

    expect(lines[0].indexOf("Long")).toBe(lines[1].indexOf("Copy Tender"));
  });

  it("leaves out a tier with nothing enabled in it", () => {
    const withEmpty: StackSection[] = [
      { level: "domain", label: "This domain · dzo.lh", stacks: [stack("Off", "Digit9", false)] },
      sections.at(-1)!
    ];

    // One section survives, so it is shown bare — no heading to tell it apart
    // from anything.
    expect(formatStackList(withEmpty)).toBe(formatStackList([sections.at(-1)!]));
    expect(formatStackList(withEmpty)).not.toContain("Everywhere");
  });

  it("is empty when nothing applies at all", () => {
    expect(formatStackList([])).toBe("");
  });
});
