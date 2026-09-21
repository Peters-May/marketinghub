import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createPrPitch,
  deletePrPitch,
  listPrPitches,
  updatePrPitch,
} from "@/lib/data/repos";
import type { EmailChannel, PrPitch, PrPitchStatus } from "@/lib/types";

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

  if (action === "mark_sent_external") {
    const updated = await updatePrPitch(body.id, {
      status: "sent_external",
      exported_at: new Date().toISOString(),
      hubspot_url: body.hubspot_url
        ? String(body.hubspot_url)
        : undefined,
    });
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "follow_up") {
    const pitches = await listPrPitches();
    const parent = pitches.find((p) => p.id === body.id);
    if (!parent) return jsonError("Not found", 404);
    const rest = Object.fromEntries(
      Object.entries(parent).filter(
        ([key]) => key !== "id" && key !== "created_at" && key !== "updated_at"
      )
    ) as Omit<PrPitch, "id" | "created_at" | "updated_at">;
    const item = await createPrPitch({
      ...rest,
      title: `Follow-up: ${parent.title}`,
      subject: parent.subject.startsWith("Re:")
        ? parent.subject
        : `Re: ${parent.subject}`,
      status: "draft",
      exported_at: null,
      parent_draft_id: parent.id,
      created_by: user?.full_name || user?.email || "Staff",
    });
    return jsonOk({ item }, { status: 201 });
  }

  const recipientIds = Array.isArray(body.recipient_ids)
    ? body.recipient_ids.map(String)
    : [];
  const listIds = Array.isArray(body.list_ids)
    ? body.list_ids.map(String)
    : body.media_list_id
      ? [String(body.media_list_id)]
      : [];
  const channel: EmailChannel =
    body.channel === "marketing" ? "marketing" : "pr";

  const item = await createPrPitch({
    title: String(body.title ?? "Untitled email").trim() || "Untitled email",
    subject: String(body.subject ?? ""),
    body: String(body.body ?? ""),
    status: "draft" as PrPitchStatus,
    channel,
    preview_text: String(body.preview_text ?? ""),
    from_name: String(body.from_name ?? "Peters & May Marketing"),
    from_email: String(body.from_email ?? "marketing@petersandmay.com"),
    campaign_tag: String(body.campaign_tag ?? ""),
    theme_id: body.theme_id || null,
    media_list_id: listIds[0] || null,
    list_ids: listIds,
    recipient_ids: recipientIds,
    content_id: body.content_id || null,
    event_id: body.event_id || null,
    exported_at: null,
    hubspot_url: String(body.hubspot_url ?? ""),
    parent_draft_id: body.parent_draft_id || null,
    notes: String(body.notes ?? ""),
    created_by: user?.full_name || user?.email || "Staff",
  });
  return jsonOk({ item }, { status: 201 });
}
