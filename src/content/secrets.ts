// Secrets live in chrome.storage.local, deliberately not in config/*.json:
// the manifest declares config/*.json as web_accessible_resources for
// <all_urls>, so any page could fetch a token out of it. storage.local is
// reachable only by the extension, and content scripts can read it directly
// — no background worker, no message passing.
//
// This is still not real secrecy: an extension has no server, so the value
// sits in plaintext on the machine and anyone with devtools can read it.
// What it buys is that it is out of git and out of reach of web pages.
export async function loadSecrets(): Promise<Record<string, string>> {
  const none: Record<string, string> = {};
  try {
    // chrome.storage.local.get is typed as returning a bare object, so the
    // shape we put in has to be asserted on the way out.
    const stored = (await chrome.storage.local.get("secrets")) as {
      secrets?: Record<string, string>;
    };
    return stored.secrets ?? none;
  } catch {
    return none; // storage unavailable (or no permission) — stacks using $secret_* fail loudly
  }
}
