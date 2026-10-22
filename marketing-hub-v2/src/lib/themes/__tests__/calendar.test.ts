import { describe, expect, it } from "vitest";
import type { QuarterlyTheme } from "@/lib/types";
import {
  applyCalendarThemeStatuses,
  pickCurrentTheme,
  quarterForDate,
  statusForThemeQuarter,
} from "@/lib/themes/calendar";

const themes = [
  { quarter: "Q3", year: 2026, status: "active" },
  { quarter: "Q4", year: 2026, status: "upcoming" },
  { quarter: "Q1", year: 2027, status: "upcoming" },
] as QuarterlyTheme[];

describe("quarterly theme calendar", () => {
  const q4 = new Date("2026-10-22T12:00:00Z");

  it("treats October as Q4", () => {
    expect(quarterForDate(q4)).toBe("Q4");
  });

  it("marks Q3 previous and Q4 active once Q4 has started", () => {
    expect(statusForThemeQuarter(themes[0], q4)).toBe("previous");
    expect(statusForThemeQuarter(themes[1], q4)).toBe("active");
    expect(statusForThemeQuarter(themes[2], q4)).toBe("upcoming");
  });

  it("picks the Q4 theme while a stale Q3 row is still marked active", () => {
    expect(pickCurrentTheme(themes, q4)?.quarter).toBe("Q4");
    const synced = applyCalendarThemeStatuses(themes, q4);
    expect(synced.map((theme) => theme.status)).toEqual([
      "previous",
      "active",
      "upcoming",
    ]);
  });
});
