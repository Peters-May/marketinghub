import { describe, expect, it } from "vitest";
import { buildCampaignReport, mailClientFromUserAgent } from "@/lib/email/campaign-report";
import { annotateClickMap } from "@/lib/email/click-map";
import { readResendEventDetail } from "@/lib/email/resend-event";
import type { EmailCampaign, EmailEvent } from "@/lib/types";

function campaign(patch: Partial<EmailCampaign> = {}): EmailCampaign {
  return {
    id: "ecamp_test",
    title: "Test",
    status: "sent",
    subject: "Subject",
    preview_text: "",
    from_name: "Peters & May",
    from_email: "marketing@petersandmay.com",
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
    follow_up_of: null,
    adj_open_rate: 45,
    adj_click_rate: 8,
    scheduled_at: null,
    sent_at: "2026-10-01T09:00:00.000Z",
    stats: {
      recipients: 10,
      delivered: 10,
      opened: 4,
      clicked: 2,
      bounced: 1,
      complained: 0,
      unsubscribed: 2,
    },
    last_error: "",
    created_by: "",
    created_at: "2026-10-01T09:00:00.000Z",
    updated_at: "2026-10-01T09:00:00.000Z",
    ...patch,
  };
}

function event(patch: Partial<EmailEvent> & Pick<EmailEvent, "kind">): EmailEvent {
  return {
    id: "eevt_1",
    campaign_id: "ecamp_test",
    contact_id: null,
    email: "a@example.com",
    resend_message_id: "",
    meta: "",
    link: "",
    user_agent: "",
    created_at: "2026-10-02T10:00:00.000Z",
    ...patch,
  };
}

describe("Resend event detail", () => {
  it("reads campaign id from a tag array and from a tag object", () => {
    expect(
      readResendEventDetail({
        tags: [{ name: "campaign_id", value: "ecamp_asia_americas" }],
      }).campaignId
    ).toBe("ecamp_asia_americas");
    expect(
      readResendEventDetail({
        tags: { campaign_id: "ecamp_asia_americas" },
      }).campaignId
    ).toBe("ecamp_asia_americas");
  });

  it("keeps the clicked link and user agent, and drops the IP address", () => {
    const detail = readResendEventDetail({
      tags: { campaign_id: "ecamp_test" },
      click: {
        ipAddress: "122.115.53.11",
        link: "https://www.petersandmay.com/sailing-schedules/fe-us2611/",
        timestamp: "2026-10-02T11:00:00.000Z",
        userAgent: "Mozilla/5.0 Gmail",
      },
    });
    expect(detail.link).toContain("fe-us2611");
    expect(detail.userAgent).toContain("Gmail");
    expect(detail.occurredAt).toBe("2026-10-02T11:00:00.000Z");
    expect(detail).not.toHaveProperty("ipAddress");
    expect(JSON.stringify(detail)).not.toContain("122.115.53.11");
  });
});

describe("campaign report", () => {
  it("counts a person once for the open rate", () => {
    const report = buildCampaignReport({
      campaign: campaign({ adj_open_rate: null, adj_click_rate: null }),
      events: [
        event({ id: "1", kind: "opened", email: "a@example.com" }),
        event({ id: "2", kind: "opened", email: "a@example.com" }),
        event({
          id: "3",
          kind: "clicked",
          email: "b@example.com",
          link: "https://www.petersandmay.com/sailing-schedules/",
        }),
      ],
      contacts: [{ email: "b@example.com", name: "Blake" }],
      suppressions: [],
    });
    expect(report.openRate).toBe("10%");
    expect(report.clickRate).toBe("10%");
    expect(report.contacts[0]).toMatchObject({ name: "Blake", clicks: 1 });
    expect(report.links).toHaveLength(1);
  });

  it("keeps imported rates when no events have been stored", () => {
    const report = buildCampaignReport({
      campaign: campaign(),
      events: [],
      contacts: [],
      suppressions: [],
    });
    expect(report.tracked).toBe(false);
    expect(report.openRate).toBe("45%");
    expect(report.clickRate).toBe("8%");
    expect(report.suppressions.unsubscribe).toBe(2);
    expect(report.links).toEqual([]);
    expect(report.days).toEqual([]);
    expect(report.unsubscribedPeople).toEqual([]);
    expect(report.bouncedPeople).toEqual([]);
  });

  it("lists who unsubscribed and who bounced", () => {
    const report = buildCampaignReport({
      campaign: campaign({ adj_open_rate: null, adj_click_rate: null }),
      events: [
        event({
          id: "u1",
          kind: "unsubscribed",
          email: "lea@example.com",
          meta: "Too many emails",
        }),
        event({ id: "b1", kind: "bounced", email: "bad@example.com" }),
      ],
      contacts: [
        { email: "lea@example.com", name: "Lea" },
        { email: "bad@example.com", name: "Bad address" },
      ],
      suppressions: [
        {
          campaign_id: "ecamp_test",
          reason: "unsubscribe",
          email: "lea@example.com",
          detail: "Too many emails",
        },
        {
          campaign_id: "ecamp_test",
          reason: "bounce",
          email: "bad@example.com",
        },
      ],
    });
    expect(report.unsubscribedPeople).toEqual([
      {
        name: "Lea",
        email: "lea@example.com",
        reason: "unsubscribe",
        detail: "Too many emails",
      },
    ]);
    expect(report.bouncedPeople).toEqual([
      { name: "Bad address", email: "bad@example.com", reason: "bounce" },
    ]);
  });

  it("uses the event note when there is no suppression detail", () => {
    const report = buildCampaignReport({
      campaign: campaign({ adj_open_rate: null, adj_click_rate: null }),
      events: [
        event({
          id: "u2",
          kind: "unsubscribed",
          email: "pat@example.com",
          meta: "Content is not relevant",
        }),
      ],
      contacts: [{ email: "pat@example.com", name: "Pat" }],
      suppressions: [],
    });
    expect(report.unsubscribedPeople).toEqual([
      {
        name: "Pat",
        email: "pat@example.com",
        reason: "unsubscribe",
        detail: "Content is not relevant",
      },
    ]);
  });

  it("names the mail client from the user agent", () => {
    expect(mailClientFromUserAgent("Mozilla/5.0 GoogleImageProxy")).toBe("Gmail");
    expect(
      mailClientFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"
      )
    ).toBe("Apple Mail");
    expect(mailClientFromUserAgent("Mozilla/5.0 Outlook")).toBe("Outlook");
    expect(mailClientFromUserAgent("YahooMailProxy")).toBe("Yahoo");
    expect(mailClientFromUserAgent("")).toBeNull();
  });
});

describe("click map", () => {
  it("adds a count to matching links and leaves unsubscribe unmarked", () => {
    const html = [
      '<a href="https://www.petersandmay.com/sailing-schedules/fe-us2611">Enquire</a>',
      '<a href="https://example.com/unsubscribe?token=abc">Unsubscribe</a>',
    ].join("");
    const marked = annotateClickMap(html, [
      {
        url: "https://www.petersandmay.com/sailing-schedules/fe-us2611/",
        count: 4,
      },
      { url: "https://example.com/unsubscribe?token=abc", count: 9 },
    ]);
    expect(marked).toContain(">4</span>Enquire");
    expect(marked).not.toContain(">9</span>");
    expect(marked).toContain(">Unsubscribe</a>");
  });
});
