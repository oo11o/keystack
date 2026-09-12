import type { Config } from "../core/schema";
import { formatBinding } from "../core/keys";
import { describeStep } from "./format";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function loadConfig(): Promise<Config> {
  const url = chrome.runtime.getURL("config/stacks.json");
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

function render(config: Config) {
  const list = document.getElementById("list")!;

  if (config.stacks.length === 0) {
    list.innerHTML = `<div class="empty">No stacks configured.</div>`;
    return;
  }

  list.innerHTML = config.stacks
    .map((stack) => {
      const chord = escapeHtml(formatBinding(stack.binding));
      const steps = stack.steps
        .map((step) => `<li><code>${escapeHtml(describeStep(step))}</code></li>`)
        .join("");
      return `
        <div class="stack${stack.enabled ? "" : " disabled"}">
          <div class="stack-header">
            <span class="chord">${chord}</span>
            <span class="stack-name">${escapeHtml(stack.name)}</span>
            ${stack.enabled ? "" : '<span class="badge">disabled</span>'}
          </div>
          <ol class="steps">${steps}</ol>
        </div>
      `;
    })
    .join("");
}

loadConfig()
  .then(render)
  .catch((err) => {
    document.getElementById("list")!.innerHTML =
      `<div class="empty">Could not load config/stacks.json: ${(err as Error).message}</div>`;
  });
