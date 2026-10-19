import { describe, expect, it } from "vitest";
import { campaignCloneInput, copyName } from "@/lib/email/clone";
import type { EmailCampaign } from "@/lib/types";

describe("copyName", () => {
  it("prefixes a campaign title once", () => {
    expect(copyName("Asia to Americas")).toBe("Copy of Asia to Americas");
    expect(copyName("Copy of Asia to Americas")).toBe("Copy of Asia to Americas");
    expect(copyName("  ")).toBe("Copy of Untitled email");
  });
});

describe("campaignCloneInput", () => {
  it("keeps the design and audience and starts a fresh draft", () => {
    const existing = {
      id: "ecamp_1",
      title: "Sailing Schedules | Oct 26 Week 1",
      status: "sent",
      subject: "Sailing Schedules",
      preview_text: "This week",
      from_name: "Peters & May",
      from_email: "hello@petersandmay.com",
      html_body: "<p>Schedules</p>",
      design: null,
      template_id: "etpl_sailing_schedules",
      audience_id: "eaud_51d6c3cc",
      list_ids: ["ml_385a4ffb"],
      recipient_ids: ["ctc_1"],
      brief: "Weekly",
      hubspot_url: "",
      theme_id: null,
      content_id: null,
      folder: "Yacht",
      follow_up_of: "ecamp_old",
      adj_open_rate: 12,
      adj_click_rate: 3,
      scheduled_at: "2026-10-19T13:00:00.000Z",
      sent_at: "2026-10-19T13:00:00.000Z",
      stats: {
        recipients: 10,
        delivered: 9,
        opened: 4,
        clicked: 1,
        bounced: 0,
        complained: 0,
        unsubscribed: 0,
      },
      last_error: "old",
      created_by: "a@petersandmay.com",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-19T00:00:00.000Z",
    } satisfies EmailCampaign;

    const copy = campaignCloneInput(existing, "b@petersandmay.com");
    expect(copy.title).toBe("Copy of Sailing Schedules | Oct 26 Week 1");
    expect(copy.status).toBe("draft");
    expect(copy.html_body).toBe(existing.html_body);
    expect(copy.audience_id).toBe(existing.audience_id);
    expect(copy.list_ids).toEqual(["ml_385a4ffb"]);
    expect(copy.sent_at).toBeNull();
    expect(copy.scheduled_at).toBeNull();
    expect(copy.follow_up_of).toBeNull();
    expect(copy.last_error).toBe("");
    expect(copy.created_by).toBe("b@petersandmay.com");
  });
});
