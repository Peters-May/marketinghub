import { describe, expect, it } from "vitest";
import { ensureFieldOption, type FieldOption } from "@/lib/data/collections";

describe("ensureFieldOption", () => {
  const base: FieldOption[] = [
    { value: "General", label: "General" },
    { value: "Insight", label: "Insight" },
  ];

  it("appends a new category when it is not already an option", () => {
    expect(ensureFieldOption(base, { value: "Yacht racing", label: "Yacht racing" })).toEqual(
      [
        ...base,
        { value: "Yacht racing", label: "Yacht racing" },
      ]
    );
  });

  it("does not duplicate an existing option (case-insensitive)", () => {
    expect(ensureFieldOption(base, { value: "insight", label: "insight" })).toEqual(
      base
    );
  });
});
