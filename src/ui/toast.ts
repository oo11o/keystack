import type { ToastVerbosity } from "../core/schema";

// The result of one runStack() call, in a shape the UI can render without
// needing to know about StepError or the run context.
export type RunOutcome =
  | { ok: true; notes: string[] }
  | { ok: false; notes: string[]; stepIndex: number; stepType: string; message: string };

// A page's own CSS can otherwise leak into (or override) an injected element —
// e.g. a site with `div { color: red !important }` would clobber a plain div
// toast. Shadow DOM isolates the toast's styles from the page in both
// directions. Created lazily and reused for the life of the page; the host
// itself is still a light-DOM node, so it can't be made fully immune to a
// page that resets *all* elements, but that's a much rarer case than
// ordinary CSS leakage.
//
// Only the latest toast is ever shown — showToast() clears #container before
// appending, so a new hotkey result always replaces whatever was there,
// pinned or not.
let toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
  if (toastContainer) return toastContainer;
  const host = document.createElement("div");
  host.id = "keystack-toast-host";
  document.documentElement.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    #container {
      position: fixed;
      top: 24px;
      left: 24px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      padding: 10px 16px;
      border-radius: 8px;
      font: 13px/1.4 -apple-system, system-ui, sans-serif;
      color: #fff;
      box-shadow: 0 4px 12px rgba(0, 0, 0, .25);
      max-width: 320px;
      word-break: break-word;
      cursor: pointer;
    }
    .toast.ok { background: #1a7f37; }
    .toast.err { background: #c62828; }
    .toast.pinned { box-shadow: 0 0 0 2px rgba(255, 255, 255, .7), 0 4px 12px rgba(0, 0, 0, .25); }
    .toast .chord {
      display: block;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: .02em;
    }
    .toast .detail {
      display: block;
      font-size: 12px;
      opacity: .85;
      white-space: pre-line;
    }
  `;
  shadowRoot.appendChild(style);

  toastContainer = document.createElement("div");
  toastContainer.id = "container";
  shadowRoot.appendChild(toastContainer);
  return toastContainer;
}

const TOAST_DURATION_MS = 3000;
const SEPARATOR = "-----------------------";

function numberList(items: string[]): string[] {
  return items.map((item, i) => `${i + 1}. ${item}`);
}

// detail lines: [0] is the title (stack name + status), then a blank line,
// then one line per step. white-space: pre-line on .detail renders the \n's.
function showToast(chord: string, detailLines: string[], ok: boolean) {
  const container = getToastContainer();
  container.replaceChildren(); // only the latest toast is ever shown, pinned or not

  const el = document.createElement("div");
  el.className = `toast ${ok ? "ok" : "err"}`;

  const chordEl = document.createElement("span");
  chordEl.className = "chord";
  chordEl.textContent = chord;

  const detailEl = document.createElement("span");
  detailEl.className = "detail";
  detailEl.textContent = detailLines.join("\n");

  el.append(chordEl, detailEl);
  container.appendChild(el);

  // Click once to pin (cancels auto-dismiss); click again to close it.
  let pinned = false;
  const timer = setTimeout(() => el.remove(), TOAST_DURATION_MS);
  el.addEventListener("click", () => {
    if (!pinned) {
      pinned = true;
      el.classList.add("pinned");
      clearTimeout(timer);
    } else {
      el.remove();
    }
  });
}

// "none": show nothing. "min": chord + stack name, plus the failure reason
// if it failed — no per-step detail. "max": full numbered step list, with a
// separator before the failing step on failure.
export function showResultToast(
  chord: string,
  stackName: string,
  outcome: RunOutcome,
  verbosity: ToastVerbosity
): void {
  if (verbosity === "none") return;

  if (verbosity === "min") {
    if (outcome.ok) {
      showToast(chord, [`✓ ${stackName}`], true);
    } else {
      showToast(chord, [`✗ ${stackName}: ${outcome.message}`], false);
    }
    return;
  }

  // max
  if (outcome.ok) {
    showToast(chord, [`✓ ${stackName}`, "", ...numberList(outcome.notes)], true);
  } else {
    const lines = numberList(outcome.notes);
    lines.push("", SEPARATOR, `${outcome.stepIndex + 1}. ✗ ${outcome.stepType}: ${outcome.message}`);
    showToast(chord, [`✗ ${stackName}`, "", ...lines], false);
  }
}
