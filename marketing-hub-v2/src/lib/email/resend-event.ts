/** Permanent failure, or a temporary one we may retry. */
export type BounceClass = "hard" | "soft";

/** Fields we keep from a Resend email webhook. IP addresses are ignored. */
export type ResendEventDetail = {
  campaignId: string | null;
  link: string;
  userAgent: string;
  occurredAt: string;
  /** Set only when the payload includes a bounce classification. */
  bounceClass: BounceClass | null;
};

export function readResendEventDetail(
  data: Record<string, unknown>
): ResendEventDetail {
  return {
    campaignId: extractCampaignId(data),
    link: extractClickLink(data),
    userAgent: extractUserAgent(data),
    occurredAt: extractOccurredAt(data),
    bounceClass: extractBounceClass(data),
  };
}

/**
 * Resend uses `Permanent` for a dead address and `Transient` or
 * `Undetermined` when delivery might succeed later.
 */
export function extractBounceClass(data: Record<string, unknown>): BounceClass | null {
  const bounce = data.bounce;
  if (!bounce || typeof bounce !== "object") return null;
  const type = stringValue((bounce as { type?: unknown }).type).toLowerCase();
  if (!type) return null;
  if (type === "permanent" || type === "hard") return "hard";
  return "soft";
}

/** Send uses `[{ name, value }]`. Webhooks return `tags` as an object. */
export function extractCampaignId(data: Record<string, unknown>): string | null {
  const tags = data.tags;
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (!tag || typeof tag !== "object") continue;
      const row = tag as { name?: unknown; value?: unknown };
      if (String(row.name ?? "") !== "campaign_id") continue;
      const value = stringValue(row.value);
      if (value) return value;
    }
  } else if (tags && typeof tags === "object") {
    const value = stringValue((tags as Record<string, unknown>).campaign_id);
    if (value) return value;
  }
  return stringValue(data.campaign_id) || null;
}

export function extractClickLink(data: Record<string, unknown>): string {
  const click = data.click;
  if (!click || typeof click !== "object") return "";
  return stringValue((click as { link?: unknown }).link);
}

export function extractUserAgent(data: Record<string, unknown>): string {
  for (const key of ["open", "click"] as const) {
    const block = data[key];
    if (!block || typeof block !== "object") continue;
    const agent = stringValue((block as { userAgent?: unknown }).userAgent);
    if (agent) return agent;
  }
  return "";
}

export function extractOccurredAt(data: Record<string, unknown>): string {
  for (const key of ["open", "click"] as const) {
    const block = data[key];
    if (!block || typeof block !== "object") continue;
    const stamp = stringValue((block as { timestamp?: unknown }).timestamp);
    if (stamp && !Number.isNaN(new Date(stamp).getTime())) {
      return new Date(stamp).toISOString();
    }
  }
  const created = stringValue(data.created_at);
  if (created && !Number.isNaN(new Date(created).getTime())) {
    return new Date(created).toISOString();
  }
  return "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
