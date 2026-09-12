import type { Config, Stack } from "../core/schema";
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

function showToast(message: string, ok: boolean) {
  const el = document.createElement("div");
  el.textContent = message;
  el.setAttribute(
    "style",
    [
      "position:fixed", "top:24px", "left:24px", "z-index:2147483647",
      "padding:10px 16px", "border-radius:8px", "font:13px/1.4 -apple-system,system-ui,sans-serif",
      "color:#fff", "box-shadow:0 4px 12px rgba(0,0,0,.25)",
      "max-width:320px", "word-break:break-word",
      `background:${ok ? "#1a7f37" : "#c62828"}`
    ].join(";")
  );
  document.documentElement.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// The context is created here and dies with this function — no global
// store, so a value cannot leak between runs or between stacks.
export async function runStack(stack: Stack): Promise<string> {
  const ctx: RunContext = new Map();
  const notes: string[] = [];
  try {
    for (const step of stack.steps) {
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
    }
    return notes.join("; ");
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
      const summary = await runStack(stack);
      showToast(`✓ ${chord} → ${stack.name}: ${summary}`, true);
    } catch (err) {
      showToast(`✗ ${chord} → ${stack.name}: ${(err as Error).message}`, false);
    }
  },
  true
);
