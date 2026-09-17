import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createPrPitch,
  deletePrPitch,
  listPrPitches,
  updatePrPitch,
} from "@/lib/data/repos";
import type { PrPitch } from "@/lib/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return jsonOk({ pitches: await listPrPitches() });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "delete") {
    await deletePrPitch(body.id);
    return jsonOk({ ok: true });
  }

  if (action === "update") {
    const updated = await updatePrPitch(
      body.id,
      (body.patch ?? {}) as Partial<PrPitch>
    );
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "mark_exported") {
    const updated = await updatePrPitch(body.id, {
      status: "exported",
      exported_at: new Date().toISOString(),
    });
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  const recipientIds = Array.isArray(body.recipient_ids)
    ? body.recipient_ids.map(String)
    : [];

  const item = await createPrPitch({
    title: String(body.title ?? "Untitled pitch").trim() || "Untitled pitch",
    subject: String(body.subject ?? ""),
    body: String(body.body ?? ""),
    status: "draft",
    media_list_id: body.media_list_id || null,
    recipient_ids: recipientIds,
    content_id: body.content_id || null,
    event_id: body.event_id || null,
    exported_at: null,
    notes: String(body.notes ?? ""),
    created_by: user?.full_name || user?.email || "Staff",
  });
  return jsonOk({ item }, { status: 201 });
}
