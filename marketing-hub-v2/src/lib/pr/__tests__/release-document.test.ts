import { describe, expect, it } from "vitest";
import {
  formatReleaseDate,
  plainReleaseField,
  pressReleaseDateline,
  pressReleaseDate,
  pressReleaseSaveError,
} from "@/lib/pr/release-document";

describe("press release document", () => {
  it("keeps a calendar date and drops anything else", () => {
    expect(pressReleaseDate("2026-10-26")).toBe("2026-10-26");
    expect(pressReleaseDate("26 October 2026")).toBeNull();
  });

  it("formats a British dateline", () => {
    expect(formatReleaseDate("2026-10-26")).toBe("26 October 2026");
    expect(pressReleaseDateline("London", "2026-10-26")).toBe(
      "LONDON, 26 October 2026"
    );
  });

  it("requires a headline and a draft or published status", () => {
    expect(pressReleaseSaveError({ title: "  ", status: "draft" })).toMatch(
      /headline/i
    );
    expect(
      pressReleaseSaveError({ title: "Yard opens", status: "idea" })
    ).toMatch(/draft or publish/i);
    expect(
      pressReleaseSaveError({ title: "Yard opens", status: "published" })
    ).toBeNull();
  });

  it("strips tags and keeps line breaks in the contact block", () => {
    expect(plainReleaseField("Ada <b>Lovelace</b>\nada@example.com", 80)).toBe(
      "Ada Lovelace\nada@example.com"
    );
  });
});
