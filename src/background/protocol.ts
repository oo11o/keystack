// The message shapes shared between the content-script client (client.ts)
// and the service worker (worker.ts). Kept in one file so the two sides
// can't drift on the message `type` strings.

export const FETCH_MESSAGE_TYPE = "keystack-fetch";
export const SAVE_RESUME_MESSAGE_TYPE = "keystack-save-resume";
export const TAKE_RESUME_MESSAGE_TYPE = "keystack-take-resume";

export type FetchRequest = { type: typeof FETCH_MESSAGE_TYPE; url: string };

export type FetchResponse =
  | { ok: boolean; status: number; body: string }
  | { error: string };

// A stack suspended mid-run by a navigation step, waiting for the next page
// in the same tab to pick it up. Everything here has to survive JSON, so
// the context travels as entries rather than a Map.
//
// Deliberately absent: secrets. They are re-seeded from chrome.storage.local
// on the other side (content/secrets.ts) exactly as on a fresh run, so a
// suspended stack never parks a token in session storage. Builtins are
// absent for a different reason — $url/$title/$selection describe the page,
// and after a navigation that is a different page, so they are re-seeded too.
export type ResumeRecord = {
  stackId: string;
  nextStep: number; // index into stack.steps to continue from
  vars: [string, string][]; // step-written variables only
  notes: string[]; // notes from the steps that already ran, for the final toast
  expiresAt: number; // epoch ms; a record older than this is dropped unread
};

export type SaveResumeRequest = {
  type: typeof SAVE_RESUME_MESSAGE_TYPE;
  record: ResumeRecord;
};

// Reading is destructive — see worker.ts for why one-shot matters.
export type TakeResumeRequest = { type: typeof TAKE_RESUME_MESSAGE_TYPE };

export type ResumeResponse = { record: ResumeRecord | null };
