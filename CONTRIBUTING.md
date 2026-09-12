# Branching and versioning

Keystack uses lightweight trunk-based development: short-lived branches off
`master`, merged via PR. See `.github/pull_request_template.md` for the PR
checklist.

## Every branch is named after the version it produces

```
<type>/<version>-<slug>
```

- `type` — `feat`, `fix`, or `chore`
- `version` — the full `X.Y.Z` the branch will bump `manifest.json` and
  `package.json` to
- `slug` — a short description

Examples: `fix/0.2.1-toast-overlap`, `feat/0.3.0-openurl-step`.

## Version numbers: only the patch auto-increments

- **Patch (`Z`)** — bumped automatically for every new branch. A normal fix
  or small addition takes the current version on `master` and increments `Z`
  by 1. This is the default; no need to ask.
- **Minor (`Y`)** and **major (`X`)** — changed only when explicitly decided
  by the project owner, never bumped automatically. If a change feels like
  it deserves a minor/major bump, ask rather than assume.

## After merge

Tag the merge commit on `master` as `vX.Y.Z`, matching the version the
branch was named after:

```
git tag -a vX.Y.Z -m "Keystack vX.Y.Z\n\n- ..."
git push origin vX.Y.Z
```
