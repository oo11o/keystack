// Some endpoints return JSON with non-ASCII text escaped as \uXXXX — valid
// JSON, but unreadable as raw text (a Cyrillic message shows up as literal
// backslash-u sequences). Parsing and re-stringifying decodes those escapes
// back into real characters; JSON.stringify does not re-escape them. A
// non-JSON body (plain text, HTML) fails to parse and is returned as-is:
// a 200 that hands back an error page is worth showing, not worth refusing.
//
// Idempotent — a body that has already been through here is unchanged by a
// second pass, so fetchUrl and popupJson can both apply it without conflict.
export function prettyJson(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
