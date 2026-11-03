import type { PrCoverageChannel } from "@/lib/types";

const CHANNELS: PrCoverageChannel[] = [
  "online",
  "social",
  "linkedin",
  "offline",
];

export function isPrCoverageChannel(value: unknown): value is PrCoverageChannel {
  return (
    value === "" ||
    value === "online" ||
    value === "social" ||
    value === "linkedin" ||
    value === "offline"
  );
}

export function normalizePrCoverageChannel(
  value: unknown
): PrCoverageChannel {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (isPrCoverageChannel(raw)) return raw;
  return "";
}

/** Infer channel from article URL when the clip has none set. */
export function inferCoverageChannel(url: string): PrCoverageChannel {
  const raw = url.trim().toLowerCase();
  if (!raw) return "online";
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    if (
      host === "linkedin.com" ||
      host.endsWith(".linkedin.com") ||
      host === "lnkd.in"
    ) {
      return "linkedin";
    }
    if (
      host === "twitter.com" ||
      host === "x.com" ||
      host.endsWith(".twitter.com") ||
      host === "facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "instagram.com" ||
      host.endsWith(".instagram.com") ||
      host === "tiktok.com" ||
      host.endsWith(".tiktok.com") ||
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be"
    ) {
      return "social";
    }
  } catch {
    // fall through
  }
  return "online";
}

export function resolveCoverageChannel(
  channel: PrCoverageChannel | string | undefined,
  url: string
): Exclude<PrCoverageChannel, ""> {
  const normalized = normalizePrCoverageChannel(channel);
  if (normalized) return normalized;
  const inferred = inferCoverageChannel(url);
  return inferred || "online";
}

export function coverageChannelLabel(
  channel: PrCoverageChannel | string
): string {
  switch (normalizePrCoverageChannel(channel) || channel) {
    case "linkedin":
      return "LinkedIn";
    case "social":
      return "Social";
    case "offline":
      return "Offline";
    case "online":
    default:
      return "Coverage";
  }
}

/** Section order on public coverage books. */
export const COVERAGE_CHANNEL_ORDER: Exclude<PrCoverageChannel, "">[] = [
  "online",
  "linkedin",
  "social",
  "offline",
];

export function parseOptionalMetric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseDomainAuthority(value: unknown): number | null {
  const n = parseOptionalMetric(value);
  if (n === null) return null;
  if (n > 100) return 100;
  return Math.round(n);
}

export { CHANNELS as PR_COVERAGE_CHANNELS };
