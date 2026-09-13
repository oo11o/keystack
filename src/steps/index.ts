import type { Step } from "../core/schema";
import type { Handler } from "./types";
import { copyBySelector } from "./copyBySelector";
import { readBySelector } from "./readBySelector";
import { inputToSelector } from "./inputToSelector";
import { popup } from "./popup";
import { openUrl } from "./openUrl";
import { fetchUrl } from "./fetchUrl";

export const handlers: Record<Step["type"], Handler> = {
  copyBySelector,
  readBySelector,
  inputToSelector,
  popup,
  openUrl,
  fetchUrl
};
