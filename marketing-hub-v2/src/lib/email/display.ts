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
  const who = campaignUpdatedBy(c);
  if (c.sent_at) return `${who} • Sent on ${formatLondonStamp(c.sent_at)}`;
  return `${who} • Created at ${formatLondonStamp(c.created_at)}`;
}

/** "Sophie Edgerley" from Sophie.Edgerley@petersandmay.com. */
export function campaignUpdatedBy(c: EmailCampaign): string {
  const raw = c.created_by?.trim();
  if (!raw) return "—";
  const local = raw.includes("@") ? (raw.split("@")[0] ?? raw) : raw;
  if (!local) return "—";
  if (/[._]/.test(local)) {
    return local
      .split(/[._]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }
  return local;
}

/** Interpret a London wall clock as an ISO instant. */
export function londonDateTimeToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asLondon = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute")
  );
  return new Date(guess.getTime() - (asLondon - guess.getTime())).toISOString();
}

/** Two-line stamp: 9 October 2026 / 09:08, Europe/London. */
export function formatLondonUpdated(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("day")} ${get("month")} ${get("year")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}%`;
}

export function campaignOpenRateLabel(c: EmailCampaign): string {
  if (c.adj_open_rate != null) return formatPercent(c.adj_open_rate);
  const whole = c.stats.delivered || c.stats.recipients;
  if (!whole) return "0%";
  return formatPercent((c.stats.opened / whole) * 100);
}

export function campaignClickRateLabel(c: EmailCampaign): string {
  if (c.adj_click_rate != null) return formatPercent(c.adj_click_rate);
  const whole = c.stats.delivered || c.stats.recipients;
  if (!whole) return "0%";
  return formatPercent((c.stats.clicked / whole) * 100);
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
