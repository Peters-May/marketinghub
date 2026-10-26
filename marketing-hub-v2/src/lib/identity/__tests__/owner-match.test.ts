import { describe, expect, it } from "vitest";
import { ownerMatchesViewer } from "@/lib/identity/owner-match";

const sophie = { id: "user-sophie", fullName: "Sophie" };
const sophieFull = { id: "user-sophie", fullName: "Sophie Edgerley" };

describe("ownerMatchesViewer", () => {
  it("matches a full owner name when the signed-in name is the first name", () => {
    expect(ownerMatchesViewer("Sophie Edgerley", null, sophie)).toBe(true);
  });

  it("matches a first-name owner when the signed-in name is the full name", () => {
    expect(ownerMatchesViewer("Sophie", null, sophieFull)).toBe(true);
  });

  it("does not match a different person who shares no name", () => {
    expect(ownerMatchesViewer("Fran Page", null, sophie)).toBe(false);
    expect(ownerMatchesViewer("Fran Page", null, sophieFull)).toBe(false);
  });

  it("does not treat two different full names with the same first name as one person", () => {
    expect(
      ownerMatchesViewer("Sophie Smith", null, sophieFull)
    ).toBe(false);
  });

  it("matches on user id even when the names differ", () => {
    expect(
      ownerMatchesViewer("Someone else", "user-sophie", sophieFull)
    ).toBe(true);
  });
});
