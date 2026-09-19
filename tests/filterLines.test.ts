import { describe, it, expect } from "vitest";
import { filterLines, pathsByLine, FILTER_MIN, SEPARATOR } from "../src/core/filterLines";

const BODY = ['{', '  "status": "active.tendering",', '  "title": "Tender",', '  "STATUS_CODE": 7', '}'].join("\n");

const BIDS = [
  '{',
  '  "bids": [',
  '    {',
  '      "content": "first"',
  '    },',
  '    {',
  '      "content": "second"',
  '    }',
  '  ]',
  '}'
].join("\n");

describe("filterLines", () => {
  it("returns everything untouched below the threshold", () => {
    for (const query of ["", "s", "st"]) {
      const result = filterLines(BODY, query);
      expect(result.text).toBe(BODY);
      expect(result.active).toBe(false);
      expect(result.shown).toBe(result.total);
    }
  });

  it("filters once the query is longer than 2 characters", () => {
    const result = filterLines(BODY, "sta");
    expect(result.active).toBe(true);
    expect(result.shown).toBe(2);
    expect(result.total).toBe(5);
  });

  it("matches case-insensitively", () => {
    expect(filterLines(BODY, "STATUS").shown).toBe(filterLines(BODY, "status").shown);
  });

  it("treats the query as a substring, not a regex", () => {
    // "." would match every line if this were a regex.
    expect(filterLines(BODY, "e.t").shown).toBe(1);
  });

  it("ignores surrounding whitespace when measuring the query", () => {
    expect(filterLines(BODY, "  s  ").active).toBe(false); // one char once trimmed
    expect(filterLines(BODY, " title ").shown).toBe(1);
  });

  it("returns empty text and a zero count when nothing matches", () => {
    const result = filterLines(BODY, "nothing-here");
    expect(result.text).toBe("");
    expect(result.shown).toBe(0);
    expect(result.total).toBe(5);
  });

  it("counts a single-line body as one line", () => {
    expect(filterLines("just one line", "").total).toBe(1);
  });

  it("agrees with FILTER_MIN about where filtering starts", () => {
    expect(filterLines(BODY, "x".repeat(FILTER_MIN - 1)).active).toBe(false);
    expect(filterLines(BODY, "x".repeat(FILTER_MIN)).active).toBe(true);
  });
});

describe("filterLines block expansion", () => {
  it("expands a matched array to its full contents, dedented under its path", () => {
    const body = ['{', '  "awards": [', '    {', '      "id": 7', '    }', '  ],', '  "title": "T"'].join("\n");
    const result = filterLines(body, "awards");
    expect(result.text).toBe(['*awards*', '"awards": [', '  {', '    "id": 7', '  }', '],'].join("\n"));
    expect(result.shown).toBe(5);
  });

  it("expands a matched object too, not just an array", () => {
    const body = ['{', '  "value": {', '    "amount": 12', '  }', '}'].join("\n");
    expect(filterLines(body, "value").shown).toBe(3);
  });

  it("does not expand a line whose brackets sit inside a string", () => {
    const body = ['{', '  "note": "use {x} here",', '  "other": 1', '}'].join("\n");
    expect(filterLines(body, "note").shown).toBe(1);
  });

  it("keeps overlapping matches once each, in original order", () => {
    const body = ['{', '  "status": {', '    "statusCode": 7', '  }', '}'].join("\n");
    // Both the block opener and the key inside it match "status".
    expect(filterLines(body, "status").shown).toBe(3);
  });

  it("takes what it can when the body is truncated mid-block", () => {
    expect(filterLines(['{', '  "awards": [', '    { "id": 7 }'].join("\n"), "awards").shown).toBe(2);
  });
});

describe("filterLines result headers", () => {
  it("heads a deep hit with its full dotted path, array positions as numbers", () => {
    const result = filterLines(BIDS, "second");
    expect(result.text).toBe('*bids.1.content*\n"content": "second"');
  });

  it("separates distinct hits with a rule and blank lines", () => {
    const result = filterLines(BIDS, "content");
    expect(result.text).toBe(
      ['*bids.0.content*', '"content": "first"', '', SEPARATOR, '', '*bids.1.content*', '"content": "second"'].join("\n")
    );
    expect(result.shown).toBe(2); // headers and separators are not counted
  });

  it("runs consecutive matched lines together as one hit, with one header", () => {
    const body = ['{', '  "ab": 1,', '  "abc": 2,', '  "zz": 3', '}'].join("\n");
    const result = filterLines(body, '"ab');
    expect(result.text).toBe('*ab*\n"ab": 1,\n"abc": 2,');
    expect(result.text).not.toContain(SEPARATOR);
  });

  it("omits the header for a line that names nothing", () => {
    // Non-JSON passthrough: no keys to build a path from.
    const result = filterLines("plain text here\nand more text", "more");
    expect(result.text).toBe("and more text");
  });
});

describe("filterLines path queries", () => {
  const DOC = [
    '{',
    '  "bids": [',
    '    {',
    '      "documents": [',
    '        {',
    '          "title": "offer.pdf"',
    '        }',
    '      ]',
    '    }',
    '  ],',
    '  "documents": [',
    '    {',
    '      "title": "notice.pdf"',
    '    }',
    '  ]',
    '}'
  ].join("\n");

  it("reads a dotted query as a path: bids.documents skips the top-level documents", () => {
    const result = filterLines(DOC, "bids.documents");
    expect(result.text).toContain("offer.pdf");
    expect(result.text).not.toContain("notice.pdf");
  });

  it("does not require the segments to be adjacent", () => {
    // The real path is bids.0.documents — the array index sits between them.
    expect(filterLines(DOC, "bids.documents").text).toContain('*bids.0.documents*');
  });

  it("matches each segment as a substring", () => {
    expect(filterLines(DOC, "bid.doc").text).toContain("offer.pdf");
  });

  it("respects segment order — documents.bids matches nothing", () => {
    expect(filterLines(DOC, "documents.bids").shown).toBe(0);
  });

  it("an explicit index still works", () => {
    expect(filterLines(DOC, "bids.0.documents").text).toContain("offer.pdf");
  });

  it("still matches a dotted value literally", () => {
    const body = ['{', '  "status": "active.tendering",', '  "other": 1', '}'].join("\n");
    expect(filterLines(body, "active.tendering").shown).toBe(1);
  });

  it("a plain query is unaffected — no path reading without a dot", () => {
    // Both documents arrays match by text, so this is the un-scoped result.
    const result = filterLines(DOC, "documents");
    expect(result.text).toContain("offer.pdf");
    expect(result.text).toContain("notice.pdf");
  });
});

describe("filterLines id headers", () => {
  const IDS = [
    '{',
    '  "bids": [',
    '    {',
    '      "id": "bid-77",',
    '      "documents": [',
    '        {',
    '          "id": "doc-9",',
    '          "title": "offer.pdf"',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}'
  ].join("\n");

  it("labels a hit with the id of the array element it sits inside", () => {
    const [hit] = filterLines(IDS, "bids.documents").groups;
    expect(hit.ids).toEqual(["bid ID: bid-77"]);
    expect(hit.path).toBe("bids.0.documents");
  });

  it("labels every ancestor that has one, outermost first", () => {
    const [hit] = filterLines(IDS, "offer.pdf").groups;
    expect(hit.ids).toEqual(["bid ID: bid-77", "document ID: doc-9"]);
  });

  it("stars the ids above the path in the flat text form", () => {
    const { text } = filterLines(IDS, "offer.pdf");
    expect(text.split("\n").slice(0, 3)).toEqual([
      "*bid ID: bid-77*",
      "*document ID: doc-9*",
      "*bids.0.documents.0.title*"
    ]);
  });

  it("says nothing when no ancestor carries an id", () => {
    const body = ['{', '  "items": [', '    {', '      "title": "x"', '    }', '  ]', '}'].join("\n");
    expect(filterLines(body, "title").groups[0].ids).toEqual([]);
  });

  it("reads a numeric id as well as a string one", () => {
    const body = ['{', '  "lots": [', '    {', '      "id": 12,', '      "title": "x"', '    }', '  ]', '}'].join("\n");
    expect(filterLines(body, "title").groups[0].ids).toEqual(["lot ID: 12"]);
  });

  it("does not mistake a nested object's id for its parent's", () => {
    const body = ['{', '  "value": {', '    "id": "inner"', '  },', '  "title": "x"', '}'].join("\n");
    expect(filterLines(body, "title").groups[0].ids).toEqual([]);
  });

  it("keeps the key as-is when it is not plural", () => {
    const body = ['{', '  "award": {', '    "id": "a1",', '    "title": "x"', '  }', '}'].join("\n");
    expect(filterLines(body, "title").groups[0].ids).toEqual(["award ID: a1"]);
  });
});

describe("pathsByLine", () => {
  it("names every line of a nested body", () => {
    expect(pathsByLine(BIDS.split("\n"))).toEqual([
      "",
      "bids",
      "bids.0",
      "bids.0.content",
      "bids.0",
      "bids.1",
      "bids.1.content",
      "bids.1",
      "bids",
      ""
    ]);
  });

  it("counts array positions independently per array", () => {
    const body = ['{', '  "a": [', '    1', '  ],', '  "b": [', '    2', '  ]', '}'];
    const paths = pathsByLine(body);
    expect(paths[2]).toBe("a.0");
    expect(paths[5]).toBe("b.0"); // not b.1 — a fresh counter
  });

  it("is not fooled by a colon inside a string value", () => {
    const paths = pathsByLine(['{', '  "url": "http://x.y",', '  "next": 1', '}']);
    expect(paths[1]).toBe("url");
    expect(paths[2]).toBe("next");
  });

  it("handles an escaped quote in a key", () => {
    expect(pathsByLine(['{', '  "a\\"b": 1', '}'])[1]).toBe('a\\"b');
  });
});
