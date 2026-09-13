import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runStack, StepError } from "../src/content/runner";
import { resolve, seedSecrets, type RunContext } from "../src/core/context";
import { makeRedactor, MASK } from "../src/core/redact";
import { present } from "../src/content/presenter";
import type { Stack } from "../src/core/schema";

let open: ReturnType<typeof vi.spyOn>;

function syncStack(url: string): Stack {
  return {
    id: "sync",
    name: "Sync Tender",
    binding: { code: "Digit3", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps: [
      { id: "s1", type: "readBySelector", selector: "#tender_id" },
      { id: "s2", type: "openUrl", url }
    ]
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  open = vi.spyOn(window, "open").mockReturnValue({} as Window);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("seedSecrets", () => {
  it("namespaces every secret under $secret_", () => {
    const ctx: RunContext = new Map();
    seedSecrets(ctx, { runToken: "abc123" });

    expect(resolve("run=$secret_runToken", ctx)).toBe("run=abc123");
    expect(ctx.has("runToken")).toBe(false); // only reachable via the prefix
  });

  it("leaves the context untouched when there are no secrets", () => {
    const ctx: RunContext = new Map();
    seedSecrets(ctx, {});
    expect(ctx.size).toBe(0);
  });
});

describe("secrets in a stack", () => {
  it("substitutes a secret into an openUrl template", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;

    await runStack(syncStack("http://dzo.lh/sync.php?id=$s1&run=$secret_runToken"), undefined, {
      runToken: "ksdjfgnsaerhtoiaerhg"
    });

    expect(open.mock.calls[0][0]).toBe(
      "http://dzo.lh/sync.php?id=T-42&run=ksdjfgnsaerhtoiaerhg"
    );
  });

  it("fails loudly when a referenced secret has not been set", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;

    const err = await runStack(syncStack("http://dzo.lh/sync.php?run=$secret_missing")).catch(
      (e) => e
    );

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/unknown variable "\$secret_missing"/);
    expect(open).not.toHaveBeenCalled();
  });

  it("does not charge seeded secrets against the step variable budget", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;
    const many = Object.fromEntries(
      Array.from({ length: 80 }, (_, i) => [`k${i}`, `v${i}`])
    );

    // 80 secrets is well past MAX_VARS (64); only what steps *write* counts.
    await expect(
      runStack(syncStack("http://dzo.lh/sync.php?id=$s1"), undefined, many)
    ).resolves.toBeDefined();
  });
});

describe("present — the toast is where a secret would actually leak", () => {
  const settings = { debug: false, toast: "max" as const };
  const secrets = { runToken: "ksdjfgnsaerhtoiaerhg" };
  const stack = syncStack("http://dzo.lh/sync.php?run=$secret_runToken");

  function toastText(): string {
    const host = document.getElementById("keystack-toast-host");
    return host?.shadowRoot?.querySelector(".detail")?.textContent ?? "";
  }

  it("masks a secret embedded in a step note", () => {
    const outcome = {
      ok: true as const,
      notes: ['read "T-42"', "opened http://dzo.lh/sync.php?run=ksdjfgnsaerhtoiaerhg"]
    };

    present("Ctrl+Alt+3", stack, outcome, settings, makeRedactor(secrets));

    expect(toastText()).toContain(MASK);
    expect(toastText()).not.toContain("ksdjfgnsaerhtoiaerhg");
  });

  it("masks a secret quoted back in an error message", () => {
    const outcome = {
      ok: false as const,
      notes: [],
      stepIndex: 1,
      stepType: "openUrl",
      message: 'Invalid URL "http://dzo.lh/sync.php?run=ksdjfgnsaerhtoiaerhg"'
    };

    present("Ctrl+Alt+3", stack, outcome, settings, makeRedactor(secrets));

    expect(toastText()).toContain(MASK);
    expect(toastText()).not.toContain("ksdjfgnsaerhtoiaerhg");
  });
});

describe("makeRedactor", () => {
  it("masks a secret that a step note embedded", () => {
    const redact = makeRedactor({ runToken: "ksdjfgnsaerhtoiaerhg" });

    expect(redact("opened http://dzo.lh/sync.php?run=ksdjfgnsaerhtoiaerhg&type=tenders")).toBe(
      `opened http://dzo.lh/sync.php?run=${MASK}&type=tenders`
    );
  });

  it("masks the percent-encoded spelling too, since openUrl encodes values", () => {
    const secret = "a b&c";
    const redact = makeRedactor({ runToken: secret });

    // What actually lands in the URL is the encoded form.
    expect(redact(`opened http://x/?run=${encodeURIComponent(secret)}`)).toBe(
      `opened http://x/?run=${MASK}`
    );
  });

  it("masks a secret containing regex metacharacters", () => {
    const redact = makeRedactor({ t: "a.*b+c" });
    expect(redact("run=a.*b+c")).toBe(`run=${MASK}`);
    expect(redact("run=aXXXbc")).toBe("run=aXXXbc"); // not treated as a pattern
  });

  it("masks the longest match when one secret contains another", () => {
    const redact = makeRedactor({ short: "abc", long: "abc123" });
    expect(redact("run=abc123")).toBe(`run=${MASK}`);
  });

  it("ignores empty secret values, which would otherwise match everywhere", () => {
    const redact = makeRedactor({ blank: "" });
    expect(redact("nothing to hide")).toBe("nothing to hide");
  });

  it("is a no-op when no secrets are configured", () => {
    const redact = makeRedactor({});
    expect(redact("opened http://dzo.lh/sync.php")).toBe("opened http://dzo.lh/sync.php");
  });
});
