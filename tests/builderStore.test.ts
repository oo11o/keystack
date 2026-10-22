import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as store from "../src/options/store";
import { CONFIG_KEY, clearCache, loadConfig } from "../src/core/configStore";
import { stubChromeStorage, type FakeStorage } from "./fakeChrome";

// The builder's draft: what the three columns read, what the buttons mutate, and
// what Save is allowed to let through. Tested without the DOM — the panes are
// thin renderers over this.

const SEED = {
  schemaVersion: 2,
  sites: [
    { id: "local", name: "dzo.lh", patterns: ["dzo.lh"] },
    { id: "test", name: "test", patterns: ["https://test.dzo.com.ua/*"] }
  ],
  stacks: [
    {
      id: "copy-id",
      name: "Copy Tender",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "readBySelector", selector: "#tender_id" }]
    },
    {
      id: "local-sync",
      name: "Sync (local)",
      binding: { code: "Digit3", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "local",
      steps: []
    }
  ]
};

let storage: FakeStorage;

async function open(url: string | null = null, secrets: string[] = []) {
  storage = stubChromeStorage({ [CONFIG_KEY]: structuredClone(SEED) });
  await store.init(url, secrets);
}

beforeEach(() => {
  clearCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe("opening the builder", () => {
  it("starts on Common when the page belongs to no site", async () => {
    await open("https://example.com/");

    expect(store.getScope()).toEqual({ kind: "common" });
    expect(store.stacksInScope().map((s) => s.id)).toEqual(["copy-id"]);
  });

  it("starts on the site of the page it was opened from", async () => {
    // "Make this work here" is how a stack usually starts, so the column opens
    // where the user already is.
    await open("http://dzo.lh/tenders/new");

    expect(store.getScope()).toEqual({ kind: "site", siteId: "local" });
    expect(store.stacksInScope().map((s) => s.id)).toEqual(["local-sync"]);
  });

  it("opens nothing, so the Stacks column reads as a list until one is picked", async () => {
    await open();

    expect(store.currentStack()).toBeNull();
    expect(store.currentStep()).toBeNull();
  });

  it("closes the open stack when it is picked again", async () => {
    await open();
    store.selectStack("copy-id");
    expect(store.currentStack()?.id).toBe("copy-id");

    store.toggleStack("copy-id");
    expect(store.currentStack()).toBeNull();

    store.toggleStack("copy-id");
    expect(store.currentStack()?.id).toBe("copy-id");
  });

  it("opens nothing of another scope's stacks when the scope changes", async () => {
    await open();
    store.selectStack("copy-id");

    store.selectScope({ kind: "site", siteId: "local" });

    expect(store.currentStack()).toBeNull();
  });

  it("counts the stacks per scope for the column's badges", async () => {
    await open();

    expect(store.stackCount({ kind: "common" })).toBe(1);
    expect(store.stackCount({ kind: "site", siteId: "local" })).toBe(1);
    expect(store.stackCount({ kind: "site", siteId: "test" })).toBe(0);
  });

  it("is not dirty before anything is touched", async () => {
    await open();

    expect(store.isDirty()).toBe(false);
  });
});

describe("adding things", () => {
  it("scopes a new stack to the site that is open", async () => {
    await open("http://dzo.lh/x");

    const stack = store.addStack("Logout");

    expect(stack.siteId).toBe("local");
    expect(store.isDirty()).toBe(true);
  });

  it("gives a new stack a chord nothing in its scope is using", async () => {
    await open(); // Common already uses ⌃⌥1

    expect(store.addStack("A").binding.code).toBe("Digit2");
    expect(store.addStack("B").binding.code).toBe("Digit3");
  });

  it("never reuses a stack id", async () => {
    await open();

    // Ids are slugged from the name, so two stacks called the same thing are
    // exactly the collision that has to be handled — a reused id would break
    // resume, which finds its stack by id.
    expect(store.addStack("Log out").id).toBe("log-out");
    expect(store.addStack("Log out").id).toBe("log-out-2");
    expect(store.addStack("Log out").id).toBe("log-out-3");
  });

  it("names a producing step after what it holds, and keeps it unique", async () => {
    await open();
    store.selectStack("copy-id");

    // The id is the name a later action reads the result by ($response), so it
    // comes from the type rather than from a counter.
    store.addStep("fetchUrl");
    expect(store.currentStep()?.id).toBe("response");
    store.addStep("fetchUrl");
    expect(store.currentStep()?.id).toBe("response2");
    store.addStep("readBySelector");
    expect(store.currentStep()?.id).toBe("text");
  });

  it("numbers steps that hold nothing from the first free id, not from the count", async () => {
    await open();
    store.selectStack("copy-id");

    store.addStep("popup"); // s1 is taken by the seed's copy step
    expect(store.currentStep()?.id).toBe("s2");

    store.deleteStep("s1");
    store.addStep("popup");
    // s1 is free again, but s2 still exists and a template may point at it.
    expect(store.currentStack()?.steps.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("fills a new step with its required fields blank and nothing else", async () => {
    await open();
    store.selectStack("copy-id");

    store.addStep("readBySelector");

    expect(store.currentStep()).toEqual({ id: "text", type: "readBySelector", selector: "" });
  });

  it("selects a new site so its stacks can be added straight away", async () => {
    await open();

    const site = store.addSite("Prozorro", ["*://*.prozorro.gov.ua/*", "  "]);

    expect(site.patterns).toEqual(["*://*.prozorro.gov.ua/*"]); // the blank row is dropped
    expect(store.getScope()).toEqual({ kind: "site", siteId: site.id });
  });
});

describe("editing steps", () => {
  it("drops an optional field that was cleared, rather than storing an empty one", async () => {
    await open();
    store.selectStack("copy-id");
    // Opening a stack opens none of its actions, so this one is asked for.
    store.selectStep("s1");
    store.patchStep("s1", { saveAs: "tender" });
    expect(store.currentStep()).toMatchObject({ saveAs: "tender" });

    store.patchStep("s1", { saveAs: "" });

    // The handlers read `timeoutMs ?? DEFAULT`, which an empty string defeats.
    expect("saveAs" in (store.currentStep() as object)).toBe(false);
  });

  it("refuses to save an action queued behind a popup", async () => {
    await open();
    store.selectStack("copy-id");
    // The builder offers no way to do this — the Add action row is gone once a
    // stack ends in a popup — but an imported config can still arrive like it.
    store.addStep("popup");
    store.patchStep(store.currentStep()!.id, { body: "done" });
    store.addStep("wait");

    const result = await store.save();

    expect(result.ok).toBe(false);
    expect((result as { problems: { message: string }[] }).problems[0].message).toContain(
      "has to be the last action"
    );
  });

  it("moves a step, and refuses to move it off either end", async () => {
    await open();
    store.selectStack("copy-id");
    store.addStep("popup");
    const ids = () => store.currentStack()!.steps.map((s) => s.id);

    store.moveStep("s2", -1);
    expect(ids()).toEqual(["s2", "s1"]);

    store.moveStep("s2", -1);
    expect(ids()).toEqual(["s2", "s1"]);

    store.moveStep("s1", 1);
    expect(ids()).toEqual(["s2", "s1"]);
  });

  it("keeps a sensible selection after a delete", async () => {
    await open();
    store.selectStack("copy-id");
    store.addStep("popup");
    store.selectStep("s2");

    store.deleteStep("s2");

    expect(store.currentStep()?.id).toBe("s1");
  });

  it("names the later steps a variable rename would break", async () => {
    await open();
    store.selectStack("copy-id");
    store.addStep("fetchUrl");
    store.patchStep("response", { url: "https://api.test/t/$s1" });

    const breaks = store.renamesBreak(store.currentStack()!, "s1");

    expect(breaks).toMatchObject([{ stepId: "response" }]);
    expect(breaks[0].message).toContain("$s1");
  });

  it("finds nothing to break when no template mentions the step", async () => {
    await open();
    store.selectStack("copy-id");

    expect(store.renamesBreak(store.currentStack()!, "s1")).toEqual([]);
  });
});

describe("chord conflicts", () => {
  // A common stack and a site stack on one chord is precedence, not a clash:
  // the site's wins on its pages, the common one everywhere else. Reported as
  // a relation so the builder can say which way round it goes, and left out of
  // chordConflicts so nothing scolds the user for it.
  it("treats a common stack and a site stack on one chord as an override", async () => {
    await open();
    store.patchStack("local-sync", {
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordConflicts()).toEqual([]);
    expect(store.chordRelations()).toEqual([
      {
        stackId: "copy-id",
        conflicts: [],
        overrides: [],
        overriddenBy: [
          { id: "local-sync", name: "Sync (local)", siteId: "local", siteName: "dzo.lh" }
        ]
      },
      {
        stackId: "local-sync",
        conflicts: [],
        overrides: [{ id: "copy-id", name: "Copy Tender", siteId: null, siteName: "Common" }],
        overriddenBy: []
      }
    ]);
  });

  it("ranks an area of a site above the site itself", async () => {
    await open();
    store.addSite("/tenders", ["dzo.lh/tenders"]);
    store.patchStack("copy-id", { siteId: "tenders" });
    store.patchStack("local-sync", {
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordConflicts()).toEqual([]);
    const relations = store.chordRelations();
    expect(relations.find((r) => r.stackId === "copy-id")?.overrides).toEqual([
      { id: "local-sync", name: "Sync (local)", siteId: "local", siteName: "dzo.lh" }
    ]);
  });

  it("warns when two stacks on one site share a chord — one of them is dead", async () => {
    await open();
    store.patchStack("copy-id", { siteId: "local" });
    store.patchStack("local-sync", {
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordConflicts().map((p) => p.stackId).sort()).toEqual(["copy-id", "local-sync"]);
  });

  it("warns when two common stacks share a chord", async () => {
    await open();
    store.patchStack("local-sync", {
      siteId: null,
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordConflicts()).toHaveLength(2);
  });

  it("says nothing about a stack whose site no longer exists — it applies nowhere", async () => {
    await open();
    store.patchStack("local-sync", {
      siteId: "gone",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordRelations()).toEqual([]);
  });

  it("does not warn about two sites whose patterns never meet", async () => {
    await open();
    store.patchStack("copy-id", { siteId: "test" });
    store.patchStack("local-sync", {
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordConflicts()).toEqual([]);
  });

  it("does not warn when one of the two is disabled", async () => {
    await open();
    store.patchStack("local-sync", {
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: false
    });

    expect(store.chordConflicts()).toEqual([]);
  });

  it("flags a chord with no modifier, which would swallow an ordinary keypress", async () => {
    expect(store.isBareKey({ code: "KeyK", ctrl: false, alt: false, shift: true, meta: false })).toBe(true);
    expect(store.isBareKey({ code: "KeyK", ctrl: false, alt: true, shift: false, meta: false })).toBe(false);
  });
});

describe("deleting a site", () => {
  it("can keep its stacks as common ones", async () => {
    await open();

    store.deleteSite("local", true);

    expect(store.getConfig().sites.map((s) => s.id)).toEqual(["test"]);
    expect(store.getConfig().stacks.find((s) => s.id === "local-sync")?.siteId).toBeNull();
  });

  it("can take its stacks with it", async () => {
    await open();

    store.deleteSite("local", false);

    expect(store.getConfig().stacks.map((s) => s.id)).toEqual(["copy-id"]);
  });

  it("falls back to Common, so the columns cannot point at a site that is gone", async () => {
    await open("http://dzo.lh/x");

    store.deleteSite("local", true);

    expect(store.getScope()).toEqual({ kind: "common" });
  });
});

describe("saving", () => {
  it("writes the draft to storage and clears the dirty flag", async () => {
    await open();
    store.addStack("Logout");

    await expect(store.save()).resolves.toEqual({ ok: true });

    expect(store.isDirty()).toBe(false);
    const stored = storage.data[CONFIG_KEY] as { stacks: { id: string }[] };
    expect(stored.stacks.map((s) => s.id)).toContain("logout");
  });

  it("makes the saved config what the hotkey path reads next", async () => {
    await open();
    store.addStack("Logout");
    await store.save();

    // The content script reads the same store; this is why a Save is live on the
    // next keystroke instead of the next reload.
    await expect(loadConfig()).resolves.toMatchObject({
      stacks: expect.arrayContaining([expect.objectContaining({ id: "logout" })])
    });
  });

  it("refuses a step with a required field left blank, and stores nothing", async () => {
    await open();
    store.selectStack("copy-id");
    store.addStep("fetchUrl"); // url is blank

    const result = await store.save();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problems.some((p) => /URL/.test(p.message))).toBe(true);
    expect((storage.data[CONFIG_KEY] as typeof SEED).stacks).toHaveLength(2);
  });

  it("refuses a $var nothing in the stack produces, naming the step and field", async () => {
    await open();
    store.selectStack("copy-id");
    store.addStep("fetchUrl");
    store.patchStep("response", { url: "https://api.test/t/$tender" });

    const result = await store.save();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0].message).toContain("$tender");
    expect(result.problems[0].message).toContain("url");
    expect(result.problems[0].stepId).toBe("response");
  });

  it("accepts the same $var once the step it comes from exists", async () => {
    await open();
    store.selectStack("copy-id");
    store.patchStep("s1", { saveAs: "tender" });
    store.addStep("fetchUrl");
    store.patchStep("response", { url: "https://api.test/t/$tender" });

    await expect(store.save()).resolves.toEqual({ ok: true });
  });

  it("accepts a secret that exists and refuses one that does not", async () => {
    await open(null, ["runToken"]);
    store.selectStack("copy-id");
    store.addStep("fetchUrl");
    store.patchStep("response", { url: "https://api.test/?run=$secret_runToken" });
    await expect(store.save()).resolves.toEqual({ ok: true });

    store.patchStep("response", { url: "https://api.test/?run=$secret_nope" });
    await expect(store.save()).resolves.toMatchObject({ ok: false });
  });
});

describe("import and export", () => {
  it("round-trips, so an export can be pasted straight back", async () => {
    await open();
    const json = store.exportJson();

    expect(store.replaceDraft(JSON.parse(json))).toEqual({ ok: true });
    expect(store.exportJson()).toBe(json);
  });

  it("migrates a hand-written v1 config on the way in", async () => {
    await open();

    const result = store.replaceDraft({
      schemaVersion: 1,
      stacks: [
        {
          id: "old",
          name: "Old",
          binding: { code: "Digit4", ctrl: true, alt: true, shift: false, meta: false },
          enabled: true,
          steps: [{ id: "s1", type: "copyBySelector", selector: "#x" }]
        }
      ]
    });

    expect(result).toEqual({ ok: true });
    expect(store.getConfig().stacks[0].siteId).toBeNull();
    expect(store.getConfig().sites).toEqual([]);
  });

  it("refuses a broken import without touching the draft", async () => {
    await open();

    const result = store.replaceDraft({ stacks: [{ id: "x" }] });

    expect(result.ok).toBe(false);
    expect(store.getConfig().stacks.map((s) => s.id)).toEqual(["copy-id", "local-sync"]);
  });
});
