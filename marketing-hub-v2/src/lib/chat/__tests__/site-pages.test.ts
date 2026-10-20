import { describe, expect, it } from "vitest";
import { selectSitePagesForQuery } from "@/lib/chat/site-pages";

describe("selectSitePagesForQuery", () => {
  it("selects Our Group for CEO questions", () => {
    const pages = selectSitePagesForQuery("who is the CEO?");
    expect(pages.map((p) => p.id)).toContain("our-group");
  });

  it("selects Offices for office questions", () => {
    const pages = selectSitePagesForQuery("Where are your offices?");
    expect(pages.map((p) => p.id)).toContain("offices");
  });

  it("does not fetch Offices just because a port city is mentioned", () => {
    const pages = selectSitePagesForQuery(
      "Ship my yacht from Southampton to Antigua"
    );
    expect(pages.map((p) => p.id)).not.toContain("offices");
  });

  it("selects Careers for jobs", () => {
    const pages = selectSitePagesForQuery("Any careers or vacancies?");
    expect(pages.map((p) => p.id)).toContain("careers");
  });

  it("returns empty for a pure yacht quote", () => {
    const pages = selectSitePagesForQuery(
      "I need a quote to ship my yacht from Genoa to Antigua"
    );
    expect(pages).toHaveLength(0);
  });
});
