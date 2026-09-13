import type { Step } from "../core/schema";
import type { Handler } from "./types";
import { copyBySelector } from "./copyBySelector";
import { readBySelector } from "./readBySelector";
import { inputToSelector } from "./inputToSelector";
import { popup } from "./popup";

export const handlers: Record<Step["type"], Handler> = {
  copyBySelector,
  readBySelector,
  inputToSelector,
  popup
};
