import { linkKey } from "@/lib/email/click-map";
import {
  campaignClickRateLabel,
  campaignOpenRateLabel,
} from "@/lib/email/display";
import type {
  EmailCampaign,
  EmailEvent,
  EmailSuppression,
} from "@/lib/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const CLIENTS = ["Gmail", "Apple Mail", "Outlook", "Yahoo", "Other"] as const;

export type CampaignLinkStat = { url: string; count: number };
export type CampaignContactStat = {
  name: string;
  email: string;
  opens: number;
  clicks: number;
};
export type CampaignSuppressionPerson = {
  name: string;
  email: string;
  reason: "unsubscribe" | "bounce" | "complaint";
  /** Recipient-provided why, when they left via the preference page. */
  detail?: string;
};
export type CampaignDayStat = { label: string; opens: number; clicks: number };
export type CampaignClientStat = { label: string; count: number };

export type CampaignReport = {
  sentTo: number;
  deliveredTo: number;
  openRate: string;
  clickRate: string;
  /** True once any Resend event has been stored for this campaign. */
  tracked: boolean;
  delivery: {
    sent: number;
    bounced: number;
    unsubscribed: number;
    complained: number;
  };
  links: CampaignLinkStat[];
  contacts: CampaignContactStat[];
  suppressions: { unsubscribe: number; bounce: number; complaint: number };
  /** Named people who unsubscribed from this campaign. */
  unsubscribedPeople: CampaignSuppressionPerson[];
  /** Named people who bounced on this campaign. */
  bouncedPeople: CampaignSuppressionPerson[];
  days: CampaignDayStat[];
  clients: CampaignClientStat[];
};

type ContactName = { email: string; name: string };
type SuppressionRow = Pick<
  EmailSuppression,
  "campaign_id" | "reason" | "email" | "detail"
>;

export function buildCampaignReport(input: {
  campaign: EmailCampaign;
  events: EmailEvent[];
  contacts: ContactName[];
  suppressions: SuppressionRow[];
}): CampaignReport {
  const events = input.events.filter(
    (event) => event.campaign_id === input.campaign.id
  );
  const tracked = events.length > 0;
  const stats = input.campaign.stats;
  const base = stats.delivered || stats.recipients;

  const names = new Map<string, string>();
  for (const contact of input.contacts) {
    const email = contact.email.trim().toLowerCase();
    const name = contact.name.trim();
    if (email && name && !names.has(email)) names.set(email, name);
  }

  const openers = new Set<string>();
  const clickers = new Set<string>();
  const linkCounts = new Map<string, { url: string; count: number }>();
  const people = new Map<string, { opens: number; clicks: number }>();
  const clientCounts = new Map<string, number>();

  for (const event of events) {
    const email = event.email.trim().toLowerCase();
    if (event.kind === "opened" && email && email !== "unknown") {
      openers.add(email);
      const person = people.get(email) ?? { opens: 0, clicks: 0 };
      person.opens += 1;
      people.set(email, person);
      const client = mailClientFromUserAgent(event.user_agent ?? "");
      if (client) clientCounts.set(client, (clientCounts.get(client) ?? 0) + 1);
    }
    if (event.kind === "clicked" && email && email !== "unknown") {
      clickers.add(email);
      const person = people.get(email) ?? { opens: 0, clicks: 0 };
      person.clicks += 1;
      people.set(email, person);
      const key = linkKey(event.link ?? "");
      if (key) {
        const prev = linkCounts.get(key);
        if (prev) prev.count += 1;
        else linkCounts.set(key, { url: (event.link ?? "").trim(), count: 1 });
      }
    }
  }

  const suppressions = { unsubscribe: 0, bounce: 0, complaint: 0 };
  const unsubscribedPeople: CampaignSuppressionPerson[] = [];
  const bouncedPeople: CampaignSuppressionPerson[] = [];
  const seenUnsub = new Set<string>();
  const seenBounce = new Set<string>();

  for (const row of input.suppressions) {
    if (row.campaign_id !== input.campaign.id) continue;
    if (row.reason === "unsubscribe") suppressions.unsubscribe += 1;
    if (row.reason === "bounce") suppressions.bounce += 1;
    if (row.reason === "complaint") suppressions.complaint += 1;
    const email = row.email.trim().toLowerCase();
    if (!email) continue;
    const detail =
      typeof row.detail === "string" && row.detail.trim()
        ? row.detail.trim()
        : undefined;
    const person = {
      email,
      name: names.get(email) || email,
      reason: row.reason,
      ...(detail ? { detail } : {}),
    } as CampaignSuppressionPerson;
    if (row.reason === "unsubscribe" && !seenUnsub.has(email)) {
      seenUnsub.add(email);
      unsubscribedPeople.push(person);
    }
    if (row.reason === "bounce" && !seenBounce.has(email)) {
      seenBounce.add(email);
      bouncedPeople.push(person);
    }
  }

  for (const event of events) {
    const email = event.email.trim().toLowerCase();
    if (!email || email === "unknown") continue;
    if (event.kind === "unsubscribed") {
      const detail =
        typeof event.meta === "string" &&
        event.meta.trim() &&
        !/^email\./i.test(event.meta.trim())
          ? event.meta.trim()
          : undefined;
      if (seenUnsub.has(email)) {
        if (detail) {
          const existing = unsubscribedPeople.find((person) => person.email === email);
          if (existing && !existing.detail) existing.detail = detail;
        }
      } else {
        seenUnsub.add(email);
        unsubscribedPeople.push({
          email,
          name: names.get(email) || email,
          reason: "unsubscribe",
          ...(detail ? { detail } : {}),
        });
        if (
          !input.suppressions.some(
            (row) =>
              row.campaign_id === input.campaign.id &&
              row.reason === "unsubscribe" &&
              row.email.trim().toLowerCase() === email
          )
        ) {
          suppressions.unsubscribe += 1;
        }
      }
    }
    if (event.kind === "bounced" && !seenBounce.has(email)) {
      seenBounce.add(email);
      bouncedPeople.push({
        email,
        name: names.get(email) || email,
        reason: "bounce",
      });
    }
  }

  unsubscribedPeople.sort((a, b) => a.name.localeCompare(b.name));
  bouncedPeople.sort((a, b) => a.name.localeCompare(b.name));

  if (
    !tracked &&
    suppressions.unsubscribe === 0 &&
    stats.unsubscribed > 0
  ) {
    suppressions.unsubscribe = stats.unsubscribed;
  }

  const bouncedCount = Math.max(
    stats.bounced,
    suppressions.bounce,
    bouncedPeople.length
  );
  const unsubscribedCount = Math.max(
    stats.unsubscribed,
    suppressions.unsubscribe,
    unsubscribedPeople.length
  );

  return {
    sentTo: stats.recipients,
    deliveredTo: stats.delivered,
    openRate: tracked
      ? formatRate(base ? (openers.size / base) * 100 : 0)
      : campaignOpenRateLabel(input.campaign),
    clickRate: tracked
      ? formatRate(base ? (clickers.size / base) * 100 : 0)
      : campaignClickRateLabel(input.campaign),
    tracked,
    delivery: {
      sent: stats.recipients,
      bounced: bouncedCount,
      unsubscribed: unsubscribedCount,
      complained: stats.complained,
    },
    links: [...linkCounts.values()].sort((a, b) => b.count - a.count || a.url.localeCompare(b.url)),
    contacts: [...people.entries()]
      .map(([email, counts]) => ({
        email,
        name: names.get(email) || email,
        opens: counts.opens,
        clicks: counts.clicks,
      }))
      .sort(
        (a, b) =>
          b.clicks - a.clicks || b.opens - a.opens || a.email.localeCompare(b.email)
      )
      .slice(0, 8),
    suppressions,
    unsubscribedPeople,
    bouncedPeople,
    days: engagementSeries(events),
    clients: CLIENTS.filter((label) => (clientCounts.get(label) ?? 0) > 0).map(
      (label) => ({ label, count: clientCounts.get(label) ?? 0 })
    ),
  };
}

/** Rough mail-client label from a Resend user agent. Empty when there is no agent. */
export function mailClientFromUserAgent(userAgent: string): string | null {
  const agent = userAgent.toLowerCase();
  if (!agent.trim()) return null;
  if (agent.includes("googleimageproxy") || agent.includes("gmail")) return "Gmail";
  if (agent.includes("yahoo") || agent.includes("ymail")) return "Yahoo";
  if (
    agent.includes("outlook") ||
    agent.includes("microsoft office") ||
    agent.includes("ms-office")
  ) {
    return "Outlook";
  }
  if (
    (agent.includes("iphone") ||
      agent.includes("ipad") ||
      agent.includes("macintosh")) &&
    agent.includes("applewebkit") &&
    !agent.includes("chrome") &&
    !agent.includes("chromium") &&
    !agent.includes("android")
  ) {
    return "Apple Mail";
  }
  return "Other";
}

function formatRate(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}%`;
}

function engagementSeries(events: EmailEvent[]): CampaignDayStat[] {
  const activity = events.filter(
    (event) => event.kind === "opened" || event.kind === "clicked"
  );
  if (activity.length === 0) return [];

  const buckets = new Map<string, { opens: number; clicks: number }>();
  for (const event of activity) {
    const day = londonDayKey(event.created_at);
    if (!day) continue;
    const row = buckets.get(day) ?? { opens: 0, clicks: 0 };
    if (event.kind === "opened") row.opens += 1;
    if (event.kind === "clicked") row.clicks += 1;
    buckets.set(day, row);
  }

  const keys = [...buckets.keys()].sort();
  const span = daySpan(keys[0], keys[keys.length - 1]);
  if (span <= 21) {
    return keys.slice(-21).map((key) => ({
      label: labelFromKey(key),
      opens: buckets.get(key)?.opens ?? 0,
      clicks: buckets.get(key)?.clicks ?? 0,
    }));
  }

  const weeks = new Map<string, { opens: number; clicks: number }>();
  for (const key of keys) {
    const week = mondayKey(key);
    const row = weeks.get(week) ?? { opens: 0, clicks: 0 };
    row.opens += buckets.get(key)?.opens ?? 0;
    row.clicks += buckets.get(key)?.clicks ?? 0;
    weeks.set(week, row);
  }
  return [...weeks.keys()]
    .sort()
    .slice(-16)
    .map((key) => ({
      label: labelFromKey(key),
      opens: weeks.get(key)?.opens ?? 0,
      clicks: weeks.get(key)?.clicks ?? 0,
    }));
}

function londonDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function mondayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dow = utc.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

function daySpan(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function labelFromKey(key: string): string {
  const [, month, day] = key.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""}`.trim();
}
