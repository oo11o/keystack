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

function getFilter(): HTMLInputElement | null {
  return getPanel()?.querySelector(".filter") ?? null;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

describe("showPopup with { filter: true }", () => {
  const BODY = ['{', '  "status": "active",', '  "title": "Tender",', '}'].join("\n");

  it("adds no filter box unless the option is set", async () => {
    const closed = showPopup("T", BODY);
    expect(getFilter()).toBeNull();
    expect(getPanel()!.querySelector(".foot")!.textContent).toBe("esc to close");
    pressEscape();
    await closed;
  });

  it("focuses the filter box so you can type immediately", async () => {
    const closed = showPopup("T", BODY, { filter: true });
    const filter = getFilter()!;
    expect(filter).not.toBeNull();
    expect(getPanel()!.getRootNode() as ShadowRoot).toHaveProperty("activeElement", filter);
    pressEscape();
    await closed;
  });

  it("leaves the body whole at two characters, and narrows at three", async () => {
    const closed = showPopup("T", BODY, { filter: true });
    const filter = getFilter()!;
    const body = () => getPanel()!.querySelector(".body")!.textContent;
    const foot = () => getPanel()!.querySelector(".foot")!.textContent;

    type(filter, "st");
    expect(body()).toBe(BODY);
    expect(foot()).toBe("esc to close"); // no count while filtering is off

    type(filter, "sta");
    // Rendered as elements, so the path can be dimmed apart from the payload.
    const panel = getPanel()!;
    expect(panel.querySelector(".path")!.textContent).toBe("* status");
    expect(panel.querySelector(".hit")!.textContent).toBe('"status": "active",');
    expect(foot()).toBe("1 of 4 lines · esc to close");

    pressEscape();
    await closed;
  });

  it("puts a separator between hits, but not before the first", async () => {
    // Two matches with an unmatched line between them, so they are two hits.
    const gapped = ['{', '  "alpha": 1,', '  "middle": 2,', '  "alpha2": 3', '}'].join("\n");
    const closed = showPopup("T", gapped, { filter: true });
    type(getFilter()!, "alpha");
    const panel = getPanel()!;
    expect(panel.querySelectorAll(".hit").length).toBe(2);
    expect(panel.querySelectorAll(".sep").length).toBe(1);
    expect(panel.querySelector(".body")!.firstElementChild!.className).toBe("path");
    pressEscape();
    await closed;
  });

  it("restores the full body when the filter is cleared", async () => {
    const closed = showPopup("T", BODY, { filter: true });
    const filter = getFilter()!;
    type(filter, "status");
    expect(getPanel()!.querySelector(".body")!.textContent).not.toBe(BODY);
    type(filter, "");
    expect(getPanel()!.querySelector(".body")!.textContent).toBe(BODY);
    pressEscape();
    await closed;
  });

  it("shows an empty body rather than an error when nothing matches", async () => {
    const closed = showPopup("T", BODY, { filter: true });
    type(getFilter()!, "no-such-field");
    expect(getPanel()!.querySelector(".body")!.textContent).toBe("");
    expect(getPanel()!.querySelector(".foot")!.textContent).toBe("0 of 4 lines · esc to close");
    pressEscape();
    await closed;
  });

  it("still closes on ESC while the filter box has focus", async () => {
    const closed = showPopup("T", BODY, { filter: true });
    type(getFilter()!, "status");
    pressEscape();
    await closed;
    expect(getPanel()).toBeNull();
  });
});
