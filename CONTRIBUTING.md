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

## Merging does not bump the version

Feature/fix branches merge straight to `master` freely, as many times as
needed. **Merging does not, by itself, change `manifest.json` or
`package.json`, and does not create a tag.** `master` can sit several
commits ahead of the last tag — that's expected, not a problem to fix.

## Cutting a release

The version bump + tag is a separate, explicit action, done only when
asked for (e.g. "cut a release", "tag this"):

1. Bump `manifest.json` and `package.json` to the new version, commit
   directly to `master` (`chore: bump version to X.Y.Z`). This commit
   covers everything merged since the last tag, not just the latest PR.
2. Tag the commit and push the tag:
   ```
   git tag -a vX.Y.Z -m "Keystack vX.Y.Z\n\n- ..."
   git push origin vX.Y.Z
   ```

**Patch (`Z`)** is the default bump size unless told otherwise. **Minor
(`Y`)** and **major (`X`)** are the project owner's call only — ask rather
than assume.

This keeps version numbers meaningful (one per real release) instead of
one per merged branch.
