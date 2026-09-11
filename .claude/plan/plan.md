# Keystack — minimal v0: one hotkey, one action

## Context

`/Users/admin/Web/hotkey_plugin` is empty. **Keystack** will eventually bind hotkeys to chains of
web actions, but this plan is deliberately the smallest thing that runs: **press `⌃⌥1` → copy the
text of a CSS selector to the clipboard.** One action, config in JSON, something to actually try.

Everything else — multi-step chains, variables, fixtures, per-site scoping, options UI — is listed
at the bottom as later stages, not built now.

**Two findings that shape v0:**

1. **`Ctrl+Alt` is forbidden in `manifest.commands`** — Chrome reserves it for AltGr. Your `⌃⌥1`
   is therefore *impossible* via Chrome's native shortcut API. It can only come from a
   content-script `keydown` listener. So v0 uses the content script, and there is **no service
   worker and no `chrome.commands` at all**.
2. **Use `KeyboardEvent.code`, not `.key`.** On a Cyrillic layout `.key` returns Cyrillic letters
   and every binding breaks on layout switch. `.code` is physical-key based.

Decisions carried over: TypeScript + Vite, 3 collections (`stacks` / `fixtures` / `sites`), steps
inline in stacks.

---

## What v0 contains

| | |
|---|---|
| Step types | **1** — `copyBySelector` |
| Hotkeys | any chord, matched in the content script |
| Config | `public/config/stacks.json`, fetched at runtime |
| Service worker | none |
| Options UI | none — you edit JSON |
| Permissions | `clipboardWrite` + `<all_urls>` content script (unpacked only) |

---

## Build list

### 1. Scaffold

```
npm init -y
npm i -D typescript vite @types/chrome vitest
```

Create the tree:

```
hotkey_plugin/
├── manifest.json
├── package.json  tsconfig.json  vite.config.ts
├── public/
│   └── config/
│       ├── stacks.json      ← the one you edit
│       ├── sites.json       ← stub, unused in v0
│       └── fixtures.json    ← stub, unused in v0
└── src/
    ├── core/
    │   ├── schema.ts        ← types
    │   └── keys.ts          ← chord matching
    └── content/
        ├── inject.ts        ← keydown listener + config load
        └── steps.ts         ← the step registry (1 entry)
```

### 2. `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Keystack",
  "version": "0.0.1",
  "description": "Hotkey macros for any site.",
  "permissions": ["clipboardWrite"],
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }
  ],
  "web_accessible_resources": [
    { "resources": ["config/*.json"], "matches": ["<all_urls>"] }
  ]
}
```

`web_accessible_resources` is **required** — without it the content script cannot `fetch()` its own
extension-origin config file.

`<all_urls>` is fine while loading unpacked. Swap to `optional_host_permissions` before publishing
(that change also forces dynamic `chrome.scripting.registerContentScripts()`).

### 3. `vite.config.ts`

Build the content script as a **single IIFE**, not ESM — manifest content scripts are not modules.

```ts
export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: { content: "src/content/inject.ts" },
      output: { format: "iife", entryFileNames: "[name].js" }
    }
  }
});
```

`public/` is copied verbatim, so `public/config/stacks.json` lands at `dist/config/stacks.json`.

### 4. `src/core/schema.ts` — types now, so nothing is rewritten later

```ts
export type Binding = {
  code: string;            // "Digit1" — KeyboardEvent.code
  ctrl: boolean; alt: boolean; shift: boolean; meta: boolean;
};

export type Step =
  | { id: string; type: "copyBySelector"; selector: string };   // v0: only member

export type Stack = {
  id: string;
  name: string;
  binding: Binding;
  enabled: boolean;
  steps: Step[];           // array from day one, even though v0 runs one
};

export type Config = { schemaVersion: 1; stacks: Stack[] };
```

`Step` is a union with one member on purpose — adding a type later is one more union arm plus one
registry entry, with the compiler listing every place to update.

### 5. `public/config/stacks.json` — the file you edit

```json
{
  "schemaVersion": 1,
  "stacks": [
    {
      "id": "copy-id",
      "name": "Copy ticket ID",
      "binding": { "code": "Digit1", "ctrl": true, "alt": true, "shift": false, "meta": false },
      "enabled": true,
      "steps": [
        { "id": "s1", "type": "copyBySelector", "selector": "#ticket-id" }
      ]
    }
  ]
}
```

On macOS `ctrl: true, alt: true` is literally Control+Option — the chord you wanted, and the one
Chrome's native API would have rejected.

### 6. `src/core/keys.ts`

```ts
export function matches(e: KeyboardEvent, b: Binding): boolean {
  return e.code === b.code
    && e.ctrlKey === b.ctrl && e.altKey === b.alt
    && e.shiftKey === b.shift && e.metaKey === b.meta;
}
```

Exact equality on all four modifiers, so `⌃⌥1` does not also fire on `⌃⌥⇧1`.

### 7. `src/content/steps.ts`

```ts
export const handlers = {
  async copyBySelector(step) {
    const el = document.querySelector(step.selector);
    if (!el) throw new Error(`No element for "${step.selector}"`);
    const text = (el as HTMLInputElement).value ?? el.textContent?.trim() ?? "";
    if (!text) throw new Error(`Element "${step.selector}" is empty`);
    await navigator.clipboard.writeText(text);
    return text;
  }
};
```

Read `.value` first so the step works on `<input>` as well as on text nodes. `clipboard.writeText`
works here because a real keydown supplies user activation.

### 8. `src/content/inject.ts`

The whole runtime:

1. On `keydown`, **bail if focus is in an `input`, `textarea`, or `contenteditable`** — otherwise
   you hijack typing.
2. `fetch(chrome.runtime.getURL("config/stacks.json"))` — fetch per keypress in v0, so editing the
   JSON needs no rebuild and no extension reload.
3. Find the first enabled stack whose `binding` matches.
4. `preventDefault()` + `stopPropagation()` so the page's own shortcuts don't also fire.
5. Run its steps in order through the registry.
6. Show a small toast: the copied text on success, the error message on failure.

The toast matters more than it sounds — without feedback a clipboard write is invisible and you
cannot tell "selector wrong" from "hotkey never fired".

### 9. Try it

```
npm run build
```

Then `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`.

Open any page, edit `dist/config/stacks.json` so `selector` points at a real element (copy a
selector via DevTools → right-click → Copy → Copy selector), press `⌃⌥1`, and paste.

---

## Verification

- **Happy path:** selector matches a visible element → toast shows the text → paste confirms it.
- **Bad selector:** set `selector` to `#nope` → toast shows "No element", nothing is copied.
- **Typing is safe:** click into a text field, press `⌃⌥1` → nothing happens, no character eaten.
- **Layout independence:** switch to a Cyrillic layout, press the same physical keys → still fires.
  This is the `.code` decision paying off.
- **Edit loop:** change `selector` in `dist/config/stacks.json`, press the chord again without
  reloading the extension → new selector takes effect.
- **Unit test** (`vitest`) for `matches()`: correct chord true; same key with an extra modifier
  false; different `code` false.

---

## Later stages — not now

Each stage stays runnable; nothing below changes the JSON shape already written.

- **v0.2 — the context.** Split `copyBySelector` into `readElement` (with `saveAs`) + `copy`, and
  add `{{var}}` templating. This introduces the run context, the feature competitors lack.
- **v0.3 — your real use case.** Add `openUrl`, making `readSelection → openUrl .../t/{{id}}` work.
- **v0.4 — more steps.** `fillInput` (must use the native value setter and a bubbling `input`
  event, or React forms silently ignore it), `click`, `waitFor`, `delay`.
- **v0.5 — sites.** `sites.json` plus `scope` on a stack, so a site-scoped stack beats a global one
  and one chord means different things per site.
- **v0.6 — fixtures.** `fixtures.json` and `{{fixture.testUser.email}}` for test logins.
- **v1.0 — shippable.** Options UI replacing hand-edited JSON, `optional_host_permissions` with
  dynamic content-script registration, `chrome.storage.local` instead of bundled files, a service
  worker for browser-level steps, and up to 3 native `chrome.commands` chords
  (remembering: no `Ctrl+Alt`).
