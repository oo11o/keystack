// Line filtering for the popupJson panel. Kept in core/ (no DOM) so the
// threshold and the matching rule are testable on their own — same split
// page/dom.ts describes.

// "More than 2 symbols": 1 or 2 characters are almost always mid-typing, and
// narrowing on them collapses the view to noise before the query means
// anything. Below this, everything shows.
export const FILTER_MIN = 3;

// Between hits, so several results don't read as one run of JSON. A blank
// line on each side does most of the separating; the rule makes it obvious.
export const SEPARATOR = "-".repeat(24);

// One hit: a run of matched lines and the path naming where it came from.
// The UI renders these as separate elements so the path can be styled apart
// from the payload; `text` is the same thing flattened, for plain-text use.
export type FilterGroup = {
  ids: string[]; // "bidId: 4f2c…" for each ancestor that carries an id
  path: string; // "bids.1.content", or "" when the line names nothing
  body: string; // the matched lines, dedented to their own level
};

export type FilterResult = {
  text: string; // what to render, as one string
  groups: FilterGroup[]; // the same hits, unflattened — empty when inactive
  shown: number; // matched lines — headers and separators are not counted
  total: number; // lines in the unfiltered input
  active: boolean; // false when the query was too short to filter on
};

// The dotted path to each line, by line index: "bids.1.content", with array
// positions as numbers. A deep hit is meaningless without it — `"content":`
// on its own says nothing about which bid it belongs to.
//
// Derived by walking the pretty-printed body once and keeping a stack of the
// containers we are inside. Lines that name nothing (the root brace, a
// non-JSON body) get "", and the caller omits the header for those.
export function pathsByLine(lines: string[]): string[] {
  const paths: string[] = [];
  const path: string[] = [];
  const stack: { array: boolean; index: number; pushed: boolean }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // A closer belongs to the container it ends, so read the path before popping.
    if (trimmed.startsWith("}") || trimmed.startsWith("]")) {
      paths.push(path.join("."));
      const frame = stack.pop();
      if (frame?.pushed) path.pop();
      continue;
    }

    const key = trimmed.match(/^"((?:[^"\\]|\\.)*)"\s*:/)?.[1];
    const top = stack[stack.length - 1];
    // No key and inside an array means this is an element: its position names it.
    const own = key ?? (top?.array ? String(top.index++) : "");
    const full = own ? [...path, own] : [...path];
    paths.push(full.join("."));

    const last = trimmed.slice(-1);
    if (last === "{" || last === "[") {
      stack.push({ array: last === "[", index: 0, pushed: own !== "" });
      if (own) path.push(own);
    }
  }
  return paths;
}

// Bracket depth after `line`, starting from `depth`. Brackets inside string
// literals don't count — a value like "use {x} here" is not a block. JSON
// escapes newlines inside strings, so no string spans a line and the scan
// can start fresh on each one.
function depthAfter(line: string, depth: number): number {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === "\\") i++; // skip the escaped character, including \"
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;
  }
  return depth;
}

// The last line of the block a matched line opens, or the line itself when it
// opens nothing. A hit on `"awards": [` is worth nothing without the awards,
// so the whole block comes with it.
function blockEnd(lines: string[], start: number): number {
  let depth = depthAfter(lines[start], 0);
  if (depth <= 0) return start; // not an opener
  for (let i = start + 1; i < lines.length; i++) {
    depth = depthAfter(lines[i], depth);
    if (depth <= 0) return i;
  }
  return lines.length - 1; // unbalanced (truncated body) — take what's there
}

// The scalar on a `"key": value` line, or null if the line opens a block or
// isn't a key/value pair at all. JSON.parse unescapes a string value; a
// number or boolean comes back as its text.
function scalarValue(line: string): string | null {
  const match = line.trim().match(/^"(?:[^"\\]|\\.)*"\s*:\s*(.*?),?$/);
  if (!match) return null;
  const raw = match[1];
  if (raw === "{" || raw === "[") return null;
  try {
    return String(JSON.parse(raw));
  } catch {
    return raw;
  }
}

// Every object that carries an "id", keyed by that object's path. Built in
// one pass so a hit can be labelled with the ids of the things it sits
// inside — "bids.0.documents" means nothing without knowing which bid.
function idsByPath(lines: string[], paths: string[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    const path = paths[i];
    const isId = path === "id" || path.toLowerCase().endsWith(".id");
    if (!isId) continue;
    const value = scalarValue(lines[i]);
    if (value === null) continue;
    ids.set(path.slice(0, Math.max(0, path.length - ".id".length)), value); // the owning object
  }
  return ids;
}

// "bids.0" → "bid ID": the array's key names the element, not the index. A
// plural key is singularised so it reads as one thing.
function idLabel(segments: string[], depth: number): string {
  const last = segments[depth - 1];
  const name = /^\d+$/.test(last) ? (segments[depth - 2] ?? last) : last;
  const singular = name.endsWith("s") ? name.slice(0, -1) : name;
  return `${singular} ID`;
}

// Walks the ancestors of `path` outermost first, labelling each one that has
// an id. A document inside a bid gets both, so you can see which bid it is.
function idsFor(path: string, ids: Map<string, string>): string[] {
  if (!path) return [];
  const segments = path.split(".");
  const labels: string[] = [];
  for (let depth = 1; depth <= segments.length; depth++) {
    const id = ids.get(segments.slice(0, depth).join("."));
    if (id !== undefined) labels.push(`${idLabel(segments, depth)}: ${id}`);
  }
  return labels;
}

// Does `path` descend through every segment of `wanted`, in order? The
// segments need not be adjacent — "bids.documents" finds documents anywhere
// under bids, however many levels down, and each segment matches as a
// substring so "doc" finds "documents".
function matchesPath(path: string, wanted: string[]): boolean {
  const segments = path.toLowerCase().split(".");
  let next = 0;
  for (const segment of segments) {
    if (segment.includes(wanted[next])) next++;
    if (next === wanted.length) return true;
  }
  return false;
}

// Case-insensitive substring match, line by line. No regex: a JSON body is
// full of characters a user would otherwise have to escape.
//
// A query containing a dot is *additionally* read as a path — "bids.documents"
// keeps every line under a documents inside a bids. Additionally, not instead:
// a value like "active.tendering" has a dot too, and must keep matching
// literally. A line is kept if either reading matches.
export function filterLines(text: string, query: string): FilterResult {
  const lines = text.split("\n");
  const needle = query.trim().toLowerCase();

  if (needle.length < FILTER_MIN) {
    return { text, groups: [], shown: lines.length, total: lines.length, active: false };
  }

  const paths = pathsByLine(lines);
  const wanted = needle.includes(".") ? needle.split(".").filter(Boolean) : null;

  // A Set, not a concat of ranges: nested matches overlap constantly (a hit
  // on a parent block and on a key inside it), and each line must appear
  // once, in its original order.
  const keep = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const hit = lines[i].toLowerCase().includes(needle) || (wanted !== null && matchesPath(paths[i], wanted));
    if (!hit) continue;
    const end = blockEnd(lines, i);
    for (let j = i; j <= end; j++) keep.add(j);
  }

  const indices = [...keep].sort((a, b) => a - b);

  // Consecutive kept lines are one hit (a matched block and everything it
  // pulled in); a gap starts a new one.
  const groups: number[][] = [];
  for (const i of indices) {
    const last = groups[groups.length - 1];
    if (last && i === last[last.length - 1] + 1) last.push(i);
    else groups.push([i]);
  }

  const ids = idsByPath(lines, paths);

  const hits: FilterGroup[] = groups.map((group) => {
    // Dedent to the group's own level — a hit six levels deep is unreadable
    // behind twelve spaces of indent it no longer has context for.
    const indent = Math.min(...group.map((i) => lines[i].length - lines[i].trimStart().length));
    const path = paths[group[0]];
    return {
      ids: idsFor(path, ids),
      path,
      body: group.map((i) => lines[i].slice(indent)).join("\n")
    };
  });

  // Starred in the flat form, where there is no styling to lean on. The UI
  // renders from `groups` instead and dims these with CSS.
  const blocks = hits.map((hit) =>
    [...hit.ids.map((id) => `*${id}*`), ...(hit.path ? [`*${hit.path}*`] : []), hit.body].join("\n")
  );

  return {
    groups: hits,
    text: blocks.join(`\n\n${SEPARATOR}\n\n`),
    shown: indices.length,
    total: lines.length,
    active: true
  };
}
