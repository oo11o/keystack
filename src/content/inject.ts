import { resolveStack } from "./stackResolver";
import { executeStack } from "./stackExecutor";
import { resumePending } from "./resumePending";

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

// Not awaited: a stack this page is continuing must not delay the keydown
// listener above being registered.
void resumePending();
