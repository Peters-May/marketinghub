import { describe, expect, it } from "vitest";
import { appendUtmToEmailHtml } from "@/lib/email/utm";

describe("appendUtmToEmailHtml", () => {
  it("adds utm params to https links and leaves merge tokens", () => {
    const html = `<a href="https://www.petersandmay.com/news">News</a><a href="{{unsubscribe_url}}">Unsub</a>`;
    const next = appendUtmToEmailHtml(html, { campaign: "Sailing Schedules Oct" });
    expect(next).toContain("utm_source=marketing-hub");
    expect(next).toContain("utm_medium=email");
    expect(next).toContain("utm_campaign=sailing-schedules-oct");
    expect(next).toContain("{{unsubscribe_url}}");
  });

  it("does not duplicate existing utm_campaign", () => {
    const html = `<a href="https://example.com?utm_campaign=keep-me">X</a>`;
    const next = appendUtmToEmailHtml(html, { campaign: "other" });
    expect(next).toContain("utm_campaign=keep-me");
    expect(next).not.toContain("utm_campaign=other");
  });
});
