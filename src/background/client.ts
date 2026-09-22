// The content-script side of everything that needs the service worker:
// the fetchUrl step's request, and the resume records that let a stack
// survive a navigation. Nothing here touches the network or storage
// directly — that's the whole point of going through the worker.
import {
  FETCH_MESSAGE_TYPE,
  SAVE_RESUME_MESSAGE_TYPE,
  TAKE_RESUME_MESSAGE_TYPE,
  type FetchRequest,
  type FetchResponse,
  type ResumeRecord,
  type ResumeResponse,
  type SaveResumeRequest,
  type TakeResumeRequest
} from "./protocol";

export type FetchResult = { status: number; ok: boolean; body: string };

export async function fetchInBackground(url: string): Promise<FetchResult> {
  const request: FetchRequest = { type: FETCH_MESSAGE_TYPE, url };
  const response = (await chrome.runtime.sendMessage(request)) as FetchResponse | undefined;

  if (!response) throw new Error("No response from the background worker");
  if ("error" in response) throw new Error(response.error);
  return response;
}

// Parks a suspended stack in the worker, keyed by this tab. Awaited before
// the navigation actually starts — see runner.ts.
export async function saveResume(record: ResumeRecord): Promise<void> {
  const request: SaveResumeRequest = { type: SAVE_RESUME_MESSAGE_TYPE, record };
  await chrome.runtime.sendMessage(request);
}

// Claims this tab's pending stack, if any. Destructive on the worker side,
// so two content scripts racing cannot both resume the same record.
// Failures are swallowed: this runs on every page load, and a missing
// worker must not turn into a console error on every site you visit.
export async function takeResume(): Promise<ResumeRecord | null> {
  try {
    const request: TakeResumeRequest = { type: TAKE_RESUME_MESSAGE_TYPE };
    const response = (await chrome.runtime.sendMessage(request)) as ResumeResponse | undefined;
    return response?.record ?? null;
  } catch {
    return null;
  }
}
