import { describe, expect, it } from "vitest";
import {
  emailSharePath,
  omitEmailSharePatch,
  renderPublicEmailHtml,
  toPublicEmailDraft,
} from "@/lib/email/share";

const TOKEN = "abcdefghij1234567890ab";

describe("email share link", () => {
  it("builds a path only for an unlisted token", () => {
    expect(emailSharePath(TOKEN)).toBe(`/share/email/${TOKEN}`);
    expect(emailSharePath("short")).toBe("");
    expect(emailSharePath("../etc/passwd-extra")).toBe("");
  });

  it("builds a public draft with audience metadata", () => {
    const record = {
      share_enabled: true,
      share_token: TOKEN,
      title: "October schedules",
      subject: "Hello {{first_name}}",
      html_body: "<p>Hi</p>",
      id: "ec_1",
      kind: "campaign" as const,
    };
    expect(toPublicEmailDraft(record, "short")).toBeNull();
    expect(toPublicEmailDraft(record, TOKEN, "client")).toMatchObject({
      title: "October schedules",
      subject: "Hello {{first_name}}",
      audience: "client",
      kind: "campaign",
      id: "ec_1",
    });
  });

  it("does not let a normal save publish the link", () => {
    expect(
      omitEmailSharePatch({
        subject: "Hello",
        share_token: TOKEN,
        share_enabled: true,
        client_share_token: TOKEN,
        client_share_enabled: true,
      })
    ).toEqual({ subject: "Hello" });
  });

  it("renders the saved draft with sample names and an inert footer", () => {
    const html = renderPublicEmailHtml({
      subject: `Hello <script>alert(1)</script>`,
      html: `<html><head><title>Old</title></head><body><p>Hi {{name}}</p><a href="{{unsubscribe_url}}">Unsubscribe</a><a href="{{view_in_browser_url}}">View</a></body></html>`,
      shareUrl: `https://hub.test/share/email/${TOKEN}`,
    });
    expect(html).toContain("Draft preview");
    expect(html).toContain("This email has not been sent.");
    expect(html).toContain("Alex Example");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('href="#"');
    expect(html).toContain(`https://hub.test/share/email/${TOKEN}`);
    expect(html).toContain('content="noindex, nofollow"');
    expect(html).not.toContain("example.com/unsubscribe");
  });
});
