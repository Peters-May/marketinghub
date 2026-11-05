import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/share/email/[token]/route";

const getPublicEmailByShareToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/repos", () => ({
  getPublicEmailByShareToken,
}));

const TOKEN = "abcdefghij1234567890ab";

describe("public email share route", () => {
  beforeEach(() => getPublicEmailByShareToken.mockReset());

  it("returns 404 when the link is off", async () => {
    getPublicEmailByShareToken.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest(`https://hub.test/share/email/${TOKEN}`),
      { params: { token: TOKEN } }
    );
    expect(res.status).toBe(404);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'none'");
    expect(csp).toMatch(/sandbox(?![^;]*allow-scripts)/);
    expect(csp).toContain("allow-downloads");
    expect(await res.text()).toContain("not available");
  });

  it("serves the saved draft with sample names", async () => {
    getPublicEmailByShareToken.mockResolvedValueOnce({
      title: "October schedules",
      subject: "Hello",
      html_body: "<p>Hi {{name}}</p>",
      sent: false,
    });
    const res = await GET(
      new NextRequest(`https://hub.test/share/email/${TOKEN}`),
      { params: { token: TOKEN } }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const html = await res.text();
    expect(html).toContain("Draft preview");
    expect(html).toContain("Alex Example");
    expect(html).toContain("This email has not been sent.");
  });
});
