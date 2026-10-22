import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import { linkEventContent, unlinkEventContent } from "@/lib/data/repos";

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const body = await request.json();
    if (body.action === "unlink") {
      if (!body.id) return jsonError("Missing link", 400);
      await unlinkEventContent(String(body.id));
      return jsonOk({ ok: true });
    }
    const eventId = String(body.event_id ?? "").trim();
    const contentId = String(body.content_id ?? "").trim();
    if (!eventId || !contentId) return jsonError("Choose an event and a piece", 400);
    const link = await linkEventContent(eventId, contentId);
    return jsonOk({ link }, { status: 201 });
  } catch (err) {
    console.error("[api/events/content] POST failed", err);
    return jsonError("Could not update the link", 500);
  }
}
