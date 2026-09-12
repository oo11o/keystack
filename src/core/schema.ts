// Types now, so v0.2+ doesn't need a rewrite — see .claude/plan/plan.md.

export type Binding = {
  code: string; // KeyboardEvent.code, e.g. "Digit1" — NOT .key (layout-independent)
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

export type Step =
  | { id: string; type: "copyBySelector"; selector: string }
  | { id: string; type: "readBySelector"; selector: string; saveAs?: string }
  | { id: string; type: "inputToSelector"; selector: string; value: string };

export type Stack = {
  id: string;
  name: string;
  binding: Binding;
  enabled: boolean;
  steps: Step[]; // array from day one, even though v0 runs exactly one
};

export type Config = { schemaVersion: 1; stacks: Stack[] };
