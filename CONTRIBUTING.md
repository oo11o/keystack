# Branching and versioning

Keystack uses lightweight trunk-based development: short-lived branches off
`master`, merged via PR. See `.github/pull_request_template.md` for the PR
checklist.

## Branches are named by content, not by version

```
<type>/<slug>
```

- `type` — `feat`, `fix`, or `chore`
- `slug` — a short description of what the branch does

Examples: `fix/toast-overlap`, `feat/openurl-step`.

No version number in the branch name. A branch's scope can shift mid-review
(a "patch" can turn out to need a minor bump, or vice versa) — deciding the
version upfront just means renaming the branch later. Decide the version
when the PR is actually ready to merge, not when it's created.

## Version numbers: only the patch auto-increments

- **Patch (`Z`)** — bumped by default for a normal merge (fix or small
  addition). Take the version currently on `master`, increment `Z` by 1, and
  bump both `manifest.json` and `package.json`. No need to ask.
- **Minor (`Y`)** and **major (`X`)** — changed only when explicitly decided
  by the project owner, never bumped automatically. If a change feels like
  it deserves a minor/major bump, ask rather than assume.

## At merge time

1. Merge the PR.
2. Bump `manifest.json` and `package.json` to the agreed version, commit
   directly to `master` (`chore: bump version to X.Y.Z`).
3. Tag the commit and push the tag:
   ```
   git tag -a vX.Y.Z -m "Keystack vX.Y.Z\n\n- ..."
   git push origin vX.Y.Z
   ```

This keeps the version bump a deliberate, separate decision made once the
work is done — not a guess baked into the branch name before review starts.
