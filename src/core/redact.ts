export const MASK = "•••";

// Secret values reach the screen two ways: a step note that embeds them
// ("opened http://dzo.lh/...&run=abc123") and an error message that quotes
// the string it choked on. Both are built deep inside the run, so redacting
// at the source would mean threading the secret list through every handler.
// Instead the real value flows wherever the step needs it and gets masked
// once, at the presentation boundary — see content/presenter.ts.
//
// The URL steps percent-encode interpolated values, so a token containing special
// characters appears in a URL in a spelling that no longer matches the raw
// secret. Both forms are masked.
export function makeRedactor(secrets: Record<string, string>): (text: string) => string {
  const values = new Set<string>();
  for (const value of Object.values(secrets)) {
    if (!value) continue; // an empty secret would otherwise match everywhere
    values.add(value);
    values.add(encodeURIComponent(value));
  }
  if (values.size === 0) return (text) => text;

  // Longest first: if one secret contains another, mask the whole thing
  // rather than leaving the longer one partly legible around the mask.
  const ordered = [...values].sort((a, b) => b.length - a.length);
  // split/join rather than RegExp — a secret can contain regex metacharacters.
  return (text) => ordered.reduce((out, value) => out.split(value).join(MASK), text);
}
