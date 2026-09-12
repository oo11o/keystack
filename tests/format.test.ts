import { describe, it, expect } from "vitest";
import { describeStep } from "../src/popup/format";
import type { Step } from "../src/core/schema";

describe("describeStep", () => {
  it("describes copyBySelector", () => {
    const step: Step = { id: "s1", type: "copyBySelector", selector: "#a" };
    expect(describeStep(step)).toBe("Copy from #a");
  });

  it("describes readBySelector without saveAs", () => {
    const step: Step = { id: "s1", type: "readBySelector", selector: "#a" };
    expect(describeStep(step)).toBe("Read from #a");
  });

  it("describes readBySelector with saveAs", () => {
    const step: Step = { id: "s1", type: "readBySelector", selector: "#a", saveAs: "id" };
    expect(describeStep(step)).toBe("Read from #a → $id");
  });

  it("describes inputToSelector", () => {
    const step: Step = { id: "s2", type: "inputToSelector", selector: "#b", value: "$s1" };
    expect(describeStep(step)).toBe('Fill #b with "$s1"');
  });
});
