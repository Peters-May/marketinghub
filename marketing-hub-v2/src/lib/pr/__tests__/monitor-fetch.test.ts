import { describe, expect, it } from "vitest";
import {
  newsApiErrorMessage,
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

describe("newsApiErrorMessage", () => {
  it("treats plan page limits as a soft stop", () => {
    const result = newsApiErrorMessage(426, {
      code: "maximumResultsReached",
      message: "You have requested too many results.",
    });
    expect(result.softStop).toBe(true);
  });

  it("flags developer / production plan blocks", () => {
    const result = newsApiErrorMessage(401, {
      code: "apiKeyInvalid",
    });
    expect(result.softStop).toBe(false);
    expect(result.message).toMatch(/invalid/i);
  });
});
