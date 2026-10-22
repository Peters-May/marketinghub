import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  addAttendanceRequestLine,
  listAttendanceRequests,
  saveAttendanceRequest,
  updateAttendanceRequestLine,
} from "@/lib/events/planning-data";
import type {
  AttendanceRequestLineStatus,
  AttendanceRequestStatus,
} from "@/lib/types";

const REQUEST_STATUS = new Set<AttendanceRequestStatus>(["draft", "open", "closed"]);
const LINE_STATUS = new Set<AttendanceRequestLineStatus>([
  "requested",
  "approved",
  "declined",
]);

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;
  return jsonOk(await listAttendanceRequests());
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Invalid request", 400);
  const action = String(body.action ?? "");
  const isAdmin = user.role === "admin";

  if (action === "save_request") {
    if (!isAdmin) return jsonError("Only an admin can open an attendance request", 403);
    const status = String(body.status ?? "open");
    if (!REQUEST_STATUS.has(status as AttendanceRequestStatus)) {
      return jsonError("Unknown status", 400);
    }
    const year = Number(body.year);
    if (!Number.isFinite(year)) return jsonError("Enter a year", 400);
    const row = await saveAttendanceRequest({
      id: body.id ? String(body.id) : undefined,
      year,
      title: String(body.title ?? ""),
      office: String(body.office ?? ""),
      status: status as AttendanceRequestStatus,
      notes: String(body.notes ?? ""),
    });
    if (!row?.title) return jsonError("Enter a title", 400);
    return jsonOk({ request: row });
  }

  if (action === "add_line") {
    const personId = String(body.user_id ?? "").trim() || null;
    if (!isAdmin && personId !== user.id) {
      return jsonError("Add yourself to the request", 403);
    }
    const status = String(body.status ?? "requested");
    if (!LINE_STATUS.has(status as AttendanceRequestLineStatus)) {
      return jsonError("Unknown status", 400);
    }
    const row = await addAttendanceRequestLine({
      request_id: String(body.request_id ?? ""),
      event_id: String(body.event_id ?? "").trim() || null,
      event_title: String(body.event_title ?? ""),
      user_id: personId,
      person_name: String(body.person_name ?? user.full_name ?? ""),
      office: String(body.office ?? ""),
      role: String(body.role ?? ""),
      status: isAdmin ? (status as AttendanceRequestLineStatus) : "requested",
      notes: String(body.notes ?? ""),
    });
    if (!row?.event_title) return jsonError("Name the event", 400);
    return jsonOk({ line: row });
  }

  if (action === "set_line_status") {
    if (!isAdmin) return jsonError("Only an admin can approve a line", 403);
    const status = String(body.status ?? "");
    if (!LINE_STATUS.has(status as AttendanceRequestLineStatus)) {
      return jsonError("Unknown status", 400);
    }
    await updateAttendanceRequestLine(String(body.id ?? ""), status as AttendanceRequestLineStatus);
    return jsonOk({ ok: true });
  }

  return jsonError("Unknown action", 400);
}
