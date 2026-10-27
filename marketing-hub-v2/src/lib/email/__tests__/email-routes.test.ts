import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const start = vi.hoisted(() => vi.fn(async () => ({ runId: "run_1" })));
vi.mock("workflow/api", () => ({ start }));
vi.mock("@/workflows/resend-event", () => ({ resendEventWorkflow: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => null }));

const campaigns = vi.hoisted(() => ({
  html: "<p>Hi {{name}}</p>",
}));
vi.mock("@/lib/data/repos", () => ({
  getEmailCampaign: async (id: string) => ({ id, html_body: campaigns.html }),
  getContact: async () => ({
    id: "c1",
    name: "<script>alert(1)</script>",
    email: "a@example.com",
    organisation: "",
    role: "",
    outlet: "",
    country: "",
  }),
  getContactByEmail: async () => null,
}));

const SECRET = `whsec_${Buffer.from("test-signing-secret").toString("base64")}`;

function webhookRequest(body: string, sign = true) {
  const id = "msg_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from("test-signing-secret"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new NextRequest("https://hub.test/api/email/webhooks/resend", {
    method: "POST",
    body,
    headers: sign
      ? { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` }
      : {},
  });
}

const complaint = JSON.stringify({
  type: "email.complained",
  data: { to: ["victim@example.com"], email_id: "m1", tags: { campaign_id: "ecamp_1" } },
});

describe("Resend webhook", () => {
  const original = process.env.RESEND_WEBHOOK_SECRET;
  beforeEach(() => start.mockClear());
  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = original;
  });

  it("rejects events when the signing secret is not configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { POST } = await import("@/app/api/email/webhooks/resend/route");
    const res = await POST(webhookRequest(complaint, false));
    expect(res.status).toBe(503);
    expect(start).not.toHaveBeenCalled();
  });

  it("rejects unsigned events", async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const { POST } = await import("@/app/api/email/webhooks/resend/route");
    const res = await POST(webhookRequest(complaint, false));
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it("accepts correctly signed events", async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const { POST } = await import("@/app/api/email/webhooks/resend/route");
    const res = await POST(webhookRequest(complaint));
    expect(res.status).toBe(200);
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("view in browser", () => {
  it("escapes merge fields and blocks script with a CSP sandbox", async () => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-unsubscribe-secret";
    const { viewInBrowserUrlFor } = await import("@/lib/email/unsubscribe-token");
    const { GET } = await import("@/app/email/view/route");
    const url = viewInBrowserUrlFor({
      email: "a@example.com",
      campaignId: "ecamp_1",
      contactId: "c1",
    });
    const token = new URL(url, "https://hub.test").searchParams.get("token") ?? "";
    const res = await GET(new NextRequest(`https://hub.test/email/view?token=${token}`));
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'none'");
    expect(csp).toMatch(/sandbox(?![^;]*allow-scripts)/);
    expect(csp).toContain("base-uri 'none'");
    const html = await res.text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
