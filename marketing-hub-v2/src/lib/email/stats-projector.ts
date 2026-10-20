import type { EmailCampaignStats, EmailEvent } from "@/lib/types";

/**
 * Rebuild delivery counters from event rows so Analyse / campaign cards
 * stay aligned with the per-campaign report (which already reads events).
 */
export function projectCampaignStatsFromEvents(
  events: EmailEvent[],
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
