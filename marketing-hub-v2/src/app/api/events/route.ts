import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { readAttendanceOpsFields } from "@/lib/events/attendance-checklist";
import { canDeleteEvent } from "@/lib/events/access";
import { plannerFieldsFromBody } from "@/lib/events/planner";
import {
  createEvent,
  deleteEvent,
  listAllAttendance,
  listEvents,
  updateEvent,
} from "@/lib/data/repos";
import type { EventItem } from "@/lib/types";

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

  const { user, error } = await requireStaff();
  if (error || !user) return error;

  if (action === "delete") {
    const id = typeof body.id === "string" ? body.id : "";
    const event = (await listEvents()).find((item) => item.id === id);
    if (!event) return jsonError("Event not found", 404);
    if (!canDeleteEvent(event, user)) {
      return jsonError("You can only delete events you created", 403);
    }
    await deleteEvent(id);
    return jsonOk({ ok: true });
  }

  if (action === "update") {
    const patch: Partial<EventItem> = { ...(body.patch ?? {}) };
    if (user.role !== "admin") {
      delete patch.created_by;
    }
    const updated = await updateEvent(body.id, patch);
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
    ...readAttendanceOpsFields(body),
    ...plannerFieldsFromBody(body),
    created_by: user.id,
  });
  return jsonOk({ event }, { status: 201 });
}
