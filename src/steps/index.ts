import type { Step } from "../core/schema";
import type { Handler } from "./types";
import { copyBySelector } from "./copyBySelector";
import { readBySelector } from "./readBySelector";
import { inputToSelector } from "./inputToSelector";
import { clickBySelector } from "./clickBySelector";
import { popup } from "./popup";
import { popupJson } from "./popupJson";
import { openUrlInNewTab } from "./openUrlInNewTab";
import { openUrlInCurrentTab } from "./openUrlInCurrentTab";
import { fetchUrl } from "./fetchUrl";

export const handlers: Record<Step["type"], Handler> = {
  copyBySelector,
  readBySelector,
  inputToSelector,
  clickBySelector,
  popup,
  popupJson,
  openUrlInNewTab,
  openUrlInCurrentTab,
  fetchUrl
};
