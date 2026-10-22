import { columnHead, h, iconButton, row } from "./el";
import { icon } from "./icons";
import { groupSites, siteHost, siteScope, sitesFor } from "../core/match";
import type { Site } from "../core/schema";
import * as store from "./store";
import { COMMON } from "./store";

// Column 1 — where. Which pages a stack is allowed to fire on: everywhere
// ("Common"), or one of the sites below. The row for the page the builder was
// opened from says so, and that page is what a new site is pre-filled with,
// because "make this work here" is how a stack usually starts.
//
// A host and its sections are one group, not three unrelated rows:
// stage.dzo.com.ua owns the list, and stage.dzo.com.ua/tenders sits under it as
// an area. The nesting is read out of the patterns (see groupSites) — nothing
// in the config declares it, so it cannot disagree with where stacks fire.

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// The section of a site the URL is in: its first path segment, or "" at the
// root. One segment rather than the whole path, because "/tenders" is the area
// a user means when they are looking at "/tenders/4821/edit".
function areaOf(url: string): string {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean)[0];
    return segment ? `/${segment}` : "";
  } catch {
    return "";
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function renderSites(pane: HTMLElement): void {
  const config = store.getConfig();
  const scope = store.getScope();
  const pageUrl = store.getPageUrl();
  pane.className = "c-site";

  // Every site that claims the page the builder was opened from, not just one:
  // a domain-wide site and a page-specific one can both apply.
  const matched = pageUrl ? sitesFor(pageUrl, config.sites) : [];
  const here = new Set(matched.map((m) => m.site.id));

  pane.append(
    columnHead({
      id: "h-sites",
      tone: "site",
      glyph: "globe",
      eyebrow: "1 · Where",
      title: "Sites",
      count: config.sites.length + 1,
      sub: ["Where your stacks work"]
    })
  );

  pane.append(
    row(
      {
        class: store.sameScope(scope, COMMON) ? "is-sel" : "",
        "aria-pressed": store.sameScope(scope, COMMON) ? "true" : "false",
        onClick: () => store.selectScope(COMMON)
      },
      h("span", { class: "avatar avatar-globe" }, icon("globe")),
      h(
        "span",
        { class: "rowbody" },
        h("span", { class: "rowtitle", text: "Common" }),
        h("span", {
          class: "rowsub",
          text: `Every site · ${plural(store.stackCount(COMMON), "stack")}`
        })
      )
    )
  );

  const groups = groupSites(config.sites);
  if (groups.length > 0) pane.append(h("div", { class: "sectionlabel", text: "Your sites" }));

  for (const group of groups) {
    pane.append(siteRow(group.site, here, false));
    if (group.areas.length === 0) continue;
    pane.append(
      h("div", { class: "arealist" }, ...group.areas.map((area) => siteRow(area, here, true)))
    );
  }

  pane.append(
    addButton(pageUrl, {
      domain: matched.some((m) => m.level === "domain"),
      url: matched.some((m) => m.level === "url")
    })
  );
  pane.append(scope.kind === "site" ? siteSettings(scope.siteId) : commonCard());
}

function siteRow(site: Site, here: Set<string>, isArea: boolean): HTMLElement {
  const scopeOf = { kind: "site" as const, siteId: site.id };
  const selected = store.sameScope(store.getScope(), scopeOf);
  return row(
    {
      class: `${isArea ? "is-area" : ""} ${selected ? "is-sel" : ""}`.trim(),
      "aria-pressed": selected ? "true" : "false",
      title: site.patterns.join("\n"),
      onClick: () => store.selectScope(scopeOf)
    },
    // An area belongs to the host above it, so it gets a tick rather than a
    // second initial competing with its parent's.
    isArea
      ? h("span", { class: "areamark", "aria-hidden": "true", text: "└" })
      : h("span", { class: "avatar", text: (site.name[0] ?? "?").toUpperCase() }),
    h(
      "span",
      { class: "rowbody" },
      h("span", { class: "rowtitle", text: site.name }),
      h("span", {
        class: "rowsub",
        // "this page" is the one thing a site row can say that the config
        // cannot: whether it claims the tab the user came from.
        text: plural(store.stackCount(scopeOf), "stack") + (here.has(site.id) ? " · this page" : "")
      })
    )
  );
}

// One button, three jobs, decided by what the page the builder was opened from
// already belongs to: a host with no site yet wants a site, a host that has one
// wants this section of it, and a page that is already covered down to the URL
// wants nothing in particular.
function addButton(pageUrl: string | null, claimed: { domain: boolean; url: boolean }): HTMLElement {
  const sites = store.getConfig().sites;
  const host = pageUrl ? hostOf(pageUrl) : "";
  // Named by this exact host, or claimed by a wildcard one ("*.dzo.com.ua"):
  // either way the host has an owner and a second row for it would be a rival,
  // not a parent.
  const hasHost =
    claimed.domain || (host !== "" && sites.some((s) => siteHost(s) === host.toLowerCase()));
  const area = pageUrl ? areaOf(pageUrl) : "";

  let label = "Add site";
  let add = () => void store.addSite("New site", []);

  if (host !== "" && !hasHost) {
    label = `Add ${host}`;
    add = () => void store.addSite(host, [host]);
  } else if (host !== "" && area !== "" && !claimed.url) {
    label = `Add ${host}${area}`;
    // One pattern, no wildcard: a path on its own already means this page and
    // everything under it (see patternToRegExp).
    add = () => void store.addSite(area, [`${host}${area}`]);
  }

  return h(
    "button",
    { type: "button", class: "btn btn-dashed", onClick: () => add() },
    icon("plus"),
    label
  );
}

function commonCard(): HTMLElement {
  return h("div", {
    class: "card infocard",
    text:
      "Stacks in Common work on every site. Put things you need everywhere here — " +
      "for example, pasting a test password."
  });
}

function siteSettings(siteId: string): HTMLElement {
  const config = store.getConfig();
  const site = config.sites.find((s) => s.id === siteId);
  if (!site) return h("div");

  // Stable ids: an edit here redraws the column, and main.ts puts the caret
  // back by id.
  const name = h("input", { id: "site-name", class: "input", type: "text", value: site.name });
  name.addEventListener("input", () => store.patchSite(site.id, { name: name.value }));

  const chips = h("div", { class: "chiprow" });
  for (const pattern of site.patterns) {
    chips.append(
      h(
        "span",
        { class: "chip mono", text: pattern },
        iconButton("close", `Remove ${pattern}`, () =>
          store.patchSite(site.id, { patterns: site.patterns.filter((p) => p !== pattern) })
        )
      )
    );
  }

  // Added on Enter rather than per keystroke: a pattern is only a pattern once
  // it is finished, and half of one would match nothing while it was typed.
  const host = siteHost(site);
  const add = h("input", {
    id: "site-add-pattern",
    class: "input mono",
    type: "text",
    placeholder: host ? `Add a pattern, e.g. ${host}/contracts` : "Add a pattern, e.g. *.dzo.com.ua",
    "aria-label": "Add URL pattern"
  });
  add.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Enter") return;
    const pattern = add.value.trim();
    if (pattern === "") return;
    add.value = "";
    store.patchSite(site.id, { patterns: [...site.patterns, pattern] });
  });

  const group = groupSites(config.sites).find(
    (g) => g.site.id === site.id || g.areas.some((a) => a.id === site.id)
  );
  const parent = group && group.site.id !== site.id ? group.site : null;
  const areas = group && group.site.id === site.id ? group.areas : [];
  const count = store.stackCount({ kind: "site", siteId: site.id });

  return h(
    "div",
    { class: "card settings" },
    h("div", { class: "settings-head", text: parent ? "Area settings" : "Site settings" }),
    // Where this row sits in the list, and why: both facts are consequences of
    // the patterns, so saying them here is the only place the user can learn
    // the rule without guessing.
    parent
      ? h("div", {
          class: "hint",
          text: `An area of ${parent.name} — its stacks win here, over the ones on ${parent.name} itself.`
        })
      : null,
    h("label", { class: "field" }, h("span", { class: "label", text: "Name" }), name),
    h(
      "div",
      { class: "field" },
      h("span", { class: "label", text: "Matches these URLs" }),
      site.patterns.length > 0 ? chips : null,
      add,
      h("span", {
        class: "hint",
        text:
          "A bare host (example.com) matches any scheme and path. A path " +
          "(example.com/tenders) matches that page and everything under it. " +
          "Add * to match anything, anywhere."
      }),
      siteScope(site) === "domain" && host !== ""
        ? h("span", {
            class: "hint",
            text: `A pattern with a path (${host}/contracts) makes a separate area under this site, with its own stacks.`
          })
        : null,
      // A site with no patterns matches nothing, so every stack on it is dead.
      // Said here rather than only at save time, where it would arrive long
      // after the mistake.
      site.patterns.length === 0
        ? h("span", { class: "errtext", text: "Without a pattern this site matches nothing." })
        : null
    ),
    h(
      "div",
      {},
      h("button", {
        type: "button",
        class: "btn btn-danger btn-sm",
        style: "margin-left:-10px",
        text: parent ? "Delete area…" : "Delete site…",
        onClick: () => confirmDelete(site.id, site.name, count, areas)
      })
    )
  );
}

// The stacks are the question, not the site: deleting them and promoting them
// to "runs everywhere" each lose something the other keeps, so both are asked
// for explicitly and neither is the default.
//
// The areas are not part of the question. They are sites in their own right
// with their own stacks, so deleting the host leaves them standing — said out
// loud, because the indentation suggests otherwise.
function confirmDelete(siteId: string, name: string, stacks: number, areas: Site[]): void {
  const orphans =
    areas.length > 0
      ? `\n\nIts ${plural(areas.length, "area")} (${areas.map((a) => a.name).join(", ")}) ` +
        `keep working and move up to the top of the list.`
      : "";
  if (stacks === 0) {
    if (confirm(`Delete the site "${name}"?${orphans}`)) store.deleteSite(siteId, false);
    return;
  }
  const keep = confirm(
    `"${name}" has ${stacks} stack${stacks === 1 ? "" : "s"}.${orphans}\n\n` +
      `OK — keep them as common stacks, running everywhere.\n` +
      `Cancel — choose to delete them instead.`
  );
  if (keep) {
    store.deleteSite(siteId, true);
    return;
  }
  if (confirm(`Delete "${name}" and its ${stacks} stack${stacks === 1 ? "" : "s"} for good?`)) {
    store.deleteSite(siteId, false);
  }
}
