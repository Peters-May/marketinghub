import { describe, expect, it } from "vitest";
import {
  newsApiFromDate,
  newsApiLanguageParam,
} from "@/lib/pr/monitor-fetch";

describe("newsApiLanguageParam", () => {
  it("returns the first valid language code", () => {
    expect(newsApiLanguageParam("en,nl")).toBe("en");
    expect(newsApiLanguageParam(" NL ")).toBe("nl");
  });

  it("returns empty for all-languages / invalid input", () => {
    expect(newsApiLanguageParam("")).toBe("");
    expect(newsApiLanguageParam("english")).toBe("");
  });
});

describe("newsApiFromDate", () => {
  it("uses last_run_at when valid", () => {
    expect(newsApiFromDate("2026-10-01T12:00:00.000Z")).toBe(
      "2026-10-01T12:00:00.000Z"
    );
  });

  it("falls back to a 7-day lookback", () => {
    const now = new Date("2026-11-03T10:00:00.000Z");
    expect(newsApiFromDate(null, now)).toBe("2026-10-27T10:00:00.000Z");
  });
});
