import type { EmailCampaign } from "@/lib/types";

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

/** British stamp: 21 Sep 2026 11:01, Europe/London. */
export function formatLondonStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const month = MONTHS[Number(get("month")) - 1] ?? "";
  return `${get("day")} ${month} ${get("year")} ${get("hour")}:${get("minute")}`;
}

export function campaignMetaLine(c: EmailCampaign): string {
  const who = c.created_by || "Marketing";
  if (c.sent_at) return `${who} • Sent on ${formatLondonStamp(c.sent_at)}`;
  return `${who} • Created at ${formatLondonStamp(c.created_at)}`;
}

function derivedRate(
  part: number,
  whole: number
): string {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

export function campaignOpenRateLabel(c: EmailCampaign): string {
  if (c.adj_open_rate != null) return `${Math.round(c.adj_open_rate)}%`;
  if (!c.stats.recipients && !c.stats.delivered) {
    return c.status === "draft" ? "0%" : "—";
  }
  const whole = c.stats.delivered || c.stats.recipients;
  return derivedRate(c.stats.opened, whole);
}

export function campaignClickRateLabel(c: EmailCampaign): string {
  if (c.adj_click_rate != null) return `${Math.round(c.adj_click_rate)}%`;
  if (!c.stats.recipients && !c.stats.delivered) {
    return c.status === "draft" ? "0%" : "—";
  }
  const whole = c.stats.delivered || c.stats.recipients;
  return derivedRate(c.stats.clicked, whole);
}

/** "Created 22 days ago" / "Created 3 months ago" / "Created a year ago". */
export function formatCreatedAgo(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days < 1) return "Created today";
  if (days === 1) return "Created yesterday";
  if (days < 45) return `Created ${days} days ago`;
  const months = Math.round(days / 30.44);
  if (months < 12) {
    return `Created ${months} month${months === 1 ? "" : "s"} ago`;
  }
  const years = Math.round(days / 365.25);
  if (years <= 1) return "Created a year ago";
  return `Created ${years} years ago`;
}
