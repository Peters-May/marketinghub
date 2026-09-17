import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createPrCoverage,
  deletePrCoverage,
  listPrCoverage,
  updatePrCoverage,
} from "@/lib/data/repos";
import type { PrCoverage } from "@/lib/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return jsonOk({ coverage: await listPrCoverage() });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "delete") {
    await deletePrCoverage(body.id);
    return jsonOk({ ok: true });
  }

  if (action === "update") {
    const updated = await updatePrCoverage(
      body.id,
      (body.patch ?? {}) as Partial<PrCoverage>
    );
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  const item = await createPrCoverage({
    title: String(body.title ?? "Untitled clip").trim() || "Untitled clip",
    url: String(body.url ?? ""),
    outlet: String(body.outlet ?? ""),
    published_at: body.published_at || null,
    sentiment: body.sentiment || "",
    notes: String(body.notes ?? ""),
    pitch_id: body.pitch_id || null,
    content_id: body.content_id || null,
    event_id: body.event_id || null,
    monitor_mention_id: body.monitor_mention_id || null,
  });
  return jsonOk({ item }, { status: 201 });
}
