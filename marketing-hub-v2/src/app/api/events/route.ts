import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin, requireStaff } from "@/lib/api";
import { plannerFieldsFromBody } from "@/lib/events/planner";
import {
  createEvent,
  deleteEvent,
  listAllAttendance,
  listEvents,
  updateEvent,
} from "@/lib/data/repos";

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;
  const [events, attendance] = await Promise.all([
    listEvents(),
    listAllAttendance(),
  ]);
  return jsonOk({ events, attendance });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "delete") {
    const { error } = await requireAdmin();
    if (error) return error;
    await deleteEvent(body.id);
    return jsonOk({ ok: true });
  }

  const { user, error } = await requireStaff();
  if (error || !user) return error;

  if (action === "update") {
    const updated = await updateEvent(body.id, body.patch ?? {});
    if (!updated) return jsonError("Event not found", 404);
    return jsonOk({ event: updated });
  }

  const event = await createEvent({
    title: body.title ?? "Untitled event",
    starts_at: body.starts_at || null,
    ends_at: body.ends_at ?? null,
    location: body.location ?? "",
    event_type: body.event_type ?? "Event",
    division: body.division ?? "",
    notes: body.notes ?? "",
    link_url: body.link_url ?? "",
    social_media_post_completed: Boolean(body.social_media_post_completed),
    personal_social_media_graphics_completed: Boolean(
      body.personal_social_media_graphics_completed
    ),
    reached_out_for_pr_to_organisers: Boolean(
      body.reached_out_for_pr_to_organisers
    ),
    ...plannerFieldsFromBody(body),
    created_by: user.id,
  });
  return jsonOk({ event }, { status: 201 });
}
