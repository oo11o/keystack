// A lightweight "working" indicator for a step that takes a moment (a
// background fetch) and would otherwise leave the screen blank until it
// resolves. Distinct from the toast/popup — this only ever says "in
// progress", never a result — and the caller hides it once the step is done,
// success or failure alike.

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;

function getRoot(): ShadowRoot {
  if (root) return root;
  host = document.createElement("div");
  host.id = "keystack-spinner-host";
  document.documentElement.appendChild(host);

  root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .spinner {
      position: fixed;
      top: 24px;
      left: 24px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border-radius: 8px;
      background: #1f2328;
      color: #fff;
      font: 13px/1.4 -apple-system, system-ui, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, .25);
    }
    .dot {
      flex: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, .3);
      border-top-color: #fff;
      animation: keystack-spin .7s linear infinite;
    }
    @keyframes keystack-spin { to { transform: rotate(360deg); } }
  `;
  root.appendChild(style);
  return root;
}

// Shows the indicator and returns a function that hides it. Only one is
// ever on screen — showing a second while the first is up replaces it, the
// same "latest wins" rule the toast follows.
export function showSpinner(text: string): () => void {
  const r = getRoot();
  r.querySelector(".spinner")?.remove();

  const el = document.createElement("div");
  el.className = "spinner";
  const dot = document.createElement("span");
  dot.className = "dot";
  const label = document.createElement("span");
  label.textContent = text;
  el.append(dot, label);
  r.appendChild(el);

  let hidden = false;
  return () => {
    if (hidden) return; // safe to call more than once (e.g. finally + an early return)
    hidden = true;
    el.remove();
  };
}
