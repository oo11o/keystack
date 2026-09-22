import { resolveStack, isConfigError } from "./stackResolver";
import { executeStack } from "./stackExecutor";
import { resumePending } from "./resumePending";
import { showConfigErrorToast } from "../ui/toast";

document.addEventListener(
  "keydown",
  async (e) => {
    const result = await resolveStack(e);
    if (!result) return;

    if (isConfigError(result)) {
      // Deliberately no preventDefault: without a config we cannot know this
      // chord was ever ours, so the page keeps its keystroke. We only report.
      showConfigErrorToast(result.configError);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    await executeStack(result.stack, result.allStacks);
  },
  true
);

// Not awaited: a stack this page is continuing must not delay the keydown
// listener above being registered.
void resumePending();
