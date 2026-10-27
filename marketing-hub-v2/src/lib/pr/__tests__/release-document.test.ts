import { describe, expect, it } from "vitest";
import {
  formatReleaseDate,
  isNewsroomIndexRelease,
  isPublicReleasePage,
  plainReleaseField,
  pressReleaseDateline,
  pressReleaseDate,
  pressReleaseSaveError,
} from "@/lib/pr/release-document";
import type { ContentItem } from "@/lib/types";

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

  it("requires a headline and an editor status", () => {
    expect(pressReleaseSaveError({ title: "  ", status: "draft" })).toMatch(
      /headline/i
    );
    expect(
      pressReleaseSaveError({ title: "Yard opens", status: "idea" })
    ).toMatch(/draft, ready, scheduled, or published/i);
    expect(
      pressReleaseSaveError({ title: "Yard opens", status: "published" })
    ).toBeNull();
    expect(
      pressReleaseSaveError({
        title: "Yard opens",
        status: "scheduled",
        due_date: null,
      })
    ).toMatch(/date/i);
    expect(
      pressReleaseSaveError({
        title: "Yard opens",
        status: "approved",
        due_date: null,
      })
    ).toBeNull();
  });

  it("strips tags and keeps line breaks in the contact block", () => {
    expect(plainReleaseField("Ada <b>Lovelace</b>\nada@example.com", 80)).toBe(
      "Ada Lovelace\nada@example.com"
    );
  });
});

function story(
  partial: Partial<ContentItem>
): Pick<
  ContentItem,
  "status" | "newsroom_name" | "due_date" | "content_type" | "category" | "channel"
> {
  return {
    status: "draft",
    newsroom_name: "Peters & May News",
    due_date: "2026-10-26",
    content_type: "PR",
    category: "press release",
    channel: ["PR"],
    ...partial,
  };
}

describe("press release visibility", () => {
  const today = new Date(2026, 9, 26, 12, 0, 0);

  it("keeps drafts and ready releases off the public site", () => {
    for (const status of ["draft", "approved"] as const) {
      const item = story({ status });
      expect(isNewsroomIndexRelease(item, today)).toBe(false);
      expect(isPublicReleasePage(item, today)).toBe(false);
    }
  });

  it("holds a future scheduled release", () => {
    const item = story({ status: "scheduled", due_date: "2026-10-27" });
    expect(isNewsroomIndexRelease(item, today)).toBe(false);
    expect(isPublicReleasePage(item, today)).toBe(false);
  });

  it("lists a scheduled release once the date has arrived", () => {
    const item = story({ status: "scheduled", due_date: "2026-10-26" });
    expect(isNewsroomIndexRelease(item, today)).toBe(true);
    expect(isPublicReleasePage(item, today)).toBe(true);
  });

  it("publishes onto the newsroom index", () => {
    const item = story({ status: "published", newsroom_name: undefined });
    expect(isNewsroomIndexRelease(item, today)).toBe(true);
    expect(isPublicReleasePage(item, today)).toBe(true);
  });

  it("gives a standalone release its own page and leaves it off the index", () => {
    const item = story({ status: "published", newsroom_name: "" });
    expect(isNewsroomIndexRelease(item, today)).toBe(false);
    expect(isPublicReleasePage(item, today)).toBe(true);
    const scheduled = story({
      status: "scheduled",
      newsroom_name: "",
      due_date: "2026-10-26",
    });
    expect(isNewsroomIndexRelease(scheduled, today)).toBe(false);
    expect(isPublicReleasePage(scheduled, today)).toBe(false);
  });
});
