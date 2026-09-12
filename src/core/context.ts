// Born on keypress, wiped when the run ends — see runStack() in inject.ts.
// There is no global store, so a value cannot leak between runs or between
// stacks: there is nowhere for it to persist.
export type RunContext = Map<string, string>;

export const MAX_VARS = 64;

export function resolve(template: string, ctx: RunContext): string {
  return template.replace(/\$\$|\$(\w+)/g, (match, name: string | undefined) => {
    if (match === "$$") return "$";
    if (!ctx.has(name!)) throw new Error(`unknown variable "$${name}"`);
    return ctx.get(name!)!;
  });
}
