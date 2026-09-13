// The content-script side of the fetchUrl step: hands the URL to the
// service worker (worker.ts) and waits for its answer. Nothing here touches
// the network directly — that's the whole point of going through the worker.
import { FETCH_MESSAGE_TYPE, type FetchRequest, type FetchResponse } from "./protocol";

export type FetchResult = { status: number; ok: boolean; body: string };

export async function fetchInBackground(url: string): Promise<FetchResult> {
  const request: FetchRequest = { type: FETCH_MESSAGE_TYPE, url };
  const response = (await chrome.runtime.sendMessage(request)) as FetchResponse | undefined;

  if (!response) throw new Error("No response from the background worker");
  if ("error" in response) throw new Error(response.error);
  return response;
}
