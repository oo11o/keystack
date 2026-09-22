import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveStack, isConfigError, type ConfigError } from "../src/content/stackResolver";

// resolveStack fetches the config on every keydown, so the seam is fetch.
function stubConfig(body: string) {
  vi.stubGlobal("chrome", { runtime: { getURL: (p: string) => `chrome-extension://x/${p}` } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
}

function stubUnreachable() {
  vi.stubGlobal("chrome", { runtime: { getURL: (p: string) => `chrome-extension://x/${p}` } });
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }));
}

// ⌃⌥1 by default — a plausible chord. Pass no modifiers for ordinary typing.
function keydown(over: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { code: "Digit1", ctrlKey: true, altKey: true, ...over });
}

const VALID = JSON.stringify({
  schemaVersion: 1,
  stacks: [
    {
      id: "copy-id",
      name: "Copy Tender",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "copyBySelector", selector: "#tender_id" }]
    }
  ]
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("an unreadable stacks.json", () => {
  it("reports the parse error instead of silently doing nothing", async () => {
    // The exact shape that broke it in practice: a step was deleted by hand
    // and the comma after the previous one stayed behind.
    stubConfig(`{ "schemaVersion": 1, "stacks": [ { "id": "a" }, ] }`);

    const result = await resolveStack(keydown());

    expect(isConfigError(result)).toBe(true);
    expect((result as ConfigError).configError).toMatch(/JSON|token|comma/i);
  });

  it("reports a config that parses but has no stacks array", async () => {
    stubConfig(`{ "schemaVersion": 1 }`);

    const result = await resolveStack(keydown());

    expect((result as ConfigError).configError).toBe('no "stacks" array in the config');
  });

  it("does not throw when stacks is the wrong type — it reports", async () => {
    stubConfig(`{ "stacks": "not an array" }`);

    // Without the Array.isArray guard this rejects inside a keydown
    // listener, where nothing catches it.
    await expect(resolveStack(keydown())).resolves.toBeTruthy();
  });

  it("stays silent for ordinary typing, so a broken config cannot spam toasts", async () => {
    stubConfig(`{ "stacks": [ , ] }`);

    // stacks.json is re-read on every keydown; without the modifier check
    // every character typed would raise a toast.
    expect(await resolveStack(keydown({ ctrlKey: false, altKey: false }))).toBeNull();
    expect(await resolveStack(keydown({ ctrlKey: false, altKey: false, shiftKey: true }))).toBeNull();
  });

  it("still reports for a Cmd or Ctrl chord, not just Ctrl+Alt", async () => {
    stubConfig(`{ nope }`);

    expect(isConfigError(await resolveStack(keydown({ ctrlKey: false, altKey: false, metaKey: true })))).toBe(true);
    expect(isConfigError(await resolveStack(keydown({ altKey: false })))).toBe(true);
  });

  it("stays silent while focus is in a text field, config broken or not", async () => {
    stubConfig(`{ "stacks": [ , ] }`);
    document.body.innerHTML = `<input id="typing" />`;
    const input = document.querySelector("#typing")!;

    const e = new KeyboardEvent("keydown", { code: "Digit1", ctrlKey: true, altKey: true });
    Object.defineProperty(e, "target", { value: input });

    expect(await resolveStack(e)).toBeNull();
  });

  it("reports an unreachable config the same way", async () => {
    stubUnreachable();

    expect(isConfigError(await resolveStack(keydown()))).toBe(true);
  });
});

describe("a readable stacks.json", () => {
  it("still resolves a matching chord to its stack", async () => {
    stubConfig(VALID);

    const result = await resolveStack(keydown());

    expect(isConfigError(result)).toBe(false);
    expect(result).toMatchObject({ stack: { id: "copy-id" } });
  });

  it("still returns null for a chord nothing is bound to", async () => {
    stubConfig(VALID);

    expect(await resolveStack(keydown({ code: "Digit9" }))).toBeNull();
  });
});
