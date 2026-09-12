---
name: reload-extension
description: Build Keystack and reload it as an unpacked extension in Chrome. Use whenever the user asks to "reload the extension", "reload the plugin", "try it in Chrome", or similar, after making changes in this repo.
---

# Reload Keystack in Chrome

Keystack (this repo) is loaded unpacked from `dist/`. Chrome does not pick up
a rebuilt `dist/` automatically — the extension card must be reloaded after
every build that changes `manifest.json` or any `.ts` file. (Editing
`public/config/*.json` alone does *not* need this — `inject.ts` fetches that
file fresh on every keypress.)

## Steps

1. **Build.**
   ```
   npm run build
   ```
   Confirm it exits cleanly before continuing — do not reload a broken build.

2. **Reload in Chrome**, via the `claude-in-chrome` browser automation:
   - Navigate to `chrome://extensions`.
   - Find the **Keystack** card.
   - Click its reload icon (a circular refresh arrow in the card's toolbar).
   - If Keystack is not listed yet, it has never been loaded: click
     **Load unpacked** and select this repo's `dist/` directory instead.

   `claude-in-chrome` needs the user to have granted this session permission
   to control their Chrome browser. If a permission prompt appears, tell the
   user and wait — do not attempt to bypass it.

3. **Report** what you did in one line (e.g. "Rebuilt and reloaded Keystack —
   ready to try.") Do not claim the hotkey itself was tested unless you
   actually drove a keypress and observed the toast/console output through
   `claude-in-chrome`.

## When this isn't enough

- If `manifest.json` permissions changed (e.g. new host permissions), Chrome
  may show a warning on the card instead of reloading cleanly — read it
  before dismissing.
- Some state does not survive a reload: any in-page toast host
  (`#keystack-toast-host`) is torn down and recreated lazily on next use,
  which is expected and not a bug.