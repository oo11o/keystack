import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runStack, StepError } from "../src/content/runner";
import type { Stack } from "../src/core/schema";

// jsdom refuses to let location.assign be redefined ("Cannot redefine
// property"), so the seam is the module boundary instead: navigateHere is
// replaced, while toHttpUrl/resolveHttpUrl stay real — they are the part
// under test here.
vi.mock("../src/page/navigate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/page/navigate")>();
  return { ...actual, navigateHere: vi.fn() };
});
import { navigateHere } from "../src/page/navigate";
import { SAVE_RESUME_MESSAGE_TYPE, type SaveResumeRequest } from "../src/background/protocol";
import { MASK } from "../src/core/redact";

const went = vi.mocked(navigateHere);

// The suspend path messages the worker through background/client.ts, so
// stubbing sendMessage is enough — see fetchUrl.test.ts for the same seam.
let sendMessage: ReturnType<typeof vi.fn>;

function savedRecord(): SaveResumeRequest["record"] | undefined {
  const call = sendMessage.mock.calls.find((c) => c[0]?.type === SAVE_RESUME_MESSAGE_TYPE);
  return call?.[0].record;
}

function visitedUrl(): string {
  return went.mock.calls[0][0];
}

function stackWith(url: string): Stack {
  return {
    id: "sync",
    name: "Sync Tender",
    binding: { code: "Digit3", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps: [
      { id: "s1", type: "readBySelector", selector: "#tender_id" },
      { id: "s2", type: "openUrlInCurrentTab", url }
    ]
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  went.mockClear();
  sendMessage = vi.fn().mockResolvedValue({});
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("openUrlInCurrentTab", () => {
  it("navigates this tab with $vars substituted from earlier steps", async () => {
    document.body.innerHTML = `<input id="tender_id" value="e3cf4bdd" />`;

    const notes = await runStack(stackWith("http://dzo.lh/cron/directSinhro.php?tender_id=$s1"));

    expect(went).toHaveBeenCalledOnce();
    expect(visitedUrl()).toBe("http://dzo.lh/cron/directSinhro.php?tender_id=e3cf4bdd");
    expect(notes).toEqual(['read "e3cf4bdd"', "went to http://dzo.lh/cron/directSinhro.php?tender_id=e3cf4bdd"]);
  });

  it("percent-encodes the substituted value so it cannot inject a query parameter", async () => {
    document.body.innerHTML = `<input id="tender_id" value="abc&run=evil" />`;

    await runStack(stackWith("http://dzo.lh/sync.php?tender_id=$s1&type=tenders"));

    expect(visitedUrl()).toBe("http://dzo.lh/sync.php?tender_id=abc%26run%3Devil&type=tenders");
  });

  it("resolves a relative URL against the current page", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-7" />`;

    await runStack(stackWith("/cron/directSinhro.php?tender_id=$s1"));

    expect(visitedUrl()).toBe(`${location.origin}/cron/directSinhro.php?tender_id=T-7`);
  });

  it("refuses a non-http scheme instead of navigating to it", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;

    const err = await runStack(stackWith("javascript:alert(1)")).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/only http\/https/);
    expect(went).not.toHaveBeenCalled();
  });

  it("does not run the rest of the stack in this page — it suspends it", async () => {
    document.body.innerHTML = `
      <input id="tender_id" value="T-42" />
      <input id="after" value="" />`;
    const stack = stackWith("http://dzo.lh/sync.php?id=$s1");
    stack.steps.push({ id: "s3", type: "inputToSelector", selector: "#after", value: "$s1" });

    const notes = await runStack(stack);

    expect(went).toHaveBeenCalledOnce();
    expect(notes).toHaveLength(2); // the read and the navigation, not the fill
    expect(document.querySelector<HTMLInputElement>("#after")!.value).toBe("");
  });

  it("parks the rest of the stack for the next page, with its vars and notes", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;
    const stack = stackWith("http://dzo.lh/sync.php?id=$s1");
    stack.steps.push({ id: "s3", type: "popup", body: "$s1" });

    await runStack(stack);

    const record = savedRecord()!;
    expect(record.stackId).toBe("sync");
    expect(record.nextStep).toBe(2); // s3, the step that has not run
    expect(record.notes).toEqual(['read "T-42"', "went to http://dzo.lh/sync.php?id=T-42"]);
    expect(Object.fromEntries(record.vars)).toEqual({ value: "T-42", s1: "T-42" });
    expect(record.expiresAt).toBeGreaterThan(Date.now());
  });

  it("saves the record before navigating, not after", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;
    const stack = stackWith("http://dzo.lh/sync.php?id=$s1");
    stack.steps.push({ id: "s3", type: "popup", body: "done" });
    const order: string[] = [];
    sendMessage.mockImplementation(async () => {
      order.push("saved");
      return {};
    });
    went.mockImplementation(() => {
      order.push("navigated");
    });

    await runStack(stack);

    // Once location.assign runs there is no guarantee another await ever
    // resolves, so a save that came second could simply never arrive.
    expect(order).toEqual(["saved", "navigated"]);
  });

  it("parks nothing when it is the last step — there is nothing to resume", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;

    await runStack(stackWith("http://dzo.lh/sync.php?id=$s1"));

    expect(went).toHaveBeenCalledOnce();
    expect(savedRecord()).toBeUndefined();
  });

  it("never parks a secret — they are re-seeded on the other side", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`;
    const stack = stackWith("http://dzo.lh/sync.php?id=$s1&run=$secret_runToken");
    stack.steps.push({ id: "s3", type: "popup", body: "done" });

    await runStack(stack, [stack], { runToken: "hunter2" });

    const names = savedRecord()!.vars.map(([name]) => name);
    expect(names).not.toContain("secret_runToken");
    // Not in the vars, and not smuggled through a note either — the note
    // for this step is literally "went to ...&run=hunter2".
    expect(JSON.stringify(savedRecord())).not.toContain("hunter2");
    expect(savedRecord()!.notes[1]).toContain(MASK);
  });
});
