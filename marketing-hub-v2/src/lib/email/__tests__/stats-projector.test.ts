import { describe, expect, it } from "vitest";
import {
  campaignStatsFromEvents,
  projectCampaignStatsFromEvents,
  withLiveEmailStats,
} from "@/lib/email/stats-projector";
import type { EmailCampaignStats, EmailEvent } from "@/lib/types";

function event(
  kind: EmailEvent["kind"],
  email: string,
  id = kind + email
): EmailEvent {
  return {
    id,
    campaign_id: "c1",
    contact_id: null,
    email,
    kind,
    resend_message_id: "",
    meta: "",
    link: "",
    user_agent: "",
    created_at: "2026-10-20T00:00:00.000Z",
  };
}

describe("projectCampaignStatsFromEvents", () => {
  it("counts unique recipients per event kind", () => {
    const stats = projectCampaignStatsFromEvents(
      [
        event("sent", "a@example.com"),
        event("sent", "b@example.com"),
        event("delivered", "a@example.com"),
        event("opened", "a@example.com"),
        event("opened", "a@example.com", "opened-dup"),
        event("clicked", "a@example.com"),
        event("bounced", "b@example.com"),
      ],
      { recipients: 2 }
    );
    expect(stats.recipients).toBe(2);
    expect(stats.delivered).toBe(1);
    expect(stats.opened).toBe(1);
    expect(stats.clicked).toBe(1);
    expect(stats.bounced).toBe(1);
  });
});

const stored: EmailCampaignStats = {
  recipients: 1958,
  delivered: 1958,
  opened: 800,
  clicked: 77,
  bounced: 4,
  complained: 0,
  unsubscribed: 3,
};

describe("campaignStatsFromEvents", () => {
  it("keeps an imported total when that kind of event has not arrived", () => {
    const stats = campaignStatsFromEvents(
      [event("bounced", "bad@example.com")],
      stored
    );
    expect(stats.delivered).toBe(1958);
    expect(stats.opened).toBe(800);
    expect(stats.clicked).toBe(77);
    expect(stats.bounced).toBe(4);
  });

  it("fills delivered, opens, and clicks from events when the stored counters are zero", () => {
    const stats = campaignStatsFromEvents(
      [
        event("delivered", "a@example.com"),
        event("delivered", "b@example.com"),
        event("opened", "a@example.com"),
        event("opened", "a@example.com", "opened-again"),
        event("clicked", "b@example.com"),
      ],
      { recipients: 4, delivered: 0, opened: 0, clicked: 0 }
    );
    expect(stats.delivered).toBe(2);
    expect(stats.opened).toBe(1);
    expect(stats.clicked).toBe(1);
    expect(stats.recipients).toBe(4);
  });
});

describe("withLiveEmailStats", () => {
  it("updates only the campaign that has events", () => {
    const rows = withLiveEmailStats(
      [
        {
          id: "live",
          stats: {
            recipients: 2,
            delivered: 0,
            opened: 0,
            clicked: 0,
            bounced: 0,
            complained: 0,
            unsubscribed: 0,
          },
        },
        { id: "imported", stats: stored },
      ],
      [
        {
          campaign_id: "live",
          email: "a@example.com",
          kind: "delivered",
        },
        {
          campaign_id: "live",
          email: "a@example.com",
          kind: "opened",
        },
      ]
    );
    expect(rows[0]?.stats.delivered).toBe(1);
    expect(rows[0]?.stats.opened).toBe(1);
    expect(rows[1]?.stats).toEqual(stored);
  });
});
