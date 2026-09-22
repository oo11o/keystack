import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runStack, StepError } from "../src/content/runner";
import type { Stack, Step } from "../src/core/schema";

function stackOf(...steps: Step[]): Stack {
  return {
    id: "login",
    name: "Log in",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps
  };
}

const click = (selector: string): Step => ({ id: "s1", type: "clickBySelector", selector });

beforeEach(() => {
  document.body.innerHTML = `<button id="submit">Send</button><input id="after" value="" />`;
});

afterEach(() => {
  vi.restoreAllMocks();
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
  });

});
