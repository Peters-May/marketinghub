import type { HubEnquiry, WebEnquiry } from "@/lib/types";
import {
  ENQUIRY_HISTORY_BASE_YEARS,
  HISTORICAL_MONTHLY_ENQUIRIES,
} from "@/lib/data/enquiry-history-monthly";

export type WebEnquiryStats = {
  thisWeek: number;
  thisMonth: number;
  total: number;
  needsReview: number;
  googleAds: number;
  topSources: { label: string; count: number }[];
  byOffice: { label: string; count: number }[];
  /** Google Ads enquiries grouped by campaign (from URL params) or referrer. */
  googleAdsByReferrer: { label: string; count: number }[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function tryParseUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

function collectParams(...urls: string[]): URLSearchParams {
  const merged = new URLSearchParams();
  for (const raw of urls) {
    const u = tryParseUrl(raw);
    if (!u) continue;
    u.searchParams.forEach((value, key) => {
      if (value && !merged.has(key)) merged.set(key, value);
    });
  }
  return merged;
}

export type EnquiryAttribution = {
  pageUrl: string;
  referrer: string;
  gclid: string;
  gbraid: string;
  wbraid: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  /** Google Ads auto-tag campaign id (hsa_cam). */
  hsaCam: string;
  hsaAd: string;
  hsaGrp: string;
  heardAbout: string;
  isGoogleAds: boolean;
  /** Chip / source label. */
  sourceLabel: string;
  /** Grouping for Ads breakdown — prefer campaign name. */
  adsGroupLabel: string;
};

/** Pull page, referrer, and Google Ads URL parameters from an enquiry. */
export function getEnquiryAttribution(
  e: WebEnquiry | HubEnquiry
): EnquiryAttribution {
  if ("channel" in e && e.channel === "whatsapp") {
    return {
      pageUrl: "",
      referrer: "",
      gclid: "",
      gbraid: "",
      wbraid: "",
      utmSource: "whatsapp",
      utmMedium: "messaging",
      utmCampaign: "",
      utmTerm: "",
      utmContent: "",
      hsaCam: "",
      hsaAd: "",
      hsaGrp: "",
      heardAbout: "WhatsApp",
      isGoogleAds: false,
      sourceLabel: "WhatsApp",
      adsGroupLabel: "",
    };
  }

  const raw = asRecord(e.raw_payload);
  const tracking = asRecord(raw.tracking);
  const make = asRecord(e.make_fields);
  const form = asRecord(raw.form_fields);

  const submissionId = asString(
    "submission_id" in e ? e.submission_id : ""
  );
  const isWebsiteChat =
    asString(raw.channel) === "website_chat" ||
    asString(raw.source) === "website_chat" ||
    asString(make.heard_about) === "Website chat" ||
    submissionId.startsWith("chat:");

  const pageUrl =
    asString(tracking.current_page_url) ||
    asString(form["Page Location"]) ||
    asString(form.page_location) ||
    asString(make.page_location) ||
    asString(raw.source_page) ||
    "";

  const referrer =
    asString(tracking.referrer) ||
    asString(form.Referrer) ||
    asString(form.referrer) ||
    asString(make.referrer) ||
    "";

  const params = collectParams(pageUrl, referrer);

  const gclid =
    asString(tracking.gclid) ||
    asString(make.gclid) ||
    asString(form.gclid) ||
    params.get("gclid") ||
    "";
  const gbraid = params.get("gbraid") || asString(tracking.gbraid) || "";
  const wbraid = params.get("wbraid") || asString(tracking.wbraid) || "";
  const fbclid =
    asString(tracking.fbclid) ||
    asString(make.fbclid) ||
    asString(form.fbclid) ||
    params.get("fbclid") ||
    "";

  const utmSource =
    asString(tracking.utm_source) ||
    asString(make.utm_source) ||
    asString(form.utm_source) ||
    params.get("utm_source") ||
    "";
  const utmMedium =
    asString(tracking.utm_medium) ||
    asString(make.utm_medium) ||
    asString(form.utm_medium) ||
    params.get("utm_medium") ||
    "";
  const utmCampaign =
    asString(tracking.utm_campaign) ||
    asString(make.utm_campaign) ||
    asString(form.utm_campaign) ||
    params.get("utm_campaign") ||
    "";
  const utmTerm =
    asString(tracking.utm_term) ||
    params.get("utm_term") ||
    "";
  const utmContent =
    asString(tracking.utm_content) ||
    params.get("utm_content") ||
    "";

  const hsaCam = params.get("hsa_cam") || "";
  const hsaAd = params.get("hsa_ad") || "";
  const hsaGrp = params.get("hsa_grp") || "";

  const heardAbout =
    asString(tracking.heard_about) ||
    asString(make.heard_about) ||
    asString(form["How did you hear about us?"]) ||
    "";

  const sourceLower = utmSource.toLowerCase();
  const mediumLower = utmMedium.toLowerCase();
  const refHost = tryParseUrl(referrer)?.hostname.toLowerCase() ?? "";
  const isMetaSource =
    /^(facebook|fb|meta|instagram|ig)$/i.test(utmSource) ||
    /facebook\.|instagram\.|meta\.com/i.test(refHost);
  const pageHasAdsParams = Boolean(
    gclid ||
      gbraid ||
      wbraid ||
      hsaCam ||
      /^(adwords|googleads|google)$/i.test(utmSource) ||
      (/cpc|ppc|paid/i.test(utmMedium) && /google|adwords/i.test(utmSource))
  );

  const isGoogleAds =
    pageHasAdsParams ||
    /google\s*ads?|paid\s*search|ppc/i.test(heardAbout) ||
    (refHost.includes("google.") &&
      (/cpc|ppc|paid/i.test(mediumLower) || Boolean(gclid || gbraid || wbraid))) ||
    (sourceLower === "adwords" || sourceLower === "googleads") ||
    (sourceLower === "google" && /cpc|ppc|paid/i.test(mediumLower));

  const isMetaAds =
    Boolean(fbclid) ||
    (isMetaSource && /cpc|ppc|paid|paidsocial|social/i.test(mediumLower)) ||
    /meta\s*ads?|facebook\s*ads?|instagram\s*ads?/i.test(heardAbout);

  const isOrganicSearch =
    /organic/i.test(mediumLower) ||
    ((!utmMedium || mediumLower === "organic") &&
      (refHost.includes("google.") ||
        refHost.includes("bing.") ||
        refHost.includes("yahoo.") ||
        /^(google|bing|yahoo)$/i.test(utmSource)) &&
      !isGoogleAds);

  const isReferral =
    /referral/i.test(mediumLower) ||
    (Boolean(refHost) &&
      !isGoogleAds &&
      !isMetaAds &&
      !isOrganicSearch &&
      !refHost.includes("petersandmay.") &&
      !utmSource);

  /** Friendly channel label — matches team enquiry email Marketing source. */
  let sourceLabel = "Unknown";
  if (isWebsiteChat) {
    sourceLabel = "Website chat";
  } else if (isGoogleAds) {
    sourceLabel = "Google Ads";
  } else if (isMetaAds) {
    sourceLabel = "Meta Ads";
  } else if (isOrganicSearch) {
    sourceLabel = "Organic search";
  } else if (isReferral) {
    sourceLabel = "Referral";
  } else if (utmSource) {
    if (isMetaSource) sourceLabel = "Meta";
    else sourceLabel = utmSource;
  } else if (heardAbout) {
    if (/google/i.test(heardAbout)) sourceLabel = "Google";
    else sourceLabel = heardAbout;
  } else if (refHost.includes("google.")) {
    sourceLabel = "Google";
  }

  const adsGroupLabel = isGoogleAds
    ? utmCampaign.trim() ||
      (hsaCam ? `Campaign ${hsaCam}` : "") ||
      "Google Ads (no campaign)"
    : "";

  return {
    pageUrl,
    referrer,
    gclid,
    gbraid,
    wbraid,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    hsaCam,
    hsaAd,
    hsaGrp,
    heardAbout,
    isGoogleAds,
    sourceLabel,
    adsGroupLabel,
  };
}

function enquiryReferrerKeyFromStrings(referrer: string, pageUrl: string): string {
  const raw = referrer || pageUrl;
  if (!raw) return "";
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.hostname}${path === "/" ? "" : path}`;
  } catch {
    return raw.slice(0, 160);
  }
}

/** Heard-about / UTM / gclid helpers for attribution stats. */
export function enquirySourceLabel(e: WebEnquiry | HubEnquiry): string {
  return getEnquiryAttribution(e).sourceLabel;
}

export function isGoogleAdsEnquiry(e: WebEnquiry | HubEnquiry): boolean {
  return getEnquiryAttribution(e).isGoogleAds;
}

/** Raw referrer URL from tracking / make / form fields. */
export function enquiryReferrerRaw(e: WebEnquiry | HubEnquiry): string {
  return getEnquiryAttribution(e).referrer;
}

/**
 * Grouping key for referrer links — strips hash/query noise where possible,
 * keeps host + path so Ad landing variants still group sensibly.
 */
export function enquiryReferrerKey(e: WebEnquiry | HubEnquiry): string {
  const a = getEnquiryAttribution(e);
  if (a.isGoogleAds && a.adsGroupLabel) return a.adsGroupLabel;
  const raw = a.referrer;
  if (!raw) return "No referrer";
  return enquiryReferrerKeyFromStrings(raw, a.pageUrl) || "No referrer";
}

/** Short label for chips / tables. */
export function enquiryReferrerLabel(key: string, max = 48): string {
  if (key === "No referrer") return key;
  if (key.length <= max) return key;
  return `${key.slice(0, max - 1)}…`;
}

export function enquiryDate(e: WebEnquiry): Date | null {
  const raw = e.created_at || e.received_at;
  if (!raw) return null;
  const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inclusive calendar-day filter (from/to as yyyy-MM-dd). */
export function enquiryInDateRange(
  e: WebEnquiry,
  from: string,
  to: string
): boolean {
  if (!from && !to) return true;
  const d = enquiryDate(e);
  if (!d) return false;
  if (from) {
    const start = new Date(`${from}T00:00:00`);
    if (d < start) return false;
  }
  if (to) {
    const end = new Date(`${to}T23:59:59.999`);
    if (d > end) return false;
  }
  return true;
}

/** Pure — safe to import from client components. */
export function computeEnquiryStats(
  items: WebEnquiry[],
  opts?: { includeTest?: boolean }
): WebEnquiryStats {
  const list = opts?.includeTest ? items : items.filter((e) => !e.is_test);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let thisWeek = 0;
  let thisMonth = 0;
  let needsReview = 0;
  let googleAds = 0;
  const sourceCounts = new Map<string, number>();
  const officeCounts = new Map<string, number>();
  const adsReferrerCounts = new Map<string, number>();

  for (const e of list) {
    const t = enquiryDate(e);
    if (t) {
      if (t >= weekAgo) thisWeek += 1;
      if (t >= monthStart) thisMonth += 1;
    }
    if (e.needs_manual_review) needsReview += 1;

    const attr = getEnquiryAttribution(e);
    if (attr.isGoogleAds) {
      googleAds += 1;
      const ref = attr.adsGroupLabel || enquiryReferrerKey(e);
      adsReferrerCounts.set(ref, (adsReferrerCounts.get(ref) ?? 0) + 1);
    }

    sourceCounts.set(attr.sourceLabel, (sourceCounts.get(attr.sourceLabel) ?? 0) + 1);

    const office = e.selected_office?.trim() || "Unassigned";
    officeCounts.set(office, (officeCounts.get(office) ?? 0) + 1);
  }

  const topSources = [...sourceCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const byOffice = [...officeCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const googleAdsByReferrer = [...adsReferrerCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);

  return {
    thisWeek,
    thisMonth,
    total: list.length,
    needsReview,
    googleAds,
    topSources,
    byOffice,
    googleAdsByReferrer,
  };
}

export const ENQUIRY_MONTH_LABELS = [
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
] as const;

export type EnquiryYearCompare = {
  years: number[];
  /** [monthIndex 0–11][yearIndex] count — null when no historical/live data */
  months: (number | null)[][];
  /** Latest year with any data — used for Δ / % vs prior year. */
  compareYear: number | null;
  priorYear: number | null;
  /** Months (0–11) that have data in compareYear (or all past months of current calendar year). */
  ytdMonthIndexes: number[];
  ytdTotals: Record<number, number>;
  ytdDelta: number | null;
  ytdPct: number | null;
};

function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return ((current - prior) / prior) * 100;
}

function emptyYear(): (number | null)[] {
  return Array.from({ length: 12 }, () => null);
}

/**
 * Month × year matrix for enquiries.
 * Always includes 2023–2025 historical monthly totals (from P&M chart),
 * merged with live hub rows (live wins where present).
 */
export function computeEnquiryYearCompare(
  items: WebEnquiry[],
  opts?: { includeTest?: boolean; now?: Date }
): EnquiryYearCompare {
  const list = opts?.includeTest ? items : items.filter((e) => !e.is_test);
  const now = opts?.now ?? new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  /** Start from historical chart series. */
  const counts = new Map<number, (number | null)[]>();
  for (const y of ENQUIRY_HISTORY_BASE_YEARS) {
    const hist = HISTORICAL_MONTHLY_ENQUIRIES[y];
    counts.set(
      y,
      hist ? hist.map((v) => (v == null ? null : v)) : emptyYear()
    );
  }

  /** Overlay live hub counts (replace month when we have live rows). */
  const live = new Map<number, number[]>();
  for (const e of list) {
    const d = enquiryDate(e);
    if (!d) continue;
    const y = d.getFullYear();
    const m = d.getMonth();
    if (!live.has(y)) live.set(y, Array.from({ length: 12 }, () => 0));
    live.get(y)![m] += 1;
  }

  for (const [y, monthsLive] of live) {
    const row = counts.get(y) ?? emptyYear();
    for (let m = 0; m < 12; m += 1) {
      if (monthsLive[m]! > 0) row[m] = monthsLive[m]!;
    }
    counts.set(y, row);
  }

  const years = [...counts.keys()].sort((a, b) => a - b);
  const months = Array.from({ length: 12 }, (_, month) =>
    years.map((y) => counts.get(y)?.[month] ?? null)
  );

  const compareYear =
    years.filter((y) => y <= currentYear).at(-1) ?? years.at(-1) ?? null;
  const priorYear =
    compareYear != null
      ? [...years].reverse().find((y) => y < compareYear) ?? null
      : null;

  /** YTD through current month for current year; else through last known month. */
  let ytdThrough = -1;
  if (compareYear != null) {
    if (compareYear === currentYear) {
      ytdThrough = currentMonth;
    } else {
      for (let m = 11; m >= 0; m -= 1) {
        if (counts.get(compareYear)?.[m] != null) {
          ytdThrough = m;
          break;
        }
      }
    }
  }

  const ytdMonthIndexes =
    ytdThrough >= 0 ? Array.from({ length: ytdThrough + 1 }, (_, i) => i) : [];

  const ytdTotals: Record<number, number> = {};
  for (const y of years) {
    ytdTotals[y] = ytdMonthIndexes.reduce((sum, m) => {
      const v = counts.get(y)?.[m];
      return sum + (typeof v === "number" ? v : 0);
    }, 0);
  }

  let ytdDelta: number | null = null;
  let ytdPct: number | null = null;
  if (compareYear != null && priorYear != null && ytdMonthIndexes.length > 0) {
    const cur = ytdTotals[compareYear] ?? 0;
    const prev = ytdTotals[priorYear] ?? 0;
    ytdDelta = cur - prev;
    ytdPct = pctChange(cur, prev);
  }

  return {
    years,
    months,
    compareYear,
    priorYear,
    ytdMonthIndexes,
    ytdTotals,
    ytdDelta,
    ytdPct,
  };
}

export function formatEnquiryDelta(delta: number | null): string {
  if (delta == null) return "—";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function formatEnquiryPct(pct: number | null): string {
  if (pct == null) return "—";
  const rounded = Math.round(pct * 100) / 100;
  const body = `${Math.abs(rounded).toFixed(2)}%`;
  if (rounded > 0) return `+${body}`;
  if (rounded < 0) return `-${body}`;
  return body;
}
