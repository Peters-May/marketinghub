import { describe, expect, it } from "vitest";
import {
  brandedDetailRowsHtml,
  brandedHubEmailHtml,
  brandedPanelHtml,
  escapeHtml,
} from "@/lib/email/brand-shell";

describe("branded hub email shell", () => {
  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">"&`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&quot;&amp;"
    );
  });

  it("renders navy header, blue accent, CTA, and footer", () => {
    const html = brandedHubEmailHtml({
      eyebrow: "Marketing Hub · Alert",
      heading: "New clothing",
      bodyHtml: "<p>A new order arrived.</p>",
      ctaLabel: "Open in Marketing Hub",
      ctaHref: "https://marketing.petersandmay.com/app/shop",
      footerNote: "Automated notification from Marketing Hub.",
    });

    expect(html).toContain("#0B2545");
    expect(html).toContain("#007DC5");
    expect(html).toContain("Peters &amp; May");
    expect(html).toContain("New clothing");
    expect(html).toContain("Open in Marketing Hub");
    expect(html).toContain("pm-group-logo.png");
    expect(html).toContain("bespoke logistics");
  });

  it("builds detail rows and mist panels", () => {
    const rows = brandedDetailRowsHtml([
      { label: "Who", value: "Sophie", href: "mailto:sophie@petersandmay.com" },
      { label: "Empty", value: "  " },
    ]);
    expect(rows).toContain("Sophie");
    expect(rows).toContain("mailto:sophie@petersandmay.com");
    expect(rows).not.toContain("Empty");

    const panel = brandedPanelHtml("Transcript", "<p>Hello</p>");
    expect(panel).toContain("Transcript");
    expect(panel).toContain("Hello");
    expect(panel).toContain("#E3E6E9");
  });
});
