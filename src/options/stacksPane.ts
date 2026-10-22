import { columnHead, h, row } from "./el";
import { icon } from "./icons";
import { chordText } from "../core/keys";
import type { Stack } from "../core/schema";
import * as store from "./store";
import { COMMON } from "./store";
import { hotkeyField, keyCaps } from "./chordInput";

// Column 2 — when. Every stack in the selected scope, each a card that expands
// in place into its own editor: a stack is a hotkey plus a name plus where it
// runs, and that is little enough to edit where it sits rather than in a
// separate panel further down the page.

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function renderStacks(pane: HTMLElement): void {
  const scope = store.getScope();
  const stacks = store.stacksInScope();
  const current = store.currentStack();
  const relations = store.chordRelations();
  pane.className = "c-stack";

  const scopeLabel =
    scope.kind === "common" ? "Common" : store.siteName(scope.siteId);

  pane.append(
    columnHead({
      id: "h-stacks",
      tone: "stack",
      glyph: "layers",
      eyebrow: "2 · When",
      title: "Stacks",
      count: stacks.length,
      sub: ["A hotkey that runs a sequence of actions"]
    })
  );

  pane.append(
    h("div", {
      class: "sectionlabel",
      text: scope.kind === "common" ? "Stacks in Common" : `Stacks on ${scopeLabel}`
    })
  );

  if (stacks.length === 0) {
    pane.append(h("div", { class: "empty", text: "No stacks here yet." }));
  }

  for (const stack of stacks) {
    const selected = current?.id === stack.id;
    const relation = relations.find((r) => r.stackId === stack.id);
    // Only a same-level pair is a clash. One level apart is precedence doing
    // its job, and the note below says which way round it goes.
    const clash = relation && relation.conflicts.length > 0 ? relation : undefined;
    const card = h("div", {
      class: `card ${selected ? "is-sel" : ""} ${stack.enabled ? "" : "is-off"}`.trim()
    });

    card.append(
      h(
        "div",
        { class: "stackrow" },
        h(
          "button",
          {
            type: "button",
            class: "stackpick",
            "aria-expanded": selected ? "true" : "false",
            onClick: () => store.toggleStack(stack.id)
          },
          h(
            "span",
            { class: "steptext" },
            h("span", { class: "stackname", text: stack.name }),
            h("span", {
              class: "rowsub",
              style: "margin:0",
              text: `${plural(stack.steps.length, "action")} · ${stack.enabled ? "on" : "off"}`
            })
          ),
          keyCaps(stack.binding, clash ? "is-conflict" : "")
        ),
        h("button", {
          type: "button",
          class: `switch ${stack.enabled ? "is-on" : ""}`.trim(),
          "aria-pressed": stack.enabled ? "true" : "false",
          "aria-label": `Enabled: ${stack.name}`,
          onClick: () => store.patchStack(stack.id, { enabled: !stack.enabled })
        })
      )
    );

    if (clash) {
      card.append(
        h(
          "div",
          { class: "conflict" },
          icon("warn", 16),
          h(
            "span",
            {},
            "Same hotkey as ",
            h("strong", { text: rivalNames(stack.siteId ?? null, clash.conflicts) })
          )
        )
      );
    }

    // The same chord one level apart: worth saying, because the card cannot
    // otherwise explain why pressing it here does something else.
    for (const note of precedenceNotes(stack, relation)) card.append(note);

    if (selected) card.append(stackEditor(clash !== undefined));
    pane.append(card);
  }

  pane.append(
    h(
      "button",
      {
        type: "button",
        class: "btn btn-dashed",
        onClick: () => store.addStack("New stack")
      },
      icon("plus"),
      "New stack"
    )
  );

  // On a site, the stacks that also work here but live in Common. Not listed
  // inline: they are not this site's, and showing them as if they were would
  // make "delete" and "move" ambiguous.
  if (scope.kind === "site") {
    const common = store.stackCount(COMMON);
    if (common > 0) {
      pane.append(
        row(
          { class: "is-dashed", onClick: () => store.selectScope(COMMON) },
          h("span", { class: "avatar avatar-globe" }, icon("globe")),
          h(
            "span",
            { class: "rowbody" },
            h("span", { class: "rowtitle", style: "font-size:14px", text: `+${common} more from Common` }),
            h("span", { class: "rowsub", text: "These also work on this site" })
          ),
          icon("chevronRight")
        )
      );
    }
  }
}

// "Paste test password (Common)" — the site is only named when it is not the
// one being looked at, because there it is the only thing that distinguishes
// the two stacks.
function rivalNames(siteId: string | null, rivals: store.Rival[]): string {
  return rivals
    .map((r) => (r.siteId === siteId ? r.name : `${r.name} (${r.siteName})`))
    .join(", ");
}

// Which stack wins where both apply, said from this card's point of view. A
// narrower stack beats a wider one — this URL, then this domain, then
// everywhere — so these read as "instead of", never as a problem.
function precedenceNotes(
  stack: Stack,
  relation: store.ChordRelations | undefined
): HTMLElement[] {
  if (!relation) return [];
  const mine = stack.siteId ?? null;
  const notes: HTMLElement[] = [];
  if (relation.overrides.length > 0) {
    notes.push(
      h(
        "div",
        { class: "precedence" },
        icon("check", 16),
        h(
          "span",
          {},
          "Runs here instead of ",
          h("strong", { text: rivalNames(mine, relation.overrides) })
        )
      )
    );
  }
  if (relation.overriddenBy.length > 0) {
    notes.push(
      h(
        "div",
        { class: "precedence" },
        icon("navigate", 16),
        h(
          "span",
          {},
          h("strong", { text: rivalNames(mine, relation.overriddenBy) }),
          " runs instead on the pages it covers"
        )
      )
    );
  }
  return notes;
}

function stackEditor(conflicted: boolean): HTMLElement {
  const stack = store.currentStack()!;
  const config = store.getConfig();
  const body = h("div", { class: "cardbody" });

  const name = h("input", { id: "stack-name", class: "input", type: "text", value: stack.name });
  name.addEventListener("input", () => store.patchStack(stack.id, { name: name.value }));
  body.append(h("label", { class: "field" }, h("span", { class: "label", text: "Name" }), name));

  const hotkey = hotkeyField(
    stack.binding,
    (binding) => store.patchStack(stack.id, { binding }),
    (binding) =>
      // A chord with no modifier would eat an ordinary keypress on every page
      // this stack applies to: the resolver only steps aside for text fields.
      store.isBareKey(binding)
        ? "no modifier — this would swallow that key on every page the stack applies to"
        : null
  );
  if (conflicted) {
    hotkey.append(
      h("span", {
        class: "errtext",
        text: "Pressing it may run the wrong stack. Record a different hotkey for one of them."
      })
    );
  }
  body.append(hotkey);

  const site = h(
    "select",
    { id: "stack-site", class: "input" },
    h("option", { value: "", text: "Common (all sites)", selected: stack.siteId == null }),
    ...config.sites.map((s) =>
      h("option", { value: s.id, text: s.name, selected: stack.siteId === s.id })
    )
  );
  site.addEventListener("change", () => {
    const siteId = site.value === "" ? null : site.value;
    store.patchStack(stack.id, { siteId });
    // The stack has left the column it was in; follow it, or the selection
    // would land on a stack the user never asked for.
    store.selectScope(siteId == null ? COMMON : { kind: "site", siteId });
    store.selectStack(stack.id);
  });
  body.append(
    h(
      "label",
      { class: "field" },
      h("span", { class: "label", text: "Site" }),
      site,
      h("span", { class: "hint", text: "Pick another site here to move this stack." })
    )
  );

  body.append(
    h(
      "div",
      { class: "rowline" },
      h("button", {
        type: "button",
        class: "btn btn-sm",
        text: "Duplicate",
        onClick: () => store.duplicateStack(stack.id)
      }),
      h("div", { class: "spacer" }),
      h("button", {
        type: "button",
        class: "btn btn-danger btn-sm",
        text: "Delete stack",
        onClick: () => {
          const what = `${stack.steps.length} action${stack.steps.length === 1 ? "" : "s"}`;
          if (confirm(`Delete the stack "${stack.name}" and its ${what}?`)) {
            store.deleteStack(stack.id);
          }
        }
      })
    )
  );

  // The spelled-out chord is in the hotkey field; this is the one place the
  // whole stack is described in a sentence, for a screen reader reaching the
  // editor without having seen the keycaps.
  body.setAttribute("aria-label", `${stack.name}, ${chordText(stack.binding)}`);
  return body;
}
