import type { EmailCampaign, EmailCampaignStats, EmailEvent } from "@/lib/types";

type StatEvent = Pick<EmailEvent, "email" | "kind">;

/**
 * Rebuild delivery counters from event rows so Analyse / campaign cards
 * stay aligned with the per-campaign report (which already reads events).
 */
export function projectCampaignStatsFromEvents(
  events: StatEvent[],
  base?: Partial<EmailCampaignStats> | null
): EmailCampaignStats {
  const sent = new Set<string>();
  const delivered = new Set<string>();
  const opened = new Set<string>();
  const clicked = new Set<string>();
  const bounced = new Set<string>();
  const complained = new Set<string>();
  const unsubscribed = new Set<string>();

  for (const event of events) {
    const email = (event.email || "").trim().toLowerCase();
    if (!email || email === "unknown") continue;
    switch (event.kind) {
      case "sent":
        sent.add(email);
        break;
      case "delivered":
        delivered.add(email);
        break;
      case "opened":
        opened.add(email);
        break;
      case "clicked":
        clicked.add(email);
        break;
      case "bounced":
        bounced.add(email);
        break;
      case "complained":
        complained.add(email);
        break;
      case "unsubscribed":
        unsubscribed.add(email);
        break;
      default:
        break;
    }
  }

  const recipients = Math.max(
    Number(base?.recipients) || 0,
    sent.size,
    delivered.size
  );

  return {
    recipients,
    delivered: Math.max(Number(base?.delivered) || 0, delivered.size),
    opened: opened.size,
    clicked: clicked.size,
    bounced: bounced.size,
    complained: complained.size,
    unsubscribed: unsubscribed.size,
  };
}

function storedStats(base?: Partial<EmailCampaignStats> | null): EmailCampaignStats {
  return {
    recipients: Number(base?.recipients) || 0,
    delivered: Number(base?.delivered) || 0,
    opened: Number(base?.opened) || 0,
    clicked: Number(base?.clicked) || 0,
    bounced: Number(base?.bounced) || 0,
    complained: Number(base?.complained) || 0,
    unsubscribed: Number(base?.unsubscribed) || 0,
  };
}

/**
 * Live sends store opens and deliveries as events, and leave the campaign
 * counters at zero. Use the events when that kind has arrived, and keep an
 * imported total when it has not.
 */
export function campaignStatsFromEvents(
  events: StatEvent[],
  base?: Partial<EmailCampaignStats> | null
): EmailCampaignStats {
  const stored = storedStats(base);
  if (events.length === 0) return stored;
  const projected = projectCampaignStatsFromEvents(events, stored);
  const kinds = new Set(events.map((event) => event.kind));
  return {
    recipients: projected.recipients,
    delivered: kinds.has("delivered") ? projected.delivered : stored.delivered,
    opened: kinds.has("opened") ? projected.opened : stored.opened,
    clicked: kinds.has("clicked") ? projected.clicked : stored.clicked,
    bounced: kinds.has("bounced")
      ? Math.max(stored.bounced, projected.bounced)
      : stored.bounced,
    complained: kinds.has("complained")
      ? Math.max(stored.complained, projected.complained)
      : stored.complained,
    unsubscribed: kinds.has("unsubscribed")
      ? Math.max(stored.unsubscribed, projected.unsubscribed)
      : stored.unsubscribed,
  };
}

/** Replace list counters with event totals for campaigns that have events. */
export function withLiveEmailStats<T extends Pick<EmailCampaign, "id" | "stats">>(
  campaigns: T[],
  events: Array<Pick<EmailEvent, "campaign_id" | "email" | "kind">>
): T[] {
  if (campaigns.length === 0 || events.length === 0) return campaigns;
  const byCampaign = new Map<string, StatEvent[]>();
  for (const event of events) {
    const rows = byCampaign.get(event.campaign_id);
    const stat = { email: event.email, kind: event.kind };
    if (rows) rows.push(stat);
    else byCampaign.set(event.campaign_id, [stat]);
  }
  return campaigns.map((campaign) => {
    const rows = byCampaign.get(campaign.id);
    if (!rows?.length) return campaign;
    return { ...campaign, stats: campaignStatsFromEvents(rows, campaign.stats) };
  });
}

export function emailStatsEqual(
  a: EmailCampaignStats,
  b: EmailCampaignStats
): boolean {
  return (
    a.recipients === b.recipients &&
    a.delivered === b.delivered &&
    a.opened === b.opened &&
    a.clicked === b.clicked &&
    a.bounced === b.bounced &&
    a.complained === b.complained &&
    a.unsubscribed === b.unsubscribed
  );
}
