import { describe, expect, it } from "vitest";
import {
  canonicalSiteUrl,
  isContentSitemap,
  isSitemapIndex,
  knowledgeQueryWords,
  pageTitleFromHtml,
  parseSitemapLocs,
  siteDocumentId,
} from "@/lib/chat/site-knowledge";

describe("website knowledge urls", () => {
  it("keeps public Peters & May pages and adds a trailing slash", () => {
    expect(canonicalSiteUrl("https://petersandmay.com/our-group")).toBe(
      "https://www.petersandmay.com/our-group/"
    );
  });

  it("drops sailing schedules, utility pages, and other hosts", () => {
    expect(
      canonicalSiteUrl("https://www.petersandmay.com/sailings/")
    ).toBeNull();
    expect(
      canonicalSiteUrl("https://www.petersandmay.com/cookie-declaration/")
    ).toBeNull();
    expect(canonicalSiteUrl("https://example.com/offices/")).toBeNull();
  });

  it("accepts content sitemaps and skips sailing and landing-page sitemaps", () => {
    expect(
      isContentSitemap("https://www.petersandmay.com/page-sitemap.xml")
    ).toBe(true);
    expect(
      isContentSitemap("https://www.petersandmay.com/faq-sitemap.xml")
    ).toBe(true);
    expect(
      isContentSitemap(
        "https://www.petersandmay.com/sailing-schedules-sitemap.xml"
      )
    ).toBe(false);
    expect(
      isContentSitemap(
        "https://www.petersandmay.com/e-landing-page-sitemap.xml"
      )
    ).toBe(false);
  });
});

describe("sitemap parsing", () => {
  it("reads locs and ignores an HTML error page", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://www.petersandmay.com/offices/</loc></url></urlset>`;
    expect(parseSitemapLocs(xml)).toEqual([
      "https://www.petersandmay.com/offices/",
    ]);
    expect(parseSitemapLocs("<!doctype html><html><loc>no</loc></html>")).toEqual(
      []
    );
  });

  it("detects a sitemap index", () => {
    expect(isSitemapIndex("<sitemapindex><sitemap></sitemap></sitemapindex>")).toBe(
      true
    );
    expect(isSitemapIndex("<urlset></urlset>")).toBe(false);
  });
});

describe("site document ids and titles", () => {
  it("uses a stable id for the same page", () => {
    const url = "https://www.petersandmay.com/offices/";
    expect(siteDocumentId(url)).toBe(siteDocumentId(url));
    expect(siteDocumentId(url).startsWith("kb_site_")).toBe(true);
    expect(siteDocumentId(url)).not.toBe(
      siteDocumentId("https://www.petersandmay.com/careers/")
    );
  });

  it("strips the Peters & May suffix from the title", () => {
    const title = pageTitleFromHtml(
      "<html><title>Our Global Offices | Peters &amp; May</title></html>",
      "https://www.petersandmay.com/offices/"
    );
    expect(title).toBe("Our Global Offices");
  });

  it("strips the live site title suffix", () => {
    const title = pageTitleFromHtml(
      "<html><title>Our Group | Peters and May | Global Logistics</title></html>",
      "https://www.petersandmay.com/our-group/"
    );
    expect(title).toBe("Our Group");
  });
});

describe("knowledgeQueryWords", () => {
  it("keeps useful words and drops stop words", () => {
    expect(knowledgeQueryWords("Where are your offices in Genoa?")).toEqual([
      "offices",
      "genoa",
    ]);
  });
});
