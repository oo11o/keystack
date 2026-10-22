import type { Step } from "./schema";
import { MAX_WAIT_MS } from "./limits";

// What each step type looks like *as a form*. Until now a step's parameters
// existed only as an arm of the `Step` union plus prose comments, and their
// rules only as imperative checks inside the handler — neither of which a UI
// can read. This is the machine-readable half, and the single place a new step
// type registers itself with the builder.
//
// It does not replace the handlers' own validation: a step can arrive from an
// imported JSON file that never went through a form, so the handler stays the
// last word. What this buys is catching the mistake while it is being made.
//
// The builder calls steps "actions" — see redesign/HANDOFF.md. That is a label
// in the UI only: the keys here, in the schema and in an export are unchanged.

// How the field is edited and how it is read back.
//   selector  — a CSS selector; text input, no $vars (a selector is structure,
//               not data, and no step resolves one through a template today)
//   text      — a short literal
//   template  — short text that may contain $vars
//   url       — a template that must end up an http(s) URL
//   multiline — a textarea that may contain $vars (popup bodies)
//   number    — coerced to a number, bounded by min/max
//   key       — a KeyboardEvent.key name, e.g. "Enter"
//   varName   — the name a value is stored under, so \w+ only (it is read back
//               as $<name>, and core/context.ts's template regex is \w+)
export type FieldKind =
  | "selector"
  | "text"
  | "template"
  | "url"
  | "multiline"
  | "number"
  | "key"
  | "varName";

export type FieldSpec = {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  // Collapsed behind the form's "advanced" disclosure. Optional-and-rarely-set
  // rather than merely optional: a popup's title is advanced, but nothing
  // required ever is.
  advanced?: boolean;
  // Names the step's result rather than configuring what it does, so the
  // builder shows it in the Result box instead of among the fields.
  result?: boolean;
  placeholder?: string;
  help?: string;
  default?: string | number;
  min?: number;
  max?: number;
};

export type StepGroup = "read" | "write" | "wait" | "show" | "navigate";

// The glyph the builder puts on this step's tile. A name, not markup: core
// knows nothing about SVG, and options/icons.ts owns the drawing.
export type StepIcon =
  | "eye"
  | "copy"
  | "download"
  | "pencil"
  | "crosshair"
  | "pointer"
  | "key"
  | "clock"
  | "window"
  | "braces"
  | "newTab"
  | "navigate";

export type StepMeta = {
  label: string;
  group: StepGroup;
  icon: StepIcon;
  help: string;
  // True when the step feeds the context: the runner binds $value, $<step.id>
  // and $<saveAs> from its result (see content/runner.ts). The builder uses
  // this to work out which $vars a later step may reference.
  produces: boolean;
  // What the step leaves behind, in one sentence. For a producer it describes
  // the value; for everything else it says there is none, which is why the
  // builder shows no variable name for those steps.
  outNote: string;
  // The default name a producer's result is stored under — the thing a later
  // step reads as $<name>. Type-derived rather than s1/s2 so a stack reads as
  // prose: $text, $response. Non-producers have none.
  varName?: string;
  // True when a stack reads as finished once this step has run: a popup is
  // the answer the hotkey was pressed for. The runner does not treat it
  // specially — it dismisses the panel and carries on — this is the builder
  // declining to offer "and then?" where there is nothing sensible to add.
  endsStack?: boolean;
  // One line for the step list. Must tolerate a half-filled step — the
  // builder renders it while the user is still typing.
  summary(step: Step): string;
  fields: FieldSpec[];
};

// Reads a field off a step without the union narrowing every call site: the
// builder edits steps generically, and a step being built is legitimately
// incomplete.
function field(step: Step, name: string): unknown {
  return (step as unknown as Record<string, unknown>)[name];
}

function text(step: Step, name: string, fallback = "…"): string {
  const value = field(step, name);
  return value === undefined || value === "" ? fallback : String(value);
}

const selectorField: FieldSpec = {
  name: "selector",
  label: "Element",
  kind: "selector",
  required: true,
  placeholder: "#tender_id",
  help: "Press Pick and click the element on the page, or paste a CSS selector from DevTools (right-click › Copy › Copy selector)."
};

const saveAsField: FieldSpec = {
  name: "saveAs",
  label: "Also available as",
  kind: "varName",
  required: false,
  advanced: true,
  result: true,
  placeholder: "tender",
  help: "A second name for the result. The action's own variable name works anyway, so this is only here for configs that were written by hand."
};

const titleField: FieldSpec = {
  name: "title",
  label: "Title",
  kind: "template",
  required: false,
  advanced: true,
  placeholder: "Sync result"
};

// Record<Step["type"], …> on purpose: adding an arm to the union without
// adding an entry here is a compile error, the same discipline steps/index.ts
// uses for handlers.
export const STEP_META: Record<Step["type"], StepMeta> = {
  readBySelector: {
    label: "Read element",
    group: "read",
    icon: "eye",
    help: "Reads an element's value or text, so later actions can use it. The clipboard is left alone.",
    produces: true,
    outNote: "The element's value, or its text when it is not a field.",
    varName: "text",
    summary: (s) => text(s, "selector"),
    fields: [selectorField, saveAsField]
  },
  copyBySelector: {
    label: "Copy element to clipboard",
    group: "read",
    icon: "copy",
    help: "Reads the text of an element on the page and puts it on the system clipboard.",
    produces: false,
    outNote: "No result — the text goes to the clipboard only, so there is no variable for later actions.",
    summary: (s) => text(s, "selector"),
    fields: [selectorField]
  },
  fetchUrl: {
    label: "Fetch URL",
    group: "read",
    icon: "download",
    help: "Requests a URL through the service worker, so the page's CORS rules do not apply. JSON comes back pretty-printed. One request at a time.",
    produces: true,
    outNote: "The response body. JSON arrives pretty-printed.",
    varName: "response",
    summary: (s) => text(s, "url"),
    fields: [
      {
        name: "url",
        label: "URL",
        kind: "url",
        required: true,
        placeholder: "https://api.example.com/items/$text",
        help: "http(s) only. Each substituted value is URL-encoded, so a value with & cannot add a parameter."
      },
      saveAsField
    ]
  },
  inputToSelector: {
    label: "Set field value",
    group: "write",
    icon: "pencil",
    help: "Sets an input's value through the native setter and fires input/change, so React-style forms notice.",
    produces: false,
    outNote: "No result — it fills the field and nothing else.",
    summary: (s) => `${text(s, "value", '""')} → ${text(s, "selector")}`,
    fields: [
      selectorField,
      {
        name: "value",
        label: "Value",
        kind: "template",
        required: true,
        placeholder: "$text"
      }
    ]
  },
  focusBySelector: {
    label: "Focus element",
    group: "write",
    icon: "crosshair",
    help: "Puts the keyboard focus on an element — pair it with Press key, which goes to whatever has focus.",
    produces: false,
    outNote: "No result — it moves the keyboard focus.",
    summary: (s) => text(s, "selector"),
    fields: [selectorField]
  },
  clickBySelector: {
    label: "Click element",
    group: "write",
    icon: "pointer",
    help: "Clicks an element on the page. If the click navigates away, the rest of the stack is lost — put a Wait on the next page instead of assuming.",
    produces: false,
    outNote: "No result — it clicks and nothing else.",
    summary: (s) => text(s, "selector"),
    fields: [selectorField]
  },
  pressKey: {
    label: "Press key",
    group: "write",
    icon: "key",
    help: "Sends one key to whatever currently has focus. Aim it with Focus element first.",
    produces: false,
    outNote: "No result — it sends the key and nothing else.",
    summary: (s) => text(s, "key"),
    fields: [
      {
        name: "key",
        label: "Key",
        kind: "key",
        required: true,
        placeholder: "Enter",
        help: "A KeyboardEvent.key name: Enter, Escape, Tab, ArrowDown, a…"
      }
    ]
  },
  wait: {
    label: "Wait (fixed)",
    group: "wait",
    icon: "clock",
    help: "A flat pause for a page that needs a moment to catch up. A fixed delay is a guess, so leave headroom: too short fails on a slow day.",
    produces: false,
    outNote: "No result — it only pauses.",
    summary: (s) => `${text(s, "ms", "?")}ms`,
    fields: [
      {
        name: "ms",
        label: "Milliseconds",
        kind: "number",
        required: true,
        placeholder: "500",
        min: 0,
        max: MAX_WAIT_MS
      }
    ]
  },
  popup: {
    label: "Show popup",
    group: "show",
    icon: "window",
    help: "An in-page panel that blocks the stack until dismissed, so a popup mid-stack is a checkpoint. On success it replaces the toast.",
    produces: false,
    outNote: "No result — it shows the panel and waits for you to dismiss it.",
    endsStack: true,
    summary: (s) => text(s, "title", text(s, "body")),
    fields: [
      titleField,
      {
        name: "body",
        label: "Body",
        kind: "multiline",
        required: true,
        placeholder: "$response"
      }
    ]
  },
  popupJson: {
    label: "Show popup (JSON)",
    group: "show",
    icon: "braces",
    help: "The same panel with a live, path-aware line filter — for bodies that run to hundreds of lines.",
    produces: false,
    outNote: "No result — it shows the panel and waits for you to dismiss it.",
    endsStack: true,
    summary: (s) => text(s, "title", text(s, "body")),
    fields: [
      titleField,
      {
        name: "body",
        label: "Body",
        kind: "multiline",
        required: true,
        placeholder: "$response"
      }
    ]
  },
  openUrlInNewTab: {
    label: "Open URL in a new tab",
    group: "navigate",
    icon: "newTab",
    help: "Opens a tab and leaves this page alone, so the rest of the stack keeps running here.",
    produces: false,
    outNote: "No result — the new tab is on its own.",
    summary: (s) => text(s, "url"),
    fields: [
      {
        name: "url",
        label: "URL",
        kind: "url",
        required: true,
        placeholder: "https://example.com/t/$text"
      }
    ]
  },
  openUrlInCurrentTab: {
    label: "Go to URL (this tab)",
    group: "navigate",
    icon: "navigate",
    help: "Leaves this page. The rest of the stack is parked and picked up by the next page in this tab, within 15 seconds.",
    produces: false,
    outNote: "No result — the actions after it continue on the next page.",
    summary: (s) => text(s, "url"),
    fields: [
      {
        name: "url",
        label: "URL",
        kind: "url",
        required: true,
        placeholder: "http://dzo.lh/cabinet/logout"
      }
    ]
  }
};

// The order the "Add action" menu offers, and the heading each group gets.
export const STEP_GROUPS: { group: StepGroup; label: string }[] = [
  { group: "read", label: "Read" },
  { group: "write", label: "Act on the page" },
  { group: "wait", label: "Wait" },
  { group: "show", label: "Show" },
  { group: "navigate", label: "Navigate" }
];

export function isStepType(type: unknown): type is Step["type"] {
  return typeof type === "string" && Object.prototype.hasOwnProperty.call(STEP_META, type);
}

export const STEP_TYPES = Object.keys(STEP_META) as Step["type"][];

// The fields that configure what a step does — everything the builder shows as
// a form field. `result` fields are left out: they name the step's output, and
// the builder edits that in the Result box instead.
export function formFields(type: Step["type"]): FieldSpec[] {
  return STEP_META[type].fields.filter((f) => !f.result);
}

// Fields whose value may contain $vars — where the builder offers the available
// variables, and what the unknown-variable check has to look at.
export function templateFields(type: Step["type"]): FieldSpec[] {
  return STEP_META[type].fields.filter(
    (f) => f.kind === "template" || f.kind === "url" || f.kind === "multiline"
  );
}

// A new step of this type, with every default filled in and nothing else.
// Ids are the caller's business — only it knows which are taken.
export function blankStep(type: Step["type"], id: string): Step {
  const step: Record<string, unknown> = { id, type };
  for (const f of STEP_META[type].fields) {
    if (f.default !== undefined) step[f.name] = f.default;
    else if (f.required) step[f.name] = f.kind === "number" ? 0 : "";
  }
  return step as unknown as Step;
}
