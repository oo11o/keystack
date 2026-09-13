import { resolveStack } from "./stackResolver";
import { executeStack } from "./stackExecutor";

document.addEventListener(
  "keydown",
  async (e) => {
    const route = await resolveStack(e);
    if (!route) return;

    e.preventDefault();
    e.stopPropagation();

    await executeStack(route.stack, route.allStacks);
  },
  true
);
