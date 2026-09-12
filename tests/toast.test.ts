import { describe, it, expect } from "vitest";
import { showResultToast } from "../src/ui/toast";

function getToastEl(): HTMLElement {
  const host = document.getElementById("keystack-toast-host")!;
  const container = host.shadowRoot!.getElementById("container")!;
  return container.firstElementChild as HTMLElement;
}

describe("showResultToast", () => {
  it("min: success shows chord + name only, no step list", () => {
    showResultToast("Ctrl+Alt+1", "Stack", { ok: true, notes: ["did x"] }, "min");
    const el = getToastEl();
    expect(el.querySelector(".chord")!.textContent).toBe("Ctrl+Alt+1");
    expect(el.querySelector(".detail")!.textContent).toBe("✓ Stack");
  });

  it("min: failure shows chord + name + reason, no step list", () => {
    showResultToast(
      "Ctrl+Alt+2",
      "Stack",
      { ok: false, notes: ["did x"], stepIndex: 1, stepType: "inputToSelector", message: "boom" },
      "min"
    );
    const el = getToastEl();
    expect(el.querySelector(".detail")!.textContent).toBe("✗ Stack: boom");
  });

  it("max: success shows a numbered step list", () => {
    showResultToast("Ctrl+Alt+3", "Stack", { ok: true, notes: ["a", "b"] }, "max");
    const el = getToastEl();
    expect(el.querySelector(".detail")!.textContent).toBe("✓ Stack\n\n1. a\n2. b");
  });

  it("max: failure shows completed steps, a separator, then the failing step", () => {
    showResultToast(
      "Ctrl+Alt+4",
      "Stack",
      { ok: false, notes: ["a"], stepIndex: 1, stepType: "inputToSelector", message: "boom" },
      "max"
    );
    const el = getToastEl();
    expect(el.querySelector(".detail")!.textContent).toBe(
      "✗ Stack\n\n1. a\n\n-----------------------\n2. ✗ inputToSelector: boom"
    );
  });

  it("none: leaves whatever toast is showing untouched", () => {
    showResultToast("Ctrl+Alt+3", "Stack", { ok: true, notes: ["a", "b"] }, "max");
    const before = getToastEl().querySelector(".detail")!.textContent;

    showResultToast("Ctrl+Alt+5", "Different", { ok: true, notes: ["z"] }, "none");
    const after = getToastEl().querySelector(".detail")!.textContent;

    expect(after).toBe(before);
  });
});
