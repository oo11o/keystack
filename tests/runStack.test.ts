import { describe, it, expect, beforeEach } from "vitest";
import { runStack, StepError } from "../src/content/inject";
import type { Stack } from "../src/core/schema";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("runStack — $<step.id> auto-binding", () => {
  it("makes a producer's value reachable as $<its own id>, with no saveAs", () => {
    document.body.innerHTML = `
      <input id="tender_id" value="T-42" />
      <input id="search" />
    `;
    const stack: Stack = {
      id: "sync",
      name: "Sync",
      binding: { code: "Digit2", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [
        { id: "s1", type: "readBySelector", selector: "#tender_id" },
        { id: "s2", type: "inputToSelector", selector: "#search", value: "$s1" }
      ]
    };

    return runStack(stack).then(() => {
      const search = document.querySelector<HTMLInputElement>("#search")!;
      expect(search.value).toBe("T-42");
    });
  });

  it("still supports $value as the shorthand for the last produced value", () => {
    document.body.innerHTML = `
      <input id="tender_id" value="T-99" />
      <input id="search" />
    `;
    const stack: Stack = {
      id: "sync2",
      name: "Sync2",
      binding: { code: "Digit3", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [
        { id: "s1", type: "readBySelector", selector: "#tender_id" },
        { id: "s2", type: "inputToSelector", selector: "#search", value: "$value" }
      ]
    };

    return runStack(stack).then(() => {
      const search = document.querySelector<HTMLInputElement>("#search")!;
      expect(search.value).toBe("T-99");
    });
  });

  it("clears the context after the run — a later stack cannot see $s1", async () => {
    document.body.innerHTML = `<input id="a" value="X" />`;
    const producer: Stack = {
      id: "p",
      name: "Producer",
      binding: { code: "Digit4", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "readBySelector", selector: "#a" }]
    };
    const consumer: Stack = {
      id: "c",
      name: "Consumer",
      binding: { code: "Digit5", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s2", type: "inputToSelector", selector: "#a", value: "$s1" }]
    };

    await runStack(producer);
    await expect(runStack(consumer)).rejects.toThrow('unknown variable "$s1"');
  });

  it("on failure, reports the notes from steps that already succeeded plus which step broke", async () => {
    document.body.innerHTML = `<input id="tender_id" value="T-42" />`; // #search is missing
    const stack: Stack = {
      id: "sync",
      name: "Sync",
      binding: { code: "Digit2", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [
        { id: "s1", type: "readBySelector", selector: "#tender_id" },
        { id: "s2", type: "inputToSelector", selector: "#search", value: "$s1" }
      ]
    };

    try {
      await runStack(stack);
      expect.unreachable("expected runStack to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(StepError);
      const stepErr = err as StepError;
      expect(stepErr.notes).toEqual(['read "T-42"']); // step 1 succeeded
      expect(stepErr.stepIndex).toBe(1); // step 2 (0-indexed) is the one that broke
      expect(stepErr.step.type).toBe("inputToSelector");
      expect(stepErr.message).toMatch(/No element for "#search"/);
    }
  });
});
