import { describe, expect, it } from "vitest";
import {
  campaignClickRateLabel,
  campaignOpenRateLabel,
  engagementRatePercent,
} from "@/lib/email/display";
import type { EmailCampaign } from "@/lib/types";

function campaign(
  stats: Partial<EmailCampaign["stats"]>,
  rates?: { adj_open_rate?: number | null; adj_click_rate?: number | null }
): EmailCampaign {
  return {
    id: "c1",
    title: "Test",
    status: "sent",
    subject: "",
    preview_text: "",
    from_name: "",
    from_email: "",
    html_body: "",
    design: null,
    template_id: null,
    audience_id: null,
    exclude_audience_id: null,
    list_ids: [],
    recipient_ids: [],
    brief: "",
    hubspot_url: "",
    theme_id: null,
    content_id: null,
    folder: "",
    category: "marketing",
    follow_up_of: null,
    adj_open_rate: rates?.adj_open_rate ?? null,
    adj_click_rate: rates?.adj_click_rate ?? null,
    scheduled_at: null,
    sent_at: "2026-11-03T15:58:00.000Z",
    send_claim: "",
    send_heartbeat_at: null,
    share_token: "",
    share_enabled: false,
    stats: {
      recipients: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      unsubscribed: 0,
      ...stats,
    },
    last_error: "",
    created_by: "sophie",
    created_at: "2026-11-03T15:58:00.000Z",
    updated_at: "2026-11-03T15:58:00.000Z",
  };
}

describe("engagementRatePercent", () => {
  it("caps unique engagement at the audience size", () => {
    expect(engagementRatePercent(51, 1)).toBe(100);
    expect(engagementRatePercent(2, 1)).toBe(100);
    expect(engagementRatePercent(1, 2)).toBe(50);
    expect(engagementRatePercent(0, 10)).toBe(0);
    expect(engagementRatePercent(5, 0)).toBe(0);
  });
});

describe("campaign rate labels", () => {
  it("does not show impossible open or click rates from inflated counters", () => {
    const row = campaign({ recipients: 1, delivered: 1, opened: 51, clicked: 2 });
    expect(campaignOpenRateLabel(row)).toBe("100%");
    expect(campaignClickRateLabel(row)).toBe("100%");
  });

  it("still reports normal rates under 100%", () => {
    const row = campaign({ recipients: 10, delivered: 10, opened: 4, clicked: 1 });
    expect(campaignOpenRateLabel(row)).toBe("40%");
    expect(campaignClickRateLabel(row)).toBe("10%");
  });

  it("caps imported adjusted rates at 100%", () => {
    const row = campaign(
      { recipients: 1, delivered: 1 },
      { adj_open_rate: 5100, adj_click_rate: 200 }
    );
    expect(campaignOpenRateLabel(row)).toBe("100%");
    expect(campaignClickRateLabel(row)).toBe("100%");
  });
});
