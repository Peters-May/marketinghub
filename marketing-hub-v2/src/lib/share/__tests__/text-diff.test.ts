import { describe, expect, it } from "vitest";
import {
  diffWords,
  diffWordsToHtml,
  hasCopyChanges,
} from "@/lib/share/text-diff";

describe("diffWords", () => {
  it("marks insertions and deletions for short caption edits", () => {
    const ops = diffWords("Hello from the yard", "Hello from Southampton yard");
    expect(ops.some((op) => op.type === "delete" && op.text.includes("the"))).toBe(
      true
    );
    expect(
      ops.some((op) => op.type === "insert" && op.text.includes("Southampton"))
    ).toBe(true);
  });

  it("returns equal ops when unchanged", () => {
    expect(diffWords("Same", "Same")).toEqual([{ type: "equal", text: "Same" }]);
    expect(hasCopyChanges("Same", "Same")).toBe(false);
  });

  it("renders track-changes HTML", () => {
    const html = diffWordsToHtml("old copy", "new copy");
    expect(html).toContain("line-through");
    expect(html).toContain("background:#D1FAE5");
  });
});
