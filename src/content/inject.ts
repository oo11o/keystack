import type { Config, Stack, Step } from "../core/schema";
import { matches, formatBinding } from "../core/keys";
import { MAX_VARS, type RunContext } from "../core/context";
import { handlers } from "./steps";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

async function loadConfig(): Promise<Config> {
  const url = chrome.runtime.getURL("config/stacks.json");
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

// A page's own CSS can otherwise leak into (or override) an injected element —
// e.g. a site with `div { color: red !important }` would clobber a plain div
// toast. Shadow DOM isolates the toast's styles from the page in both
// directions. Created lazily and reused for the life of the page; the host
// itself is still a light-DOM node, so it can't be made fully immune to a
// page that resets *all* elements, but that's a much rarer case than
// ordinary CSS leakage.
let toastRoot: ShadowRoot | null = null;

function getToastRoot(): ShadowRoot {
  if (toastRoot) return toastRoot;
  const host = document.createElement("div");
  host.id = "keystack-toast-host";
  document.documentElement.appendChild(host);

  toastRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .toast {
      position: fixed;
      top: 24px;
      left: 24px;
      z-index: 2147483647;
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
  toastRoot.appendChild(style);
  return toastRoot;
}

const TOAST_DURATION_MS = 3000;
const SEPARATOR = "-----------------------";

// detail lines: [0] is the title (stack name + status), then a blank line,
// then one line per step. white-space: pre-line on .detail renders the \n's.
function showToast(chord: string, detailLines: string[], ok: boolean) {
  const el = document.createElement("div");
  el.className = `toast ${ok ? "ok" : "err"}`;

  const chordEl = document.createElement("span");
  chordEl.className = "chord";
  chordEl.textContent = chord;

  const detailEl = document.createElement("span");
  detailEl.className = "detail";
  detailEl.textContent = detailLines.join("\n");

  el.append(chordEl, detailEl);
  getToastRoot().appendChild(el);

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

// Thrown by runStack on failure so the caller can render the steps that
// already succeeded alongside the one that broke, instead of losing that
// progress behind a single error message.
export class StepError extends Error {
  constructor(
    message: string,
    public readonly notes: string[], // notes from steps before the failure
    public readonly stepIndex: number,
    public readonly step: Step
  ) {
    super(message);
  }
}

// The context is created here and dies with this function — no global
// store, so a value cannot leak between runs or between stacks.
// Returns one note per step that reported something, in run order.
export async function runStack(stack: Stack): Promise<string[]> {
  const ctx: RunContext = new Map();
  const notes: string[] = [];
  try {
    for (let i = 0; i < stack.steps.length; i++) {
      const step = stack.steps[i];
      try {
        const handler = handlers[step.type];
        if (!handler) throw new Error(`Unknown step type "${step.type}"`);
        const { value, note } = await handler(step, ctx);
        if (value !== undefined) {
          if (ctx.size >= MAX_VARS) throw new Error(`too many variables (max ${MAX_VARS})`);
          ctx.set("value", value);
          ctx.set(step.id, value); // every producer is reachable as $<its own id>, free of charge
          if ("saveAs" in step && step.saveAs) ctx.set(step.saveAs, value);
        }
        if (note) notes.push(note);
      } catch (err) {
        throw new StepError((err as Error).message, [...notes], i, step);
      }
    }
    return notes;
  } finally {
    ctx.clear();
  }
}

document.addEventListener(
  "keydown",
  async (e) => {
    if (isTypingTarget(e.target)) return;

    let config: Config;
    try {
      config = await loadConfig();
    } catch (err) {
      // Config missing/unreachable — nothing to match against.
      return;
    }

    const stack = config.stacks.find((s) => s.enabled && matches(e, s.binding));
    if (!stack) return;

    e.preventDefault();
    e.stopPropagation();

    const chord = formatBinding(stack.binding);
    console.log(`[Keystack] ${chord} → "${stack.name}" (${stack.id})`);

    try {
      const notes = await runStack(stack);
      const lines = notes.map((note, i) => `${i + 1}. ${note}`);
      showToast(chord, [`✓ ${stack.name}`, "", ...lines], true);
    } catch (err) {
      if (err instanceof StepError) {
        const lines = err.notes.map((note, i) => `${i + 1}. ${note}`);
        lines.push("", SEPARATOR, `${err.stepIndex + 1}. ✗ ${err.step.type}: ${err.message}`);
        showToast(chord, [`✗ ${stack.name}`, "", ...lines], false);
      } else {
        showToast(chord, [`✗ ${stack.name}`, "", (err as Error).message], false);
      }
    }
  },
  true
);
