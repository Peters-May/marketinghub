import { describe, expect, it } from "vitest";
import { matchByTitle, normalizeTitleText } from "@/lib/command/match";

const events = [
  { id: "1", title: "Boot Düsseldorf travel" },
  { id: "2", title: "Monaco Yacht Show" },
  { id: "3", title: "Metstrade" },
  { id: "4", title: "Boot Düsseldorf" },
];

describe("normalizeTitleText", () => {
  it("folds accents", () => {
    expect(normalizeTitleText("Boot Düsseldorf")).toBe("boot dusseldorf");
  });
});

describe("matchByTitle", () => {
  it("matches exact titles ignoring accents", () => {
    const found = matchByTitle(events, "Boot Dusseldorf travel");
    expect(found).toEqual({ kind: "one", item: events[0] });
  });

  it("matches when the query adds a person name", () => {
    const found = matchByTitle(
      events,
      "Boot Dusseldorf travel for Jesper Jensen"
    );
    expect(found).toEqual({ kind: "one", item: events[0] });
  });

  it("prefers the more specific title when several fit the query", () => {
    const found = matchByTitle(events, "update Boot Dusseldorf travel notes");
    expect(found).toEqual({ kind: "one", item: events[0] });
  });

  it("matches a short unique show name", () => {
    expect(matchByTitle(events, "Metstrade")).toEqual({
      kind: "one",
      item: events[2],
    });
  });

  it("uses an exact catalogue title when present", () => {
    expect(matchByTitle(events, "Boot Düsseldorf")).toEqual({
      kind: "one",
      item: events[3],
    });
  });

  it("returns many when a short query fits several titles", () => {
    const found = matchByTitle(events, "Düsseldorf");
    expect(found.kind).toBe("many");
    if (found.kind !== "many") return;
    expect(found.items.map((item) => item.title)).toEqual([
      "Boot Düsseldorf travel",
      "Boot Düsseldorf",
    ]);
  });

  it("returns none when nothing overlaps", () => {
    expect(matchByTitle(events, "Palm Beach charter")).toEqual({
      kind: "none",
    });
  });
});
