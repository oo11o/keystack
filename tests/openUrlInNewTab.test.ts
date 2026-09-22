import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runStack, StepError } from "../src/content/runner";
import type { Stack } from "../src/core/schema";

// jsdom's window.open is a no-op that returns null — which is exactly what a
// blocked popup looks like — so every test stubs it explicitly.
let open: ReturnType<typeof vi.spyOn>;

function stubOpen(result: unknown = {}) {
  open = vi.spyOn(window, "open").mockReturnValue(result as Window);
}

function openedUrl(): string {
  return open.mock.calls[0][0] as string;
}

function stackWith(url: string, selector = "#tender_id"): Stack {
  return {
    id: "sync",
    name: "Sync Tender",
    binding: { code: "Digit3", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps: [
      { id: "s1", type: "readBySelector", selector },
      { id: "s2", type: "openUrlInNewTab", url }
    ]
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  stubOpen();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openUrlInNewTab", () => {
  it("opens a new tab with $vars substituted from earlier steps", async () => {
    document.body.innerHTML = `<input id="tender_id" value="e3cf4bdd" />`;

    await runStack(stackWith("http://dzo.lh/cron/directSinhro.php?tender_id=$s1&type=tenders"));

    expect(open).toHaveBeenCalledOnce();
    expect(openedUrl()).toBe("http://dzo.lh/cron/directSinhro.php?tender_id=e3cf4bdd&type=tenders");
    expect(open.mock.calls[0][1]).toBe("_blank");
  });

  it("percent-encodes the substituted value so it cannot inject a query parameter", async () => {
    document.body.innerHTML = `<input id="tender_id" value="abc&run=evil" />`;

    await runStack(stackWith("http://dzo.lh/sync.php?tender_id=$s1&type=tenders"));

    expect(openedUrl()).toBe("http://dzo.lh/sync.php?tender_id=abc%26run%3Devil&type=tenders");
  });

  it("leaves the separators the stack author typed in the template alone", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;

    await runStack(stackWith("http://dzo.lh/sync.php?a=1&b=2&tender_id=$s1"));

    // The literal &s stay separators; only the value is encoded.
    expect(openedUrl()).toBe("http://dzo.lh/sync.php?a=1&b=2&tender_id=T-42");
  });

  it("resolves a relative URL against the current page", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-7" />`;

    await runStack(stackWith("/cron/directSinhro.php?tender_id=$s1"));

    expect(openedUrl()).toBe(`${location.origin}/cron/directSinhro.php?tender_id=T-7`);
  });

  it("treats $$ as a literal $ rather than encoding it", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-1" />`;

    await runStack(stackWith("http://dzo.lh/sync.php?cost=$$5&id=$s1"));

    expect(openedUrl()).toBe("http://dzo.lh/sync.php?cost=$5&id=T-1");
  });

  it("fails the step when the browser blocks the new tab", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;
    stubOpen(null); // what window.open returns when the popup blocker fires

    const err = await runStack(stackWith("http://dzo.lh/sync.php?id=$s1")).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/blocked the new tab/);
    expect(err.stepIndex).toBe(1);
    expect(err.notes).toEqual(['read "T-42"']); // the read before it still reported
  });

  it("refuses a non-http scheme instead of opening it", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;

    const err = await runStack(stackWith("javascript:alert(1)")).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/only http\/https/);
    expect(open).not.toHaveBeenCalled();
  });

  it("cannot be steered to another origin by a value read off the page", async () => {
    // An encoded value stays inside the query string — it cannot close it and
    // start a new URL.
    document.body.innerHTML = `<input id="tender_id" value="x@evil.com/" />`;

    await runStack(stackWith("http://dzo.lh/sync.php?id=$s1"));

    expect(new URL(openedUrl()).host).toBe("dzo.lh");
  });

  it("reports an unknown variable instead of opening a broken URL", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;

    const err = await runStack(stackWith("http://dzo.lh/sync.php?id=$nope")).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/unknown variable "\$nope"/);
    expect(open).not.toHaveBeenCalled();
  });
});
