// The message shape shared between the content-script client (client.ts)
// and the service worker that actually performs the fetch (worker.ts).
// Kept in one file so the two sides can't drift on the message `type` string.

export const FETCH_MESSAGE_TYPE = "keystack-fetch";

export type FetchRequest = { type: typeof FETCH_MESSAGE_TYPE; url: string };

export type FetchResponse =
  | { ok: boolean; status: number; body: string }
  | { error: string };
