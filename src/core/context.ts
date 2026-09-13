// Born on keypress, wiped when the run ends — see runStack() in
// content/runner.ts. There is no global store, so a value cannot leak
// between runs or between stacks: there is nowhere for it to persist.
export type RunContext = Map<string, string>;

export const MAX_VARS = 64;

// `transform` is applied to each substituted value, never to the literal
// text around it — openUrl passes encodeURIComponent so a value holding &
// or = lands as one query parameter instead of injecting another, while the
// &s the stack author typed in the template stay separators.
export function resolve(
  template: string,
  ctx: RunContext,
  transform: (value: string) => string = (v) => v
): string {
  return template.replace(/\$\$|\$(\w+)/g, (match, name: string | undefined) => {
    if (match === "$$") return "$"; // literal escape, not a value — not transformed
    if (!ctx.has(name!)) throw new Error(`unknown variable "$${name}"`);
    return transform(ctx.get(name!)!);
  });
}

// Names of the built-in variables seeded by page/builtins.ts. Declared here
// (not there) so content/runner.ts — which only needs the count for the
// MAX_VARS budget — doesn't have to import anything DOM-touching.
export const BUILTINS = ["url", "title", "selection", "stacks", "stackName"] as const;
