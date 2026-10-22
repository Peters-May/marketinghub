import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { presentBooking } from "@/lib/events/bookings";
import {
  addEventBooking,
  addEventOffice,
  listEventBookings,
  listEventOffices,
  listProfileOffices,
  removeEventBooking,
  removeEventOffice,
  setProfileOffice,
  updateAttendanceTravel,
} from "@/lib/events/planning-data";
import { listAttendanceForEvent } from "@/lib/data/repos";
import type { EventBookingKind } from "@/lib/types";

const KINDS = new Set<EventBookingKind>(["hotel", "flight", "other"]);

export async function GET(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;
  const eventId = request.nextUrl.searchParams.get("eventId")?.trim() ?? "";
  if (!eventId) return jsonError("eventId is required");
  const viewer = { id: user.id, isAdmin: user.role === "admin" };
  const [offices, bookings, attendance, officesForPeople] = await Promise.all([
    listEventOffices(eventId),
    listEventBookings(eventId),
    listAttendanceForEvent(eventId),
    listProfileOffices(),
  ]);
  return jsonOk({
    offices,
    bookings: bookings.map((booking) => presentBooking(booking, viewer)),
    attendance,
    profileOffice:
      officesForPeople.find((row) => row.user_id === user.id)?.office ?? "",
  });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Invalid request", 400);
  const action = String(body.action ?? "");
  const isAdmin = user.role === "admin";

  if (action === "add_office" || action === "remove_office") {
    if (!isAdmin) return jsonError("Only an admin can change offices", 403);
    if (action === "remove_office") {
      await removeEventOffice(String(body.id ?? ""));
      return jsonOk({ ok: true });
    }
    const row = await addEventOffice(
      String(body.event_id ?? ""),
      String(body.office ?? ""),
      String(body.notes ?? "")
    );
    if (!row) return jsonError("Enter an office", 400);
    return jsonOk({ office: row });
  }

  if (action === "add_booking") {
    const attendeeId = String(body.attendee_user_id ?? "").trim() || null;
    if (!isAdmin && attendeeId !== user.id) {
      return jsonError("You can add a booking for yourself", 403);
    }
    const kind = String(body.kind ?? "other");
    if (!KINDS.has(kind as EventBookingKind)) return jsonError("Unknown booking type", 400);
    if (!String(body.label ?? "").trim()) {
      return jsonError("Enter a hotel, flight, or booking name", 400);
    }
    const row = await addEventBooking({
      event_id: String(body.event_id ?? ""),
      kind: kind as EventBookingKind,
      attendee_user_id: attendeeId,
      attendee_name: String(body.attendee_name ?? user.full_name ?? ""),
      label: String(body.label ?? ""),
      reference: String(body.reference ?? ""),
      starts_on: String(body.starts_on ?? ""),
      ends_on: String(body.ends_on ?? ""),
      cost_estimate: String(body.cost_estimate ?? ""),
      url: String(body.url ?? ""),
      notes: String(body.notes ?? ""),
    });
    if (!row) return jsonError("Enter a hotel, flight, or booking name", 400);
    return jsonOk({
      booking: presentBooking(row, { id: user.id, isAdmin }),
    });
  }

  if (action === "remove_booking") {
    if (!isAdmin) return jsonError("Only an admin can remove a booking", 403);
    await removeEventBooking(String(body.id ?? ""));
    return jsonOk({ ok: true });
  }

  if (action === "travel") {
    const userId = String(body.user_id ?? user.id);
    if (!isAdmin && userId !== user.id) {
      return jsonError("You can update your own travel", 403);
    }
    const row = await updateAttendanceTravel({
      event_id: String(body.event_id ?? ""),
      user_id: userId,
      office: String(body.office ?? ""),
      role: String(body.role ?? ""),
      arrival_on: String(body.arrival_on ?? "") || null,
      departure_on: String(body.departure_on ?? "") || null,
    });
    if (!row) return jsonError("RSVP first, then add travel", 400);
    return jsonOk({ attendance: row });
  }

  if (action === "profile_office") {
    const row = await setProfileOffice(user.id, String(body.office ?? ""));
    return jsonOk({ profileOffice: row?.office ?? "" });
  }

  return jsonError("Unknown action", 400);
}
