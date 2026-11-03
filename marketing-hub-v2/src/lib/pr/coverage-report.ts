import {
  coverageChannelLabel,
  COVERAGE_CHANNEL_ORDER,
  normalizePrCoverageChannel,
  parseDomainAuthority,
  parseOptionalMetric,
  resolveCoverageChannel,
} from "@/lib/pr/coverage-channel";
import { generateShareToken, isShareToken } from "@/lib/social/post-share";
import type {
  PrCoverage,
  PrCoverageChannel,
  PrCoverageReport,
  PrCoverageReportItem,
  PrCoverageReportStatus,
} from "@/lib/types";

export function coverageReportSharePath(token: string): string {
  const trimmed = token.trim();
  if (!isShareToken(trimmed)) return "";
  return `/share/coverage/${encodeURIComponent(trimmed)}`;
}

/** Drop share fields so a normal save cannot publish or rewrite the link. */
export function omitCoverageReportSharePatch(
  patch: object
): Record<string, unknown> {
  const next = { ...(patch as Record<string, unknown>) };
  delete next.share_token;
  delete next.share_enabled;
  return next;
}

export function normalizePrCoverageReportStatus(
  value: unknown
): PrCoverageReportStatus {
  return value === "published" ? "published" : "draft";
}

export function snapshotCoverageItem(
  coverage: PrCoverage,
  sortOrder: number
): PrCoverageReportItem {
  const channel = resolveCoverageChannel(coverage.channel, coverage.url);
  return {
    coverage_id: coverage.id,
    title: coverage.title,
    url: coverage.url,
    outlet: coverage.outlet,
    published_at: coverage.published_at,
    channel,
    screenshot_url: String(coverage.screenshot_url ?? "").trim(),
    audience: parseOptionalMetric(coverage.audience),
    estimated_views: parseOptionalMetric(coverage.estimated_views),
    domain_authority: parseDomainAuthority(coverage.domain_authority),
    notes: String(coverage.notes ?? ""),
    sort_order: sortOrder,
  };
}

export function normalizePrCoverageReportItem(
  item: Partial<PrCoverageReportItem> & { coverage_id?: string },
  index = 0
): PrCoverageReportItem {
  const url = String(item.url ?? "");
  const channel = resolveCoverageChannel(
    normalizePrCoverageChannel(item.channel),
    url
  );
  return {
    coverage_id: String(item.coverage_id ?? ""),
    title: String(item.title ?? "").trim() || "Untitled clip",
    url,
    outlet: String(item.outlet ?? "").trim(),
    published_at: item.published_at || null,
    channel,
    screenshot_url: String(item.screenshot_url ?? "").trim(),
    audience: parseOptionalMetric(item.audience),
    estimated_views: parseOptionalMetric(item.estimated_views),
    domain_authority: parseDomainAuthority(item.domain_authority),
    notes: String(item.notes ?? ""),
    sort_order:
      typeof item.sort_order === "number" && Number.isFinite(item.sort_order)
        ? item.sort_order
        : index,
  };
}

export function normalizePrCoverageReport(
  report: Partial<PrCoverageReport> & { id: string }
): PrCoverageReport {
  const items = Array.isArray(report.items)
    ? report.items.map((item, i) => normalizePrCoverageReportItem(item, i))
    : [];
  items.sort((a, b) => a.sort_order - b.sort_order);
  return {
    id: report.id,
    title: String(report.title ?? "").trim() || "Untitled coverage report",
    summary: String(report.summary ?? ""),
    status: normalizePrCoverageReportStatus(report.status),
    items,
    share_token: String(report.share_token ?? "").trim(),
    share_enabled: report.share_enabled === true,
    created_at: report.created_at ?? new Date().toISOString(),
    updated_at: report.updated_at ?? new Date().toISOString(),
  };
}

export function ensureCoverageReportShareToken(
  prevToken: string | undefined
): string {
  return isShareToken(prevToken ?? "")
    ? (prevToken as string)
    : generateShareToken();
}

export type CoverageReportSummaryMetrics = {
  pieces: number;
  estimatedViews: number | null;
  audience: number | null;
  avgDomainAuthority: number | null;
};

export function summarizeCoverageReportItems(
  items: PrCoverageReportItem[]
): CoverageReportSummaryMetrics {
  const pieces = items.length;
  let viewsSum = 0;
  let viewsCount = 0;
  let audienceSum = 0;
  let audienceCount = 0;
  let daSum = 0;
  let daCount = 0;
  for (const item of items) {
    if (item.estimated_views != null) {
      viewsSum += item.estimated_views;
      viewsCount += 1;
    }
    if (item.audience != null) {
      audienceSum += item.audience;
      audienceCount += 1;
    }
    if (item.domain_authority != null) {
      daSum += item.domain_authority;
      daCount += 1;
    }
  }
  return {
    pieces,
    estimatedViews: viewsCount ? viewsSum : null,
    audience: audienceCount ? audienceSum : null,
    avgDomainAuthority: daCount ? Math.round(daSum / daCount) : null,
  };
}

export function groupCoverageReportItemsByChannel(
  items: PrCoverageReportItem[]
): { channel: Exclude<PrCoverageChannel, "">; label: string; items: PrCoverageReportItem[] }[] {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const buckets = new Map<
    Exclude<PrCoverageChannel, "">,
    PrCoverageReportItem[]
  >();
  for (const item of sorted) {
    const channel = resolveCoverageChannel(item.channel, item.url);
    const list = buckets.get(channel) ?? [];
    list.push(item);
    buckets.set(channel, list);
  }
  return COVERAGE_CHANNEL_ORDER.filter((channel) => buckets.has(channel)).map(
    (channel) => ({
      channel,
      label: coverageChannelLabel(channel),
      items: buckets.get(channel) ?? [],
    })
  );
}

export function formatCoverageMetric(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m >= 10 ? Math.round(m) : Number(m.toFixed(1))}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `${k >= 10 ? Math.round(k) : Number(k.toFixed(1))}K`;
  }
  return String(Math.round(value));
}
