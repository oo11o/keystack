import type { Config } from "../core/schema";
import { matches } from "../core/keys";
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

    try {
      let lastResult = "";
      for (const step of stack.steps) {
        const handler = handlers[step.type];
        if (!handler) throw new Error(`Unknown step type "${step.type}"`);
        lastResult = await handler(step);
      }
      showToast(`✓ ${stack.name}: copied "${lastResult}"`, true);
    } catch (err) {
      showToast(`✗ ${stack.name}: ${(err as Error).message}`, false);
    }
  },
  true
);
