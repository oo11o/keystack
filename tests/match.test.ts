import { describe, it, expect } from "vitest";
import {
  applicableSections,
  groupSites,
  patternHost,
  patternsOverlap,
  patternPath,
  siteHost,
  sitesOverlap,
  siteScope,
  applicableStacks,
  expandPattern,
  isCommon,
  matchesPattern,
  matchesUrl,
  patternLevel,
  patternToRegExp,
  siteFor,
  siteLevel,
  sitesFor
} from "../src/core/match";
import type { Config, Site, Stack } from "../src/core/schema";
import { SCHEMA_VERSION } from "../src/core/schema";

function stack(id: string, code: string, siteId?: string | null): Stack {
  return {
    id,
    name: id,
    binding: { code, ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps: [{ id: "s1", type: "copyBySelector", selector: "#x" }],
    siteId
  };
}

function config(stacks: Stack[], sites: Site[] = []): Config {
  return { schemaVersion: SCHEMA_VERSION, stacks, sites };
}

const local: Site = { id: "local", name: "dzo.lh", patterns: ["dzo.lh"] };
const test: Site = { id: "test", name: "test", patterns: ["https://test.dzo.com.ua/*"] };

describe("expandPattern", () => {
  it("reads a bare host as any scheme and any path", () => {
    expect(expandPattern("dzo.lh")).toBe("*://dzo.lh/*");
  });

  it("keeps a host with a path, so a section of a site can be scoped", () => {
    expect(expandPattern("dzo.lh/cabinet")).toBe("*://dzo.lh/cabinet");
  });

  it("leaves a full pattern alone", () => {
    expect(expandPattern("https://test.dzo.com.ua/*")).toBe("https://test.dzo.com.ua/*");
  });
});

describe("patternToRegExp", () => {
  it("treats * as the only wildcard and escapes the rest", () => {
    expect(patternToRegExp("https://a.test/x?y=1").test("https://a.test/x?y=1")).toBe(true);
    // Unescaped, "?" would make the preceding character optional and this
    // would also match "https://a.tes/x".
    expect(patternToRegExp("https://a.test/x?y=1").test("https://a.tesx?y=1")).toBe(false);
  });

  it("anchors both ends, so a pattern cannot match inside a query string", () => {
    const re = patternToRegExp("https://dzo.lh/*");
    expect(re.test("https://dzo.lh/tenders/new")).toBe(true);
    expect(re.test("https://evil.test/?next=https://dzo.lh/")).toBe(false);
  });
});

describe("matchesUrl", () => {
  it("matches any scheme for a bare host", () => {
    expect(matchesUrl("http://dzo.lh/tenders/new", ["dzo.lh"])).toBe(true);
    expect(matchesUrl("https://dzo.lh/", ["dzo.lh"])).toBe(true);
  });

  it("does not match a different host that merely ends the same way", () => {
    expect(matchesUrl("http://notdzo.lh/", ["dzo.lh"])).toBe(false);
  });

  it("matches a subdomain wildcard", () => {
    expect(matchesUrl("https://api.prozorro.gov.ua/x", ["*://*.prozorro.gov.ua/*"])).toBe(true);
    expect(matchesUrl("https://prozorro.gov.ua/x", ["*://*.prozorro.gov.ua/*"])).toBe(false);
  });

  it("ignores a blank pattern rather than treating it as match-everything", () => {
    // A half-filled row in the builder must not silently scope a stack to the
    // entire web.
    expect(matchesUrl("https://anything.test/", [""])).toBe(false);
    expect(matchesUrl("https://anything.test/", ["  "])).toBe(false);
  });

  it("is case-insensitive on the host, as URLs are", () => {
    expect(matchesUrl("https://DZO.lh/x", ["dzo.lh"])).toBe(true);
  });
});

const page: Site = { id: "page", name: "new tender", patterns: ["dzo.lh/tenders/new"] };

describe("patternLevel", () => {
  it("calls a host-only pattern a domain, however it is spelled", () => {
    expect(patternLevel("dzo.lh")).toBe("domain");
    expect(patternLevel("*://dzo.lh/*")).toBe("domain");
    expect(patternLevel("https://test.dzo.com.ua/*")).toBe("domain");
    expect(patternLevel("https://test.dzo.com.ua/")).toBe("domain");
  });

  it("calls a pattern that constrains the path a URL", () => {
    expect(patternLevel("dzo.lh/tenders/new")).toBe("url");
    expect(patternLevel("https://dzo.lh/cabinet/*")).toBe("url");
  });
});

describe("siteLevel", () => {
  it("is null for a site that does not claim the URL", () => {
    expect(siteLevel("https://example.com/", local)).toBeNull();
  });

  it("reports the level of the pattern that actually matched", () => {
    expect(siteLevel("http://dzo.lh/x", local)).toBe("domain");
    expect(siteLevel("http://dzo.lh/tenders/new", page)).toBe("url");
  });

  it("counts a mixed site as the narrower level once the narrow pattern matches", () => {
    const mixed: Site = { id: "m", name: "m", patterns: ["dzo.lh", "dzo.lh/cabinet/*"] };

    expect(siteLevel("http://dzo.lh/other", mixed)).toBe("domain");
    expect(siteLevel("http://dzo.lh/cabinet/x", mixed)).toBe("url");
  });
});

describe("sitesFor", () => {
  it("returns every site that claims the URL, not just the first", () => {
    // The case the three tiers exist for: a domain-wide site and a page-specific
    // one on the same host.
    expect(sitesFor("http://dzo.lh/tenders/new", [local, page]).map((m) => m.site.id)).toEqual([
      "local",
      "page"
    ]);
  });

  it("leaves out a site whose narrow pattern does not match this page", () => {
    expect(sitesFor("http://dzo.lh/other", [local, page]).map((m) => m.site.id)).toEqual(["local"]);
  });
});

describe("siteFor", () => {
  it("returns the narrowest matching site, since only one answer fits", () => {
    expect(siteFor("http://dzo.lh/tenders/new", [local, page])?.id).toBe("page");
    expect(siteFor("http://dzo.lh/other", [local, page])?.id).toBe("local");
  });

  it("falls back to config order among sites of the same level", () => {
    expect(siteFor("http://dzo.lh/x", [local, test])?.id).toBe("local");
    expect(siteFor("https://test.dzo.com.ua/x", [local, test])?.id).toBe("test");
  });

  it("returns null when nothing matches", () => {
    expect(siteFor("https://example.com/", [local, test])).toBeNull();
  });
});

describe("applicableSections", () => {
  it("groups what applies into this URL, this domain, everywhere — in that order", () => {
    const cfg = config(
      [stack("c", "Digit1"), stack("d", "Digit2", "local"), stack("u", "Digit3", "page")],
      [local, page]
    );

    // Narrowest first: the one that actually fires here is the one at the top.
    expect(applicableSections(cfg, "http://dzo.lh/tenders/new")).toEqual([
      { level: "url", label: "This URL · new tender", stacks: [cfg.stacks[2]] },
      { level: "domain", label: "This domain · dzo.lh", stacks: [cfg.stacks[1]] },
      { level: "common", label: "Everywhere", stacks: [cfg.stacks[0]] }
    ]);
  });

  it("omits a tier with no stacks in it", () => {
    const cfg = config([stack("d", "Digit2", "local")], [local, page]);

    expect(applicableSections(cfg, "http://dzo.lh/tenders/new").map((s) => s.level)).toEqual([
      "domain"
    ]);
  });
});

describe("applicableStacks", () => {
  it("puts site-scoped stacks ahead of common ones, so the specific one wins a chord", () => {
    const cfg = config([stack("common", "Digit9"), stack("scoped", "Digit9", "local")], [local]);

    const applicable = applicableStacks(cfg, "http://dzo.lh/x");

    expect(applicable.map((s) => s.id)).toEqual(["scoped", "common"]);
  });

  it("leaves out a stack scoped to a site that does not match this URL", () => {
    const cfg = config([stack("common", "Digit9"), stack("scoped", "Digit9", "local")], [local]);

    expect(applicableStacks(cfg, "https://example.com/").map((s) => s.id)).toEqual(["common"]);
  });

  it("treats a stack with no siteId as common", () => {
    expect(isCommon(stack("a", "Digit1"))).toBe(true);
    expect(isCommon(stack("a", "Digit1", null))).toBe(true);
    expect(isCommon(stack("a", "Digit1", "local"))).toBe(false);
  });

  it("drops a disabled stack, scoped or not", () => {
    const off = { ...stack("off", "Digit1"), enabled: false };
    const offScoped = { ...stack("off-scoped", "Digit2", "local"), enabled: false };

    expect(applicableStacks(config([off, offScoped], [local]), "http://dzo.lh/x")).toEqual([]);
  });

  it("lets a URL-level stack beat a domain one, which beats a common one", () => {
    const cfg = config(
      [stack("common", "Digit9"), stack("domain", "Digit9", "local"), stack("url", "Digit9", "page")],
      [local, page]
    );

    // All three share ⌃⌥9; the resolver takes the first, so order is the rule.
    expect(applicableStacks(cfg, "http://dzo.lh/tenders/new").map((s) => s.id)).toEqual([
      "url",
      "domain",
      "common"
    ]);
    expect(applicableStacks(cfg, "http://dzo.lh/other").map((s) => s.id)).toEqual([
      "domain",
      "common"
    ]);
    expect(applicableStacks(cfg, "https://example.com/").map((s) => s.id)).toEqual(["common"]);
  });

  it("keeps config order between two sites of the same level", () => {
    const other: Site = { id: "other", name: "other", patterns: ["dzo.lh"] };
    const cfg = config([stack("a", "Digit1", "local"), stack("b", "Digit2", "other")], [local, other]);

    expect(applicableStacks(cfg, "http://dzo.lh/x").map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("applies a stack pointing at a deleted site nowhere, rather than everywhere", () => {
    // Promoting it to common would hand a site's chords to every page on the
    // web the moment its site was removed.
    const cfg = config([stack("orphan", "Digit9", "gone")], []);

    expect(applicableStacks(cfg, "http://dzo.lh/x")).toEqual([]);
  });
});

describe("patternHost / patternPath", () => {
  it("splits a pattern into the host it aims at and the path it narrows to", () => {
    expect(patternHost("stage.dzo.com.ua")).toBe("stage.dzo.com.ua");
    expect(patternHost("https://STAGE.dzo.com.ua/tenders")).toBe("stage.dzo.com.ua");
    expect(patternPath("stage.dzo.com.ua")).toBe("");
    expect(patternPath("stage.dzo.com.ua/tenders/*")).toBe("/tenders/*");
  });

  it("has no host for a blank pattern", () => {
    expect(patternHost("  ")).toBe("");
  });
});

describe("siteHost / siteScope", () => {
  const host: Site = { id: "h", name: "stage", patterns: ["stage.dzo.com.ua"] };
  const area: Site = { id: "a", name: "/tenders", patterns: ["stage.dzo.com.ua/tenders"] };

  it("takes the host from the first usable pattern", () => {
    expect(siteHost({ ...area, patterns: ["", "stage.dzo.com.ua/x"] })).toBe("stage.dzo.com.ua");
    expect(siteHost({ ...area, patterns: [] })).toBe("");
  });

  it("is domain-level as soon as one pattern claims the bare host", () => {
    expect(siteScope(host)).toBe("domain");
    expect(siteScope(area)).toBe("url");
    expect(siteScope({ ...area, patterns: ["stage.dzo.com.ua/x", "stage.dzo.com.ua"] })).toBe(
      "domain"
    );
  });
});

describe("groupSites", () => {
  const host: Site = { id: "stage", name: "stage.dzo.com.ua", patterns: ["stage.dzo.com.ua"] };
  const tenders: Site = {
    id: "tenders",
    name: "/tenders",
    patterns: ["stage.dzo.com.ua/tenders", "stage.dzo.com.ua/tenders/*"]
  };
  const contracts: Site = {
    id: "contracts",
    name: "/contracts",
    patterns: ["stage.dzo.com.ua/contracts"]
  };

  it("nests the path-scoped sites under their host, in config order", () => {
    expect(groupSites([host, tenders, contracts])).toEqual([
      { site: host, areas: [tenders, contracts] }
    ]);
  });

  it("nests an area listed before its host", () => {
    expect(groupSites([tenders, host])).toEqual([{ site: host, areas: [tenders] }]);
  });

  it("leaves an area whose host has no site of its own at the top level", () => {
    expect(groupSites([tenders, contracts])).toEqual([
      { site: tenders, areas: [] },
      { site: contracts, areas: [] }
    ]);
  });

  it("treats a second domain-level site on one host as a sibling, not a child", () => {
    const also: Site = { id: "also", name: "also", patterns: ["https://stage.dzo.com.ua/*"] };

    expect(groupSites([host, also, tenders])).toEqual([
      { site: host, areas: [tenders] },
      { site: also, areas: [] }
    ]);
  });

  it("keeps a patternless site as its own row", () => {
    const blank: Site = { id: "blank", name: "New site", patterns: [] };

    expect(groupSites([host, blank])).toEqual([
      { site: host, areas: [] },
      { site: blank, areas: [] }
    ]);
  });
});
describe("patternsOverlap", () => {
  it("sees a host overlapping its own sections", () => {
    expect(patternsOverlap("stage.dzo.com.ua", "stage.dzo.com.ua/tenders")).toBe(true);
    expect(patternsOverlap("stage.dzo.com.ua/tenders/*", "stage.dzo.com.ua")).toBe(true);
  });

  it("sees a wildcard host overlapping a concrete one", () => {
    expect(patternsOverlap("*.dzo.com.ua", "test.dzo.com.ua")).toBe(true);
  });

  it("keeps two sections of one host apart", () => {
    expect(patternsOverlap("stage.dzo.com.ua/tenders", "stage.dzo.com.ua/contracts")).toBe(false);
    // "/tenders" covers its own subtree, so it meets "/tenders/*" rather than
    // sitting beside it.
    expect(patternsOverlap("dzo.lh/tenders", "dzo.lh/tenders/*")).toBe(true);
  });

  it("keeps two hosts apart, and never overlaps a blank pattern", () => {
    expect(patternsOverlap("dzo.lh", "example.com")).toBe(false);
    expect(patternsOverlap("dzo.lh", " ")).toBe(false);
  });
});

describe("sitesOverlap", () => {
  const host: Site = { id: "stage", name: "stage", patterns: ["stage.dzo.com.ua"] };
  const area: Site = { id: "tenders", name: "/tenders", patterns: ["stage.dzo.com.ua/tenders"] };
  const other: Site = { id: "live", name: "live", patterns: ["dzo.com.ua"] };

  it("is true for a host and its area, false for unrelated hosts", () => {
    expect(sitesOverlap(host, area)).toBe(true);
    expect(sitesOverlap(host, other)).toBe(false);
  });

  it("is true for a site and itself", () => {
    expect(sitesOverlap(host, { ...host })).toBe(true);
  });
});

// The thing that makes "add the section I am on" actually work: a listing page
// is normally being looked at with a filter or a page number on it.
describe("queries and fragments", () => {
  const area = ["stage.dzo.com.ua/tenders", "stage.dzo.com.ua/tenders/*"];

  it("claims the section whatever query or fragment the page carries", () => {
    expect(matchesUrl("https://stage.dzo.com.ua/tenders", area)).toBe(true);
    expect(matchesUrl("https://stage.dzo.com.ua/tenders?page=2", area)).toBe(true);
    expect(matchesUrl("https://stage.dzo.com.ua/tenders#top", area)).toBe(true);
    expect(matchesUrl("https://stage.dzo.com.ua/tenders/4821?tab=docs", area)).toBe(true);
  });

  it("still keeps the section apart from its neighbours", () => {
    expect(matchesUrl("https://stage.dzo.com.ua/contracts?page=2", area)).toBe(false);
    expect(matchesUrl("https://stage.dzo.com.ua/tenders-archive", area)).toBe(false);
  });

  it("takes a pattern that mentions the query at its word", () => {
    expect(matchesPattern("https://dzo.lh/search?q=tender", "dzo.lh/search?q=*")).toBe(true);
    expect(matchesPattern("https://dzo.lh/search?sort=new", "dzo.lh/search?q=*")).toBe(false);
    // And that pattern no longer claims the bare page, which is the point of
    // having written the query out.
    expect(matchesPattern("https://dzo.lh/search", "dzo.lh/search?q=*")).toBe(false);
  });

  it("does not let a fragment smuggle a match past an anchored pattern", () => {
    expect(matchesPattern("https://evil.test/#https://dzo.lh/", "dzo.lh")).toBe(false);
  });
});

// What the user writes by hand, and what they mean by it.
describe("a path with no wildcard covers what is under it", () => {
  const section = ["stage.dzo.com.ua/tenders"];

  it("claims the page, its subtree, and any query on either", () => {
    expect(matchesUrl("https://stage.dzo.com.ua/tenders", section)).toBe(true);
    expect(matchesUrl("https://stage.dzo.com.ua/tenders/", section)).toBe(true);
    expect(matchesUrl("https://stage.dzo.com.ua/tenders/4821", section)).toBe(true);
    expect(matchesUrl("https://stage.dzo.com.ua/tenders/4821/edit", section)).toBe(true);
    expect(matchesUrl("https://stage.dzo.com.ua/tenders?page=2", section)).toBe(true);
  });

  it("steps down the path rather than matching a prefix of the text", () => {
    expect(matchesUrl("https://stage.dzo.com.ua/tenders-archive", section)).toBe(false);
    expect(matchesUrl("https://stage.dzo.com.ua/contracts", section)).toBe(false);
    expect(matchesUrl("https://other.com/tenders", section)).toBe(false);
  });

  it("leaves a pattern with a wildcard alone", () => {
    // Written out by hand, so taken at its word: strictly below /tenders.
    expect(matchesUrl("https://dzo.lh/tenders", ["dzo.lh/tenders/*"])).toBe(false);
    expect(matchesUrl("https://dzo.lh/tenders/4821", ["dzo.lh/tenders/*"])).toBe(true);
  });

  it("gives a host written with a scheme and no path something to match", () => {
    // "https://dzo.lh" used to match no URL at all.
    expect(matchesUrl("https://dzo.lh/anything", ["https://dzo.lh"])).toBe(true);
    expect(matchesUrl("http://dzo.lh/anything", ["https://dzo.lh"])).toBe(false);
  });

  it("still cannot be smuggled past the anchors", () => {
    expect(matchesUrl("https://evil.test/?next=https://dzo.lh/tenders", section)).toBe(false);
    expect(matchesUrl("https://stage.dzo.com.ua.evil.test/tenders", section)).toBe(false);
  });
});
