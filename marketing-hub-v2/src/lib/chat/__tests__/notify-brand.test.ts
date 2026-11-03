import { describe, expect, it } from "vitest";
import { brandedChatEmailHtml, escapeHtml } from "@/lib/chat/notify";

describe("chat notify branding", () => {
  it("escapes HTML in plain text", () => {
    expect(escapeHtml(`<a href="x">"&`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&quot;&amp;"
    );
  });

  it("builds a branded shell with who/what context and CTA", () => {
    const html = brandedChatEmailHtml({
      eyebrow: "Marketing Hub · Website chat",
      heading: "A visitor has asked to speak to the team",
      intro: "Open the inbox to reply.",
      rows: [
        { label: "Who", value: "Sophie (sophie@petersandmay.com)" },
        { label: "What", value: "Asked to speak to a person (handover)" },
      ],
      snippetsLabel: "Recent visitor messages",
      snippets: ["Hello how can I help"],
      ctaLabel: "Open chat inbox",
      ctaHref: "https://marketing.petersandmay.com/app/chat?session=abc",
    });

    expect(html).toContain("Peters &amp; May");
    expect(html).toContain("#0B2545");
    expect(html).toContain("Sophie (sophie@petersandmay.com)");
    expect(html).toContain("Asked to speak to a person (handover)");
    expect(html).toContain("Open chat inbox");
    expect(html).toContain("Hello how can I help");
  });

  it("visitor closed copy invites email reply without website CTA", () => {
    const html = brandedChatEmailHtml({
      eyebrow: "Peters & May · Website chat",
      heading: "Your website chat has ended",
      intro:
        "Reply to this email to continue the conversation — your message will reach the team.",
      rows: [{ label: "Reply to", value: "marketing@petersandmay.com" }],
      snippets: ["Team: Thanks for your enquiry."],
      footerNote:
        "Reply to this email to continue with the Peters & May team.",
    });

    expect(html).toContain("Reply to this email");
    expect(html).not.toContain("Open chat inbox");
    expect(html).not.toContain("continue the conversation there");
  });
});
