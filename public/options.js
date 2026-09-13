// Plain JS on purpose: public/ is copied to dist/ verbatim by Vite, and the
// content script is bundled as a single IIFE — Rollup can't emit a second
// IIFE entry from the same build. This file is small and standalone enough
// not to justify a second build pipeline. Extension pages forbid inline
// <script>, hence a separate file rather than a tag in options.html.

const rowsEl = document.getElementById("rows");
const statusEl = document.getElementById("status");

function addRow(name = "", value = "") {
  const row = document.createElement("div");
  row.className = "row";

  const nameEl = document.createElement("input");
  nameEl.className = "name";
  nameEl.placeholder = "runToken";
  nameEl.value = name;

  const valueEl = document.createElement("input");
  valueEl.className = "value";
  valueEl.placeholder = "value";
  valueEl.value = value;

  const removeEl = document.createElement("button");
  removeEl.textContent = "✕";
  removeEl.title = "Remove";
  removeEl.addEventListener("click", () => row.remove());

  row.append(nameEl, valueEl, removeEl);
  rowsEl.appendChild(row);
}

function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.className = isError ? "error" : "";
  if (text) setTimeout(() => (statusEl.textContent = ""), 2000);
}

async function load() {
  const { secrets } = await chrome.storage.local.get("secrets");
  const entries = Object.entries(secrets ?? {});
  if (entries.length === 0) addRow();
  else for (const [name, value] of entries) addRow(name, value);
}

async function save() {
  const secrets = {};
  for (const row of rowsEl.querySelectorAll(".row")) {
    const name = row.querySelector(".name").value.trim();
    const value = row.querySelector(".value").value;
    if (!name) continue; // a blank name is an unfilled row, not an error
    // $secret_<name> is resolved by the \w+ in core/context.ts's template
    // regex, so anything outside [A-Za-z0-9_] could never be referenced.
    if (!/^\w+$/.test(name)) {
      setStatus(`"${name}" must use letters, digits, or _ only`, true);
      return;
    }
    secrets[name] = value;
  }
  await chrome.storage.local.set({ secrets });
  setStatus("Saved", false);
}

document.getElementById("add").addEventListener("click", () => addRow());
document.getElementById("save").addEventListener("click", save);
load();
