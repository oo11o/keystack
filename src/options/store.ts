import type { Binding, Config, Site, Stack, Step } from "../core/schema";
import { SCHEMA_VERSION } from "../core/schema";
import { isParsed, parseConfig, saveConfig, seedIfEmpty } from "../core/configStore";
import { isCommon, siteFor, siteScope, sitesOverlap } from "../core/match";
import { STEP_META, blankStep, templateFields } from "../core/stepMeta";
import { referencedVars, unknownVars } from "../core/vars";

// The builder's draft. Edits land here, not in storage: a half-typed selector
// must not go live on a hotkey, and a write per keystroke would be wasteful.
// Saving is an explicit act, and it validates.

// The Sites column's selection. "common" is not a site — it is the absence of
// one — so it cannot be an id.
export type Scope = { kind: "common" } | { kind: "site"; siteId: string };

export const COMMON: Scope = { kind: "common" };

export function scopeKey(scope: Scope): string {
  return scope.kind === "common" ? "common" : `site:${scope.siteId}`;
}

export function sameScope(a: Scope, b: Scope): boolean {
  return scopeKey(a) === scopeKey(b);
}

// Every change redraws the three columns. That is affordable — the config is a
// few kilobytes and there is nothing to diff — and main.ts puts the caret back
// where it was afterwards, so it is also invisible while typing.
type Listener = () => void;

let config: Config = { schemaVersion: SCHEMA_VERSION, stacks: [], sites: [] };
let saved = JSON.stringify(config);
let scope: Scope = COMMON;
let stackId: string | null = null;
let stepId: string | null = null;
let secretNames: string[] = [];
// The URL of the tab the builder was opened from, for the "This site" row.
let pageUrl: string | null = null;
const listeners: Listener[] = [];

export function subscribe(listener: Listener): void {
  listeners.push(listener);
}

function announce(): void {
  for (const listener of listeners) listener();
}

export function getConfig(): Config {
  return config;
}

export function isDirty(): boolean {
  return JSON.stringify(config) !== saved;
}

export function getScope(): Scope {
  return scope;
}

export function getPageUrl(): string | null {
  return pageUrl;
}

export function getSecretNames(): string[] {
  return secretNames;
}

export async function init(url: string | null, secrets: string[]): Promise<void> {
  pageUrl = url;
  secretNames = secrets;
  // seedIfEmpty rather than loadConfig: opening the builder on a profile whose
  // storage was cleared should show the bundled stacks, not an empty page.
  config = await seedIfEmpty();
  saved = JSON.stringify(config);
  // Start where the user is: if the page they came from belongs to a site, open
  // that site rather than making them find it.
  const site = pageUrl ? siteFor(pageUrl, config.sites) : null;
  scope = site ? { kind: "site", siteId: site.id } : COMMON;
  // Nothing is open to begin with. Opening a stack means opening its editor,
  // and the builder has no business guessing which stack out of ten the user
  // came to edit — the column reads as a list until they pick one.
  clearSelection();
  announce();
}

/* ── selection ─────────────────────────────────────────────────────────── */

export function selectScope(next: Scope): void {
  scope = next;
  // These are a different site's stacks, and none of them was asked for.
  clearSelection();
  announce();
}

export function selectStack(id: string | null): void {
  stackId = id;
  // Opening a stack opens its pipeline, not one of its actions: the same
  // reason nothing is open on arrival holds one level down.
  stepId = null;
  announce();
}

// Only one stack editor is open at a time — clicking the open one closes it,
// the same way an action card works.
export function toggleStack(id: string): void {
  if (stackId === id) {
    clearSelection();
    announce();
    return;
  }
  selectStack(id);
}

export function selectStep(id: string | null): void {
  stepId = id;
  announce();
}

// Only one action card is open at a time — clicking the open one closes it.
export function toggleStep(id: string): void {
  stepId = stepId === id ? null : id;
  announce();
}

function clearSelection(): void {
  stackId = null;
  stepId = null;
}

export function stacksInScope(): Stack[] {
  return config.stacks.filter((s) =>
    scope.kind === "common" ? s.siteId == null : s.siteId === scope.siteId
  );
}

export function currentStack(): Stack | null {
  return config.stacks.find((s) => s.id === stackId) ?? null;
}

export function currentStep(): Step | null {
  return currentStack()?.steps.find((s) => s.id === stepId) ?? null;
}

export function stackCount(scopeOf: Scope): number {
  return config.stacks.filter((s) =>
    scopeOf.kind === "common" ? s.siteId == null : s.siteId === scopeOf.siteId
  ).length;
}

/* ── ids ───────────────────────────────────────────────────────────────── */

// Ids end up in URLs, in resume records and — for steps — in $<id>, so they are
// kept to \w and - and are never silently reused.
function slug(text: string, fallback: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base === "" ? fallback : base;
}

function freeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// A step's id is also the name its result is read back by ($<id>), so a
// producer gets one named after what it holds — $text, $response — and only a
// step with no result falls back to s1, s2. First free rather than
// steps.length + 1: after a delete that would reuse a name an earlier template
// may still point at.
function freeStepId(stack: Stack, type: Step["type"]): string {
  const taken = new Set(stack.steps.map((s) => s.id));
  const base = STEP_META[type].varName;
  if (base && !taken.has(base)) return base;
  for (let n = base ? 2 : 1; ; n++) {
    const candidate = base ? `${base}${n}` : `s${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/* ── sites ─────────────────────────────────────────────────────────────── */

export function addSite(name: string, patterns: string[]): Site {
  const site: Site = {
    id: freeId(slug(name, "site"), new Set(config.sites.map((s) => s.id))),
    name: name.trim() === "" ? "Site" : name.trim(),
    patterns: cleanPatterns(patterns)
  };
  config.sites = [...config.sites, site];
  scope = { kind: "site", siteId: site.id };
  clearSelection();
  announce();
  return site;
}

export function patchSite(siteId: string, patch: Partial<Omit<Site, "id">>): void {
  config.sites = config.sites.map((s) =>
    s.id === siteId
      ? { ...s, ...patch, patterns: patch.patterns ? cleanPatterns(patch.patterns) : s.patterns }
      : s
  );
  announce();
}

// `keepStacks` moves this site's stacks to common; without it they go with the
// site. Asked out loud in the UI rather than guessed — either answer loses
// something the other keeps.
export function deleteSite(siteId: string, keepStacks: boolean): void {
  config.sites = config.sites.filter((s) => s.id !== siteId);
  config.stacks = keepStacks
    ? config.stacks.map((s) => (s.siteId === siteId ? { ...s, siteId: null } : s))
    : config.stacks.filter((s) => s.siteId !== siteId);
  scope = COMMON;
  clearSelection();
  announce();
}

// "Common" is not a site, so it has no name of its own — but every label that
// names where a stack runs needs one word for it.
export function siteName(siteId: string | null): string {
  if (siteId == null) return "Common";
  return config.sites.find((s) => s.id === siteId)?.name ?? siteId;
}

export function cleanPatterns(patterns: string[]): string[] {
  return patterns.map((p) => p.trim()).filter((p) => p !== "");
}

/* ── stacks ────────────────────────────────────────────────────────────── */

const DEFAULT_BINDING: Binding = {
  code: "Digit1",
  ctrl: true,
  alt: true,
  shift: false,
  meta: false
};

export function addStack(name: string): Stack {
  const stack: Stack = {
    id: freeId(slug(name, "stack"), new Set(config.stacks.map((s) => s.id))),
    name: name.trim() === "" ? "New stack" : name.trim(),
    binding: freeBinding(),
    enabled: true,
    steps: [],
    siteId: scope.kind === "common" ? null : scope.siteId
  };
  config.stacks = [...config.stacks, stack];
  stackId = stack.id;
  stepId = null;
  announce();
  return stack;
}

// ⌃⌥1…⌃⌥9, ⌃⌥0, then whatever is left: a new stack should arrive with a chord
// that works, not one that silently shadows an existing stack.
function freeBinding(): Binding {
  const used = new Set(
    config.stacks
      .filter((s) => (scope.kind === "common" ? s.siteId == null : s.siteId === scope.siteId))
      .map((s) => s.binding.code)
  );
  const codes = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"];
  const free = codes.find((code) => !used.has(code));
  return { ...DEFAULT_BINDING, code: free ?? "KeyK" };
}

export function patchStack(id: string, patch: Partial<Omit<Stack, "id" | "steps">>): void {
  config.stacks = config.stacks.map((s) => (s.id === id ? { ...s, ...patch } : s));
  announce();
}

export function deleteStack(id: string): void {
  config.stacks = config.stacks.filter((s) => s.id !== id);
  if (stackId === id) clearSelection();
  announce();
}

export function duplicateStack(id: string): void {
  const source = config.stacks.find((s) => s.id === id);
  if (!source) return;
  const copy: Stack = {
    ...structuredClone(source),
    id: freeId(`${source.id}-copy`, new Set(config.stacks.map((s) => s.id))),
    name: `${source.name} (copy)`,
    // Not the same chord: two enabled stacks on one chord means the second is
    // dead weight, and a copy is almost never meant to replace the original.
    enabled: false
  };
  config.stacks = [...config.stacks, copy];
  stackId = copy.id;
  announce();
}

/* ── steps ─────────────────────────────────────────────────────────────── */

function withSteps(id: string, fn: (steps: Step[]) => Step[]): void {
  config.stacks = config.stacks.map((s) => (s.id === id ? { ...s, steps: fn(s.steps) } : s));
  announce();
}

export function addStep(type: Step["type"]): void {
  const stack = currentStack();
  if (!stack) return;
  const step = blankStep(type, freeStepId(stack, type));
  withSteps(stack.id, (steps) => [...steps, step]);
  stepId = step.id;
  announce();
}

export function patchStep(id: string, patch: Record<string, unknown>): void {
  const stack = currentStack();
  if (!stack) return;
  withSteps(stack.id, (steps) =>
    steps.map((step) => {
      if (step.id !== id) return step;
      const next = { ...step, ...patch } as Record<string, unknown>;
      // An optional field cleared is an absent field, not an empty one — the
      // handlers read `timeoutMs ?? DEFAULT`, which an empty string defeats.
      for (const spec of STEP_META[step.type].fields) {
        if (!spec.required && next[spec.name] === "") delete next[spec.name];
      }
      return next as unknown as Step;
    })
  );
}

// Renaming a step id is renaming a variable: $<old id> in a later template
// stops resolving. Reported by the caller, which has the list from renamesBreak.
export function setStepId(oldId: string, newId: string): void {
  const stack = currentStack();
  if (!stack) return;
  withSteps(stack.id, (steps) =>
    steps.map((step) => (step.id === oldId ? ({ ...step, id: newId } as Step) : step))
  );
  if (stepId === oldId) stepId = newId;
  announce();
}

export function deleteStep(id: string): void {
  const stack = currentStack();
  if (!stack) return;
  const index = stack.steps.findIndex((s) => s.id === id);
  withSteps(stack.id, (steps) => steps.filter((s) => s.id !== id));
  const after = currentStack();
  stepId = after?.steps[Math.max(0, index - 1)]?.id ?? null;
  announce();
}

export function duplicateStep(id: string): void {
  const stack = currentStack();
  if (!stack) return;
  const index = stack.steps.findIndex((s) => s.id === id);
  if (index < 0) return;
  const copy = {
    ...structuredClone(stack.steps[index]),
    id: freeStepId(stack, stack.steps[index].type)
  } as Step;
  withSteps(stack.id, (steps) => [...steps.slice(0, index + 1), copy, ...steps.slice(index + 1)]);
  stepId = copy.id;
  announce();
}

export function moveStep(id: string, delta: number): void {
  const stack = currentStack();
  if (!stack) return;
  const from = stack.steps.findIndex((s) => s.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= stack.steps.length) return;
  withSteps(stack.id, (steps) => {
    const next = [...steps];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
}

/* ── warnings the user should see before saving ────────────────────────── */

export type Problem = { message: string; stackId?: string; stepId?: string; rivals?: Rival[] };

// The other stack on the same chord, named the way the UI has to name it: a
// rival on another site is only identifiable with the site said out loud.
export type Rival = { id: string; name: string; siteId: string | null; siteName: string };

// Two enabled stacks on one chord that can both apply on some URL. Which of
// them fires is not a toss-up: the resolver takes the narrowest scope that
// claims the page — this URL, then this domain, then everywhere — so a shared
// chord is only a problem when the two sit at the *same* level. Then the first
// one in the config wins and the other is simply dead.
//
// Across levels it is the point rather than a problem: one chord that does the
// usual thing everywhere and something sharper on /contracts. The builder says
// which way round it will go and leaves it alone.
export type ChordRelations = {
  stackId: string;
  conflicts: Rival[]; // same level — one of these never fires
  overrides: Rival[]; // this stack wins where both apply
  overriddenBy: Rival[]; // the other one wins where both apply
};

// How narrowly a stack aims, which is how the resolver ranks it. null means it
// points at a site that no longer exists, so it applies nowhere and can neither
// clash with nor override anything.
function level(stack: Stack): 0 | 1 | 2 | null {
  if (isCommon(stack)) return 0;
  const site = config.sites.find((s) => s.id === stack.siteId);
  if (!site) return null;
  return siteScope(site) === "domain" ? 1 : 2;
}

// Is there a page where both apply? A common stack meets everything; two site
// stacks meet only where their patterns do.
function canCollide(a: Stack, b: Stack): boolean {
  const [levelA, levelB] = [level(a), level(b)];
  if (levelA === null || levelB === null) return false;
  if (levelA === 0 || levelB === 0) return true;
  const siteA = config.sites.find((s) => s.id === a.siteId);
  const siteB = config.sites.find((s) => s.id === b.siteId);
  return siteA !== undefined && siteB !== undefined && sitesOverlap(siteA, siteB);
}

export function chordRelations(): ChordRelations[] {
  const found: ChordRelations[] = [];
  const enabled = config.stacks.filter((s) => s.enabled);
  for (const stack of enabled) {
    const mine = level(stack);
    if (mine === null) continue;
    const relations: ChordRelations = {
      stackId: stack.id,
      conflicts: [],
      overrides: [],
      overriddenBy: []
    };
    for (const other of enabled) {
      if (other.id === stack.id) continue;
      if (!sameChord(other.binding, stack.binding)) continue;
      if (!canCollide(stack, other)) continue;
      const theirs = level(other) as 0 | 1 | 2;
      const bucket =
        theirs === mine
          ? relations.conflicts
          : theirs < mine
            ? relations.overrides
            : relations.overriddenBy;
      bucket.push(rivalOf(other));
    }
    const total =
      relations.conflicts.length + relations.overrides.length + relations.overriddenBy.length;
    if (total > 0) found.push(relations);
  }
  return found;
}

function rivalOf(stack: Stack): Rival {
  return {
    id: stack.id,
    name: stack.name,
    siteId: stack.siteId ?? null,
    siteName: siteName(stack.siteId ?? null)
  };
}

// The subset worth warning about, in the shape the save status and the stack
// cards already speak.
export function chordConflicts(): Problem[] {
  return chordRelations()
    .filter((r) => r.conflicts.length > 0)
    .map((r) => ({
      stackId: r.stackId,
      rivals: r.conflicts,
      message: `shares its chord with ${r.conflicts.map((c) => `"${c.name}"`).join(", ")}`
    }));
}

function sameChord(a: Binding, b: Binding): boolean {
  return (
    a.code === b.code &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.meta === b.meta
  );
}

// A chord with no modifier at all would swallow an ordinary keypress on every
// page the stack applies to — the resolver only steps aside for text fields.
export function isBareKey(binding: Binding): boolean {
  return !binding.ctrl && !binding.alt && !binding.meta;
}

// Which later steps a step-id rename would break. Offered before the rename,
// not after: the templates are the user's, and rewriting them silently is worse
// than telling them.
export function renamesBreak(stack: Stack, oldId: string): Problem[] {
  return unknownVars({ ...stack, steps: stack.steps.map((s) => (s.id === oldId ? { ...s, id: " " } : s)) })
    .filter((v) => v.name === oldId)
    .map((v) => ({
      stackId: stack.id,
      stepId: v.stepId,
      message: `the action "${v.stepId}" still uses $${oldId}`
    }));
}

/* ── saving ────────────────────────────────────────────────────────────── */

export type SaveResult = { ok: true } | { ok: false; problems: Problem[] };

export async function save(): Promise<SaveResult> {
  const problems: Problem[] = [];

  const result = parseConfig(config);
  if (!isParsed(result)) {
    problems.push(...result.errors.map((message) => ({ message })));
  }
  // The check the runtime cannot make until the hotkey is pressed: a $name
  // nothing will have produced by then.
  for (const stack of config.stacks) {
    for (const unknown of unknownVars(stack, secretNames)) {
      problems.push({
        stackId: stack.id,
        stepId: unknown.stepId,
        message: `"${stack.name}", action ${unknown.stepId}: $${unknown.name} is not a value this stack has — check the ${unknown.field} field`
      });
    }
  }
  // A popup is where a stack ends. The builder will not let one be put
  // anywhere else, but an imported or hand-written config can still arrive
  // with actions queued behind a panel nobody will see until it is dismissed.
  for (const stack of config.stacks) {
    const last = stack.steps.length - 1;
    for (const [index, step] of stack.steps.entries()) {
      if (index === last || !STEP_META[step.type].endsStack) continue;
      problems.push({
        stackId: stack.id,
        stepId: step.id,
        message: `"${stack.name}", action ${step.id}: ${STEP_META[step.type].label} has to be the last action — nothing may follow it`
      });
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  const parsed = (result as { config: Config }).config;
  await saveConfig(parsed);
  config = parsed;
  saved = JSON.stringify(config);
  announce();
  return { ok: true };
}

// Replaces the draft wholesale — Import, and the Revert button. Returns the
// problems instead of applying anything when the incoming config is broken.
export function replaceDraft(raw: unknown): SaveResult {
  const result = parseConfig(raw);
  if (!isParsed(result)) return { ok: false, problems: result.errors.map((message) => ({ message })) };
  config = result.config;
  scope = COMMON;
  clearSelection();
  announce();
  return { ok: true };
}

export function exportJson(): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
