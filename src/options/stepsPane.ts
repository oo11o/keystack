import { columnHead, h, iconButton } from "./el";
import { icon } from "./icons";
import type { Step } from "../core/schema";
import { STEP_GROUPS, STEP_META, STEP_TYPES, formFields, templateFields } from "../core/stepMeta";
import { availableVars, referencedVars } from "../core/vars";
import * as store from "./store";
import * as probe from "./probe";
import { renderField } from "./fields";
import { keyCaps } from "./chordInput";

// Column 3 — what. The actions of the open stack as a pipeline: the hotkey that
// starts it, one card per action in run order, and the point where another one
// is added. Nothing here knows what an action type is — the list of types comes
// from STEP_META and each form is its `fields` run through renderField, so a new
// type appears here the moment it is registered.
//
// "Actions" is the UI's word for steps. The stored config still says steps; see
// core/stepMeta.ts.

export function renderSteps(pane: HTMLElement): void {
  const stack = store.currentStack();
  pane.className = "c-act";

  pane.append(
    columnHead({
      id: "h-actions",
      tone: "act",
      glyph: "play",
      eyebrow: "3 · What",
      title: "Actions",
      count: stack?.steps.length ?? 0,
      sub: stack
        ? ["In ", h("strong", { text: stack.name }), " · run top to bottom"]
        : ["Pick a stack on the left"]
    })
  );

  if (!stack) {
    pane.append(h("div", { class: "empty", text: "Pick a stack, or add one." }));
    return;
  }

  // Pick and Test happen inside a field, but what goes wrong with them is
  // about the tab rather than the field — no page to talk to, no content script
  // in it — so it is said once, here, above the pipeline.
  const trouble = probe.lastTrouble();
  if (trouble) pane.append(h("div", { class: "troublebar", text: trouble }));

  const pipeline = h("div", { class: "pipeline" });
  pipeline.append(triggerRow());

  const current = store.currentStep();
  stack.steps.forEach((step, index) => {
    pipeline.append(actionRow(step, index, stack.steps.length, current?.id === step.id));
  });

  // A popup is the answer the hotkey was pressed for: it is the last action a
  // stack has, so the pipeline ends there rather than asking "and then?".
  const last: Step | undefined = stack.steps[stack.steps.length - 1];
  pipeline.append(last && STEP_META[last.type].endsStack ? endNote(last) : addRow());
  pane.append(pipeline);
}

/* ── the pipeline ──────────────────────────────────────────────────────── */

function rail(...children: (Node | string | null)[]): HTMLElement {
  return h("div", { class: "rail" }, ...(children.filter(Boolean) as Node[]));
}

// What starts the stack, said in one line. It is the only place the hotkey and
// the site appear together, which is also the only way to see that a stack is
// bound to a chord on a site where it can never fire.
function triggerRow(): HTMLElement {
  const stack = store.currentStack()!;
  const where = stack.siteId == null ? "any site" : store.siteName(stack.siteId);

  const body = h(
    "div",
    { class: "prow-body trigger-body" },
    h(
      "div",
      { class: "triggerline" },
      h("span", { class: "soft", text: "When you press" }),
      keyCaps(stack.binding),
      h("span", { class: "soft", text: "on" }),
      h("span", { class: "where", text: where })
    )
  );
  if (!stack.enabled) {
    body.append(
      h("div", { class: "warn", text: "This stack is off — the hotkey does nothing right now." })
    );
  }

  return h(
    "div",
    { class: "prow" },
    rail(h("span", { class: "node node-trigger" }, icon("bolt")), h("span", { class: "line" })),
    body
  );
}

function actionRow(step: Step, index: number, total: number, open: boolean): HTMLElement {
  const node = h("span", { class: "node", text: String(index + 1) });

  return h(
    "div",
    { class: "prow" },
    rail(
      h("span", { class: "seg", style: "height:14px" }),
      node,
      h("span", { class: "line" })
    ),
    h("div", { class: "prow-body" }, actionCard(step, index, total, open))
  );
}

function actionCard(step: Step, index: number, total: number, open: boolean): HTMLElement {
  const stack = store.currentStack()!;
  const meta = STEP_META[step.type];
  // Neither arrow may leave an action standing after a popup: the popup is
  // where the stack ends, so it cannot move off the bottom, and the action
  // above it cannot move past it.
  const ends = meta.endsStack === true;
  const next = stack.steps[index + 1];
  const endsAfter = next !== undefined && STEP_META[next.type].endsStack === true;
  const card = h("div", { class: `card step ${open ? "is-open" : ""}`.trim() });

  const text = h(
    "span",
    { class: "steptext" },
    h("span", { class: "steptitle", text: meta.label }),
    h("span", { class: "stepsum", text: meta.summary(step) })
  );

  const head = h(
    "button",
    {
      type: "button",
      class: "stephead",
      "aria-expanded": open ? "true" : "false",
      onClick: () => store.toggleStep(step.id)
    },
    h("span", { class: "typeicon" }, icon(meta.icon)),
    text
  );

  const missing = missingVars(step, index);
  if (missing) head.append(h("span", { class: "errchip mono", text: `$${missing} undefined` }));
  if (meta.produces) head.append(h("span", { class: "outchip mono", text: `→ $${step.id}` }));

  card.append(
    h(
      "div",
      { class: "stephead-row" },
      head,
      h(
        "div",
        { class: "steptools" },
        iconButton("up", "Move up", () => move(step.id, -1), { disabled: index === 0 || ends }),
        iconButton("down", "Move down", () => move(step.id, 1), {
          disabled: index === total - 1 || endsAfter
        }),
        iconButton("copy", "Duplicate action", () => store.duplicateStep(step.id)),
        iconButton("trash", "Delete action", () => store.deleteStep(step.id))
      )
    )
  );

  if (open) card.append(actionBody(step, index));
  return card;
}

function move(id: string, delta: number): void {
  store.moveStep(id, delta);
}

// The first $name this action references that will not exist by the time it
// runs — the chip on the header, which is how an unknown variable is visible
// without opening every card.
function missingVars(step: Step, index: number): string | null {
  const stack = store.currentStack()!;
  const known = new Set(availableVars(stack, index, store.getSecretNames()).map((v) => v.name));
  for (const spec of templateFields(step.type)) {
    const value = (step as unknown as Record<string, unknown>)[spec.name];
    if (typeof value !== "string") continue;
    const unknown = referencedVars(value).find((name) => !known.has(name));
    if (unknown) return unknown;
  }
  return null;
}

function actionBody(step: Step, index: number): HTMLElement {
  const stack = store.currentStack()!;
  const meta = STEP_META[step.type];
  // Lazily, and per call: what an action may read depends on where it sits, and
  // it can be moved while its form is open.
  const vars = () => availableVars(stack, index, store.getSecretNames());

  const body = h("div", { class: "cardbody" }, h("p", { class: "stepdesc", text: meta.help }));

  const fields = formFields(step.type);
  const plain = fields.filter((f) => !f.advanced);
  const advanced = fields.filter((f) => f.advanced);

  const context = (spec: { name: string; kind: string }) => ({
    value: (step as unknown as Record<string, unknown>)[spec.name],
    onChange: (value: string) => store.patchStep(step.id, { [spec.name]: coerce(spec.kind, value) }),
    vars,
    testKey: probe.testKey(stack.id, step.id, spec.name)
  });

  for (const spec of plain) body.append(renderField(spec, context(spec)));

  if (advanced.length > 0) {
    const details = h("details", { class: "advanced" }, h("summary", { text: "Advanced" }));
    // Open when something is set: an advanced field with a value must not hide.
    let anySet = false;
    for (const spec of advanced) {
      const value = (step as unknown as Record<string, unknown>)[spec.name];
      if (value !== undefined && value !== "" && value !== spec.default) anySet = true;
      details.append(renderField(spec, context(spec)));
    }
    if (anySet) details.open = true;
    body.append(details);
  }

  body.append(resultBox(step));
  return body;
}

/* ── the Result box ────────────────────────────────────────────────────── */

// What the action leaves behind. For a producer that is a variable, and naming
// it is the single most useful thing the builder can ask for: $contractId reads
// where $s2 has to be remembered. For everything else there is no variable at
// all, and saying so is what stops people looking for one.
function resultBox(step: Step): HTMLElement {
  const meta = STEP_META[step.type];
  const box = h(
    "div",
    { class: "outbox" },
    h("div", { class: "outbox-head", text: "Result" })
  );

  if (!meta.produces) {
    box.append(h("div", { class: "outnote", text: meta.outNote }));
    return box;
  }

  box.append(
    h(
      "div",
      { class: "outline" },
      h("span", { text: "Later actions can use it as" }),
      h("span", { class: "outchip mono", text: `$${step.id}` })
    ),
    varNameField(step),
    h("div", { class: "hint", text: meta.outNote })
  );

  const saveAs = (step as { saveAs?: string }).saveAs;
  if (saveAs) {
    box.append(
      h(
        "div",
        { class: "outline" },
        h("span", { class: "hint", text: "Also available as" }),
        h("span", { class: "outchip mono", text: `$${saveAs}` })
      )
    );
  }
  return box;
}

// The variable's name is the action's id — $<id> is how the runner binds it —
// so renaming it can break a later template. The rename is applied on blur, not
// per keystroke, or every intermediate spelling would count as a rename.
function varNameField(step: Step): HTMLElement {
  const stack = store.currentStack()!;
  const input = h("input", { id: "step-var", class: "input mono", type: "text", value: step.id });
  const problem = h("div", { class: "errtext", hidden: true });

  const refuse = (message: string): void => {
    problem.textContent = message;
    problem.hidden = false;
    input.value = step.id;
  };

  const commit = (): void => {
    const next = input.value.trim();
    if (next === step.id) return;
    if (!/^\w+$/.test(next)) return refuse("letters, digits and _ only — it is used as $name");
    if (stack.steps.some((s) => s.id === next)) return refuse(`"${next}" is already taken in this stack`);

    const breaks = store.renamesBreak(stack, step.id);
    if (breaks.length > 0) {
      const ok = confirm(
        `${breaks.map((b) => b.message).join("\n")}\n\n` +
          `Renaming this variable will not update those. Rename anyway?`
      );
      if (!ok) {
        input.value = step.id;
        return;
      }
    }
    store.setStepId(step.id, next);
  };

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") input.blur();
  });

  return h(
    "label",
    { class: "field" },
    h("span", { class: "label", text: "Variable name" }),
    input,
    h("span", { class: "hint", text: "Name it after what it holds, so later actions read clearly." }),
    problem
  );
}

/* ── adding an action ──────────────────────────────────────────────────── */

function endNote(last: Step): HTMLElement {
  return h(
    "div",
    { class: "prow" },
    rail(h("span", { class: "seg", style: "height:6px" }), h("span", { class: "node node-end" }, icon("check"))),
    h(
      "div",
      { class: "prow-body" },
      h("div", { class: "endnote", text: `${STEP_META[last.type].label} ends the stack.` })
    )
  );
}

function addRow(): HTMLElement {
  const wrap = h("div", { class: "prow-body" });
  const toggle = h(
    "button",
    { type: "button", class: "btn btn-dashed", style: "justify-content:space-between;padding:0 16px" },
    "Add action",
    icon("chevronDown")
  );
  let menu: HTMLElement | null = null;

  // A disclosure rather than a <select>: the types are grouped and each carries
  // a line of help, which is what makes the list browsable by someone who does
  // not already know the vocabulary.
  toggle.addEventListener("click", () => {
    if (menu) {
      menu.remove();
      menu = null;
      toggle.setAttribute("aria-expanded", "false");
      return;
    }
    menu = h("div", { class: "type-menu" });
    for (const { group, label } of STEP_GROUPS) {
      const types = STEP_TYPES.filter((t) => STEP_META[t].group === group);
      if (types.length === 0) continue;
      menu.append(h("div", { class: "cat", text: label }));
      for (const type of types) {
        const meta = STEP_META[type];
        menu.append(
          h(
            "button",
            {
              type: "button",
              onClick: () => store.addStep(type)
            },
            h("span", { class: "typeicon" }, icon(meta.icon)),
            h(
              "span",
              {},
              h("div", { class: "name", text: meta.label }),
              h("div", { class: "note", text: meta.help })
            )
          )
        );
      }
    }
    toggle.setAttribute("aria-expanded", "true");
    wrap.append(menu);
  });

  wrap.append(toggle);
  return h(
    "div",
    { class: "prow" },
    rail(h("span", { class: "seg", style: "height:6px" }), h("span", { class: "node node-add" }, icon("plus"))),
    wrap
  );
}

function coerce(kind: string, value: string): string | number {
  if (kind !== "number") return value;
  const n = Number(value);
  // An unparseable number is left as the raw text so the field can say why;
  // parseConfig refuses it at save time either way.
  return value.trim() === "" || !Number.isFinite(n) ? value : n;
}
