import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runStack, StepError } from "../src/content/runner";
import type { Stack, Step } from "../src/core/schema";
import { SAVE_RESUME_MESSAGE_TYPE, type ResumeRecord } from "../src/background/protocol";

// The suspend path messages the worker through background/client.ts, so
// stubbing sendMessage is enough — same seam as openUrlInCurrentTab.test.ts.
let sendMessage: ReturnType<typeof vi.fn>;

function savedRecord(): ResumeRecord | undefined {
  return sendMessage.mock.calls.find((c) => c[0]?.type === SAVE_RESUME_MESSAGE_TYPE)?.[0].record;
}

function stackOf(...steps: Step[]): Stack {
  return {
    id: "login",
    name: "Log in",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps
  };
}

const click = (selector: string, navigates?: boolean): Step => ({
  id: "s1",
  type: "clickBySelector",
  selector,
  ...(navigates === undefined ? {} : { navigates })
});

beforeEach(() => {
  document.body.innerHTML = `<button id="submit">Send</button><input id="after" value="" />`;
  sendMessage = vi.fn().mockResolvedValue({});
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("clickBySelector", () => {
  it("clicks the element the selector matches", async () => {
    const onClick = vi.fn();
    document.querySelector("#submit")!.addEventListener("click", onClick);

    const notes = await runStack(stackOf(click("#submit")));

    expect(onClick).toHaveBeenCalledOnce();
    expect(notes).toEqual(['clicked "#submit"']);
  });

  it("dispatches a bubbling click, so delegated handlers see it", async () => {
    // This is what makes it work on React, whose listener sits at the root
    // container rather than on the button itself.
    const onDocument = vi.fn();
    document.addEventListener("click", onDocument);

    await runStack(stackOf(click("#submit")));

    expect(onDocument).toHaveBeenCalledOnce();
    expect(onDocument.mock.calls[0][0].target).toBe(document.querySelector("#submit"));
    document.removeEventListener("click", onDocument);
  });

  it("fails the step when nothing matches, rather than clicking nothing", async () => {
    const onDocument = vi.fn();
    document.addEventListener("click", onDocument);

    const err = await runStack(stackOf(click("#nope"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('No element for "#nope"');
    expect(onDocument).not.toHaveBeenCalled();
    document.removeEventListener("click", onDocument);
  });

  it("keeps running the stack when the click does not navigate", async () => {
    const stack = stackOf(click("#submit"), {
      id: "s2",
      type: "inputToSelector",
      selector: "#after",
      value: "ran"
    });

    const notes = await runStack(stack);

    expect(document.querySelector<HTMLInputElement>("#after")!.value).toBe("ran");
    expect(notes).toHaveLength(2);
    expect(savedRecord()).toBeUndefined(); // nothing parked — nobody is leaving
  });

  describe("when declared navigates: true", () => {
    const navigatingStack = () =>
      stackOf(click("#submit", true), {
        id: "s2",
        type: "inputToSelector",
        selector: "#after",
        value: "ran"
      });

    it("parks the rest of the stack for the page the click leads to", async () => {
      await runStack(navigatingStack());

      const record = savedRecord()!;
      expect(record.stackId).toBe("login");
      expect(record.nextStep).toBe(1);
      expect(record.expiresAt).toBeGreaterThan(Date.now());
    });

    it("does not run the following steps in this page", async () => {
      await runStack(navigatingStack());

      expect(document.querySelector<HTMLInputElement>("#after")!.value).toBe("");
    });

    it("parks before the click fires, not after", async () => {
      const order: string[] = [];
      sendMessage.mockImplementation(async () => {
        order.push("parked");
        return {};
      });
      document.querySelector("#submit")!.addEventListener("click", () => order.push("clicked"));

      await runStack(navigatingStack());

      // A submit starts navigating as soon as the task yields, so a save
      // placed after the click would be racing the unload.
      expect(order).toEqual(["parked", "clicked"]);
    });

    it("parks nothing when it is the last step — there is nothing to resume", async () => {
      await runStack(stackOf(click("#submit", true)));

      expect(savedRecord()).toBeUndefined();
    });

    it("still clicks — the flag changes bookkeeping, not behaviour", async () => {
      const onClick = vi.fn();
      document.querySelector("#submit")!.addEventListener("click", onClick);

      await runStack(navigatingStack());

      expect(onClick).toHaveBeenCalledOnce();
    });
  });
});
