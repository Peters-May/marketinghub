import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createPrCoverage,
  deletePrCoverage,
  listPrCoverage,
  updatePrCoverage,
} from "@/lib/data/repos";
import {
  normalizePrCoverageChannel,
  parseDomainAuthority,
  parseOptionalMetric,
} from "@/lib/pr/coverage-channel";
import type { PrCoverage, PrCoverageSentiment } from "@/lib/types";

function asSentiment(value: unknown): PrCoverageSentiment {
  return value === "positive" || value === "neutral" || value === "negative"
    ? value
    : "";
}

function coverageFieldsFromBody(
  body: Record<string, unknown>
): Omit<PrCoverage, "id" | "created_at" | "updated_at"> {
  return {
    title: String(body.title ?? "Untitled clip").trim() || "Untitled clip",
    url: String(body.url ?? ""),
    outlet: String(body.outlet ?? ""),
    published_at: (body.published_at as string | null) || null,
    sentiment: asSentiment(body.sentiment),
    notes: String(body.notes ?? ""),
    channel: normalizePrCoverageChannel(body.channel),
    screenshot_url: String(body.screenshot_url ?? "").trim(),
    audience: parseOptionalMetric(body.audience),
    estimated_views: parseOptionalMetric(body.estimated_views),
    domain_authority: parseDomainAuthority(body.domain_authority),
    pitch_id: (body.pitch_id as string | null) || null,
    content_id: (body.content_id as string | null) || null,
    event_id: (body.event_id as string | null) || null,
    monitor_mention_id: (body.monitor_mention_id as string | null) || null,
  };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return jsonOk({ coverage: await listPrCoverage() });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action as string | undefined;

  if (action === "delete") {
    await deletePrCoverage(String(body.id ?? ""));
    return jsonOk({ ok: true });
  }

  if (action === "update") {
    const patch = (body.patch ?? {}) as Partial<PrCoverage>;
    const normalized: Partial<PrCoverage> = { ...patch };
    if (patch.channel !== undefined) {
      normalized.channel = normalizePrCoverageChannel(patch.channel);
    }
    if (patch.screenshot_url !== undefined) {
      normalized.screenshot_url = String(patch.screenshot_url ?? "").trim();
    }
    if (patch.audience !== undefined) {
      normalized.audience = parseOptionalMetric(patch.audience);
    }
    if (patch.estimated_views !== undefined) {
      normalized.estimated_views = parseOptionalMetric(patch.estimated_views);
    }
    if (patch.domain_authority !== undefined) {
      normalized.domain_authority = parseDomainAuthority(patch.domain_authority);
    }
    const updated = await updatePrCoverage(String(body.id ?? ""), normalized);
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  const item = await createPrCoverage(coverageFieldsFromBody(body));
  return jsonOk({ item }, { status: 201 });
}
