/** Fields we keep from a Resend email webhook. IP addresses are ignored. */
export type ResendEventDetail = {
  campaignId: string | null;
  link: string;
  userAgent: string;
  occurredAt: string;
};

export function readResendEventDetail(
  data: Record<string, unknown>
): ResendEventDetail {
  return {
    campaignId: extractCampaignId(data),
    link: extractClickLink(data),
    userAgent: extractUserAgent(data),
    occurredAt: extractOccurredAt(data),
  };
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
  return "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
