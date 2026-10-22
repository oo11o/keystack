import type { Config, Site, Stack } from "./schema";

// URL patterns, deliberately a small subset of Chrome's match patterns: "*"
// is the only wildcard and everything else matches literally. We need our own
// matcher because no Chrome API tests an arbitrary pattern string against a
// URL — the manifest ones are consumed by the browser, never exposed to us.
//
// A pattern with no "://" is read as a bare host: "dzo.lh" means
// "*://dzo.lh/*". That shorthand exists because it is what people type into
// the builder's site box, and reading it literally would match nothing.
export function expandPattern(pattern: string): string {
  const trimmed = pattern.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("://")) return trimmed;
  // Host only, unless the user typed a path too ("dzo.lh/cabinet").
  return trimmed.includes("/") ? `*://${trimmed}` : `*://${trimmed}/*`;
}

// Anchored at both ends, so "https://dzo.lh/*" does not match
// "https://evil.test/?next=https://dzo.lh/".
//
// A pattern with no "*" in it anywhere covers the page it names *and whatever
// is under it*: "dzo.lh/tenders" is how everyone writes "the tenders section",
// and reading it as that one exact URL made it silently useless the moment you
// opened a tender. Writing a "*" yourself turns the shorthand off and the
// pattern is matched literally, so "dzo.lh/tenders/*" still means strictly
// below /tenders, and "dzo.lh/search?q=*" still means exactly that query.
//
// The subtree is a path step, never a string prefix: /tenders covers
// /tenders/4821 and not /tenders-archive.
export function patternToRegExp(pattern: string): RegExp {
  const literal = !pattern.includes("*");
  // A trailing slash would otherwise demand a second one from the subtree.
  const expanded = literal ? expandPattern(pattern).replace(/\/$/, "") : expandPattern(pattern);
  const escaped = expanded
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${literal ? "(/.*)?" : ""}$`, "i");
}

// What a pattern is actually tested against. A URL carries two parts nobody
// writes into a pattern by accident:
//
//   - the fragment, which never reaches the server and never identifies a
//     section of a site, so it is always dropped;
//   - the query, which does — but "dzo.lh/tenders" plainly means the tenders
//     page, not "the tenders page only while it is unfiltered". A pattern that
//     says nothing about the query matches any query; one that mentions "?"
//     is taken at its word and matched against the whole URL.
//
// Without this, adding the section you are standing on silently fails the
// moment you are on page 2 of it.
function urlForPattern(url: string, pattern: string): string {
  const withoutHash = url.split("#")[0];
  return expandPattern(pattern).includes("?") ? withoutHash : withoutHash.split("?")[0];
}

export function matchesPattern(url: string, pattern: string): boolean {
  if (expandPattern(pattern) === "") return false;
  return patternToRegExp(pattern).test(urlForPattern(url, pattern));
}

export function matchesUrl(url: string, patterns: string[]): boolean {
  // A blank pattern is an unfilled row in the builder, not a match-everything.
  return patterns.some((p) => matchesPattern(url, p));
}

// How narrowly a pattern aims. A pattern that constrains only the host applies
// to a whole domain; one that constrains the path applies to particular pages.
// Derived rather than declared: the distinction is already there in the pattern,
// and asking the user to also tick a box would let the two disagree.
export type Level = "common" | "domain" | "url";

export function patternLevel(pattern: string): "domain" | "url" {
  const expanded = expandPattern(pattern);
  const afterScheme = expanded.slice(expanded.indexOf("://") + 3);
  const slash = afterScheme.indexOf("/");
  const path = slash === -1 ? "" : afterScheme.slice(slash);
  return path === "" || path === "/" || path === "/*" ? "domain" : "url";
}

// The level at which a site claims this URL, or null if it does not. A site with
// both kinds of pattern counts as the narrower one it actually matched on:
// "dzo.lh" plus "dzo.lh/cabinet/*" is a URL-level site once you are in the
// cabinet, and a domain-level one everywhere else on the host.
export function siteLevel(url: string, site: Site): "domain" | "url" | null {
  const matched = site.patterns.filter((p) => matchesPattern(url, p));
  if (matched.length === 0) return null;
  return matched.some((p) => patternLevel(p) === "url") ? "url" : "domain";
}

// Every site that claims this URL, in config order. More than one legitimately
// can — a domain-wide site and a page-specific one are exactly the case the
// cheatsheet's three tiers exist for — so this is a list, not a first match.
export function sitesFor(url: string, sites: Site[]): { site: Site; level: "domain" | "url" }[] {
  const found: { site: Site; level: "domain" | "url" }[] = [];
  for (const site of sites) {
    const level = siteLevel(url, site);
    if (level) found.push({ site, level });
  }
  return found;
}

// The narrowest site claiming this URL — for the places where only one answer
// fits, like the column the builder opens on.
export function siteFor(url: string, sites: Site[]): Site | null {
  const matched = sitesFor(url, sites);
  return (matched.find((m) => m.level === "url") ?? matched[0])?.site ?? null;
}

export function isCommon(stack: Stack): boolean {
  return stack.siteId === undefined || stack.siteId === null;
}

// What applies here, in three tiers: these particular URLs, then this domain,
// then everywhere. Built for the cheatsheet popup, which shows them under those
// headings, and reused for resolution — so the order a hotkey is chosen in and
// the order it is *explained* in come from one place and cannot drift.
//
// Narrowest tier first, because that is the order precedence works in: the
// stack that actually fires on this page is the first one listed, and the wider
// tiers below it are what is left over. An empty tier is left out, not shown
// empty.
export type StackSection = { level: Level; label: string; stacks: Stack[] };

const LEVEL_LABEL: Record<"domain" | "url", string> = {
  domain: "This domain",
  url: "This URL"
};

export function applicableSections(config: Config, url: string): StackSection[] {
  const enabled = config.stacks.filter((s) => s.enabled);
  const sections: StackSection[] = [];

  const matched = sitesFor(url, config.sites);
  for (const level of ["url", "domain"] as const) {
    for (const { site } of matched.filter((m) => m.level === level)) {
      const stacks = enabled.filter((s) => s.siteId === site.id);
      if (stacks.length === 0) continue;
      sections.push({ level, label: `${LEVEL_LABEL[level]} · ${site.name}`, stacks });
    }
  }

  const common = enabled.filter(isCommon);
  if (common.length > 0) sections.push({ level: "common", label: "Everywhere", stacks: common });

  return sections;
}

// Every enabled stack that could fire on this URL, narrowest scope first: a
// URL-specific stack beats a domain one, which beats a common one. That is
// already the order the sections are in, so this is the same list with the
// headings taken off — the resolver picks a chord with a plain `.find()` and
// never has to know that sites exist at all.
//
// A stack pointing at a siteId that no longer exists applies nowhere. It is
// deliberately not promoted to common: a deleted site must not hand its chords
// to every page on the web.
export function applicableStacks(config: Config, url: string): Stack[] {
  return applicableSections(config, url).flatMap((section) => section.stacks);
}

// The host a pattern aims at, lowercased and with the scheme and path dropped.
// Grouping key for the Where column: "https://stage.dzo.com.ua/tenders" and
// "stage.dzo.com.ua" are the same site to a reader, so they should be the same
// site to the list.
export function patternHost(pattern: string): string {
  const expanded = expandPattern(pattern);
  if (expanded === "") return "";
  const afterScheme = expanded.slice(expanded.indexOf("://") + 3);
  const slash = afterScheme.indexOf("/");
  return (slash === -1 ? afterScheme : afterScheme.slice(0, slash)).toLowerCase();
}

// The path a pattern narrows to, or "" when it claims the whole host.
export function patternPath(pattern: string): string {
  const expanded = expandPattern(pattern);
  if (patternLevel(expanded) === "domain") return "";
  const afterScheme = expanded.slice(expanded.indexOf("://") + 3);
  return afterScheme.slice(afterScheme.indexOf("/"));
}

// Which host a site belongs to, and whether it claims all of it. Taken from the
// site's first usable pattern: a site whose patterns straddle two hosts is a
// thing the config allows, and the first one is the only non-arbitrary answer.
export function siteHost(site: Site): string {
  for (const pattern of site.patterns) {
    const host = patternHost(pattern);
    if (host !== "") return host;
  }
  return "";
}

// A site is domain-level if any of its patterns claims the bare host — that one
// pattern already applies everywhere the narrower ones do.
export function siteScope(site: Site): "domain" | "url" {
  return site.patterns.some((p) => expandPattern(p) !== "" && patternLevel(p) === "domain")
    ? "domain"
    : "url";
}

// The Where column's shape: a host, and the path-scoped sites nested under it.
// Read out of the patterns rather than declared with a parent field, for the
// same reason patternLevel is — a stored parent could disagree with the
// patterns that actually decide where stacks fire.
export type SiteGroup = { site: Site; areas: Site[] };

export function groupSites(sites: Site[]): SiteGroup[] {
  // First domain-level site per host wins the group; a second one is a sibling,
  // not a child, because it claims the host just as widely.
  const parents = new Map<string, Site>();
  for (const site of sites) {
    const host = siteHost(site);
    if (host === "" || siteScope(site) !== "domain" || parents.has(host)) continue;
    parents.set(host, site);
  }

  const parentOf = (site: Site): Site | null => {
    const parent = parents.get(siteHost(site));
    return parent && parent.id !== site.id && siteScope(site) === "url" ? parent : null;
  };

  // Two passes, so an area listed before its host in the config still lands
  // under it instead of disappearing.
  const groups: SiteGroup[] = [];
  const byId = new Map<string, SiteGroup>();
  for (const site of sites) {
    if (parentOf(site)) continue;
    const group: SiteGroup = { site, areas: [] };
    groups.push(group);
    byId.set(site.id, group);
  }
  for (const site of sites) {
    const parent = parentOf(site);
    if (parent) byId.get(parent.id)?.areas.push(site);
  }
  return groups;
}

// A concrete URL a pattern accepts, used only to ask whether two patterns can
// ever hit the same page. "*" is dropped rather than filled, and a wildcard
// scheme becomes https, so "dzo.lh/tenders/*" yields "https://dzo.lh/tenders/".
function sampleUrl(pattern: string): string {
  const expanded = expandPattern(pattern);
  if (expanded === "") return "";
  return expanded.replace("*://", "https://").split("*").join("");
}

// Do these two patterns overlap — is there a page both would claim? Testing
// every URL is not possible, so each pattern's sample is offered to the other:
// that catches the cases the UI needs ("dzo.lh" vs "dzo.lh/tenders", a host vs
// a wildcard host) and errs towards "no" on exotic patterns, which costs a note
// in the builder rather than a wrong hotkey.
export function patternsOverlap(a: string, b: string): boolean {
  const sampleA = sampleUrl(a);
  const sampleB = sampleUrl(b);
  if (sampleA === "" || sampleB === "") return false;
  return matchesUrl(sampleA, [b]) || matchesUrl(sampleB, [a]);
}

export function sitesOverlap(a: Site, b: Site): boolean {
  if (a.id === b.id) return true;
  return a.patterns.some((p) => b.patterns.some((q) => patternsOverlap(p, q)));
}
