import { describe, it, expect, beforeEach } from "vitest";
import { showPopup } from "../src/ui/popup";

function getPanel(): HTMLElement | null {
  const host = document.getElementById("keystack-popup-host");
  return host?.shadowRoot?.querySelector(".panel") ?? null;
}

function getBackdrop(): HTMLElement | null {
  const host = document.getElementById("keystack-popup-host");
  return host?.shadowRoot?.querySelector(".backdrop") ?? null;
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

beforeEach(() => {
  // Leave no popup open between tests — each one closes what it opened.
  pressEscape();
  document.body.innerHTML = "";
});

describe("showPopup", () => {
  it("renders the title and body inside a shadow root, not into the page", async () => {
    const closed = showPopup("Keystack hotkeys", "Ctrl+Alt+1  Copy Tender");
    const panel = getPanel()!;
    expect(panel.querySelector(".title")!.textContent).toBe("Keystack hotkeys");
    expect(panel.querySelector(".body")!.textContent).toBe("Ctrl+Alt+1  Copy Tender");
    expect(document.body.textContent).toBe(""); // nothing leaked into the page DOM
    pressEscape();
    await closed;
  });

  it("ESC closes it and resolves the promise", async () => {
    const closed = showPopup("T", "B");
    expect(getPanel()).not.toBeNull();
    pressEscape();
    await closed;
    expect(getPanel()).toBeNull();
  });

  it("swallows the ESC that closed it, so the page's own handler does not fire", async () => {
    let pageSawEscape = false;
    const pageHandler = () => {
      pageSawEscape = true;
    };
    document.addEventListener("keydown", pageHandler); // bubble phase, like a page's own
    const closed = showPopup("T", "B");
    pressEscape();
    await closed;
    document.removeEventListener("keydown", pageHandler);
    expect(pageSawEscape).toBe(false);
  });

  it("a click on the backdrop closes it; a click inside the panel does not", async () => {
    const closed = showPopup("T", "B");
    getPanel()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(getPanel()).not.toBeNull();
    getBackdrop()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await closed;
    expect(getPanel()).toBeNull();
  });

  it("closing twice is harmless — the second ESC is a no-op", async () => {
    const closed = showPopup("T", "B");
    pressEscape();
    await closed;
    expect(() => pressEscape()).not.toThrow();
    expect(getPanel()).toBeNull();
  });

  it("a second popup replaces the first and resolves its promise", async () => {
    const first = showPopup("First", "1");
    const second = showPopup("Second", "2");
    await first; // opening the second closed it
    const host = document.getElementById("keystack-popup-host")!;
    expect(host.shadowRoot!.querySelectorAll(".backdrop").length).toBe(1);
    expect(getPanel()!.querySelector(".title")!.textContent).toBe("Second");
    pressEscape();
    await second;
  });
});
