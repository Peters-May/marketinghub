import { readStore, updateStore } from "@/lib/store/local";
import { uid } from "@/lib/utils";
import type {
  AttendanceRequestLineStatus,
  AttendanceRequestStatus,
  EventAttendance,
  EventAttendanceRequest,
  EventAttendanceRequestLine,
  EventBooking,
  EventBookingKind,
  EventOffice,
  ProfileOffice,
} from "@/lib/types";

function nowIso() {
  return new Date().toISOString();
}

export async function listEventOffices(eventId: string) {
  const store = await readStore();
  return (store.event_offices ?? []).filter((row) => row.event_id === eventId);
}

export async function addEventOffice(
  eventId: string,
  office: string,
  notes = ""
): Promise<EventOffice | null> {
  const label = office.trim();
  if (!label) return null;
  let row: EventOffice | null = null;
  await updateStore((store) => {
    if (!store.event_offices) store.event_offices = [];
    const existing = store.event_offices.find(
      (item) =>
        item.event_id === eventId &&
        item.office.toLowerCase() === label.toLowerCase()
    );
    if (existing) {
      row = existing;
      return;
    }
    row = {
      id: uid("eof"),
      event_id: eventId,
      office: label,
      notes: notes.trim(),
      created_at: nowIso(),
    };
    store.event_offices.push(row);
  });
  return row;
}

export async function removeEventOffice(id: string) {
  await updateStore((store) => {
    store.event_offices = (store.event_offices ?? []).filter((row) => row.id !== id);
  });
}

export async function listEventBookings(eventId: string) {
  const store = await readStore();
  return (store.event_bookings ?? []).filter((row) => row.event_id === eventId);
}

export async function addEventBooking(input: {
  event_id: string;
  kind: EventBookingKind;
  attendee_user_id: string | null;
  attendee_name: string;
  label: string;
  reference: string;
  starts_on: string;
  ends_on: string;
  cost_estimate: string;
  url: string;
  notes: string;
}): Promise<EventBooking | null> {
  let row: EventBooking | null = null;
  await updateStore((store) => {
    if (!store.event_bookings) store.event_bookings = [];
    row = {
      id: uid("ebk"),
      event_id: input.event_id,
      kind: input.kind,
      attendee_user_id: input.attendee_user_id,
      attendee_name: input.attendee_name.trim(),
      label: input.label.trim(),
      reference: input.reference.trim(),
      starts_on: input.starts_on.trim(),
      ends_on: input.ends_on.trim(),
      cost_estimate: input.cost_estimate.trim(),
      url: input.url.trim(),
      notes: input.notes.trim(),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    store.event_bookings.push(row);
  });
  return row;
}

export async function removeEventBooking(id: string) {
  await updateStore((store) => {
    store.event_bookings = (store.event_bookings ?? []).filter((row) => row.id !== id);
  });
}

export async function updateAttendanceTravel(input: {
  event_id: string;
  user_id: string;
  office?: string;
  role?: string;
  arrival_on?: string | null;
  departure_on?: string | null;
}): Promise<EventAttendance | null> {
  let row: EventAttendance | null = null;
  await updateStore((store) => {
    const idx = store.event_attendance.findIndex(
      (item) => item.event_id === input.event_id && item.user_id === input.user_id
    );
    if (idx === -1) return;
    store.event_attendance[idx] = {
      ...store.event_attendance[idx],
      office: input.office ?? store.event_attendance[idx].office ?? "",
      role: input.role ?? store.event_attendance[idx].role ?? "",
      arrival_on:
        input.arrival_on === undefined
          ? store.event_attendance[idx].arrival_on ?? null
          : input.arrival_on,
      departure_on:
        input.departure_on === undefined
          ? store.event_attendance[idx].departure_on ?? null
          : input.departure_on,
      updated_at: nowIso(),
    };
    row = store.event_attendance[idx];
  });
  return row;
}

export async function listProfileOffices() {
  const store = await readStore();
  return store.profile_offices ?? [];
}

export async function setProfileOffice(
  userId: string,
  office: string
): Promise<ProfileOffice | null> {
  let row: ProfileOffice | null = null;
  await updateStore((store) => {
    if (!store.profile_offices) store.profile_offices = [];
    const idx = store.profile_offices.findIndex((item) => item.user_id === userId);
    row = { user_id: userId, office: office.trim() };
    if (!row.office) {
      store.profile_offices = store.profile_offices.filter(
        (item) => item.user_id !== userId
      );
      return;
    }
    if (idx === -1) store.profile_offices.push(row);
    else store.profile_offices[idx] = row;
  });
  return row;
}

export async function listAttendanceRequests() {
  const store = await readStore();
  return {
    requests: [...(store.event_attendance_requests ?? [])].sort(
      (a, b) => b.year - a.year || a.title.localeCompare(b.title)
    ),
    lines: store.event_attendance_request_lines ?? [],
  };
}

export async function saveAttendanceRequest(input: {
  id?: string;
  year: number;
  title: string;
  office: string;
  status: AttendanceRequestStatus;
  notes: string;
}): Promise<EventAttendanceRequest | null> {
  let row: EventAttendanceRequest | null = null;
  await updateStore((store) => {
    if (!store.event_attendance_requests) store.event_attendance_requests = [];
    const idx = input.id
      ? store.event_attendance_requests.findIndex((item) => item.id === input.id)
      : -1;
    if (idx === -1) {
      row = {
        id: uid("ear"),
        year: input.year,
        title: input.title.trim(),
        office: input.office.trim(),
        status: input.status,
        notes: input.notes.trim(),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      store.event_attendance_requests.push(row);
      return;
    }
    store.event_attendance_requests[idx] = {
      ...store.event_attendance_requests[idx],
      year: input.year,
      title: input.title.trim(),
      office: input.office.trim(),
      status: input.status,
      notes: input.notes.trim(),
      updated_at: nowIso(),
    };
    row = store.event_attendance_requests[idx];
  });
  return row;
}

export async function addAttendanceRequestLine(input: {
  request_id: string;
  event_id: string | null;
  event_title: string;
  user_id: string | null;
  person_name: string;
  office: string;
  role: string;
  status: AttendanceRequestLineStatus;
  notes: string;
}): Promise<EventAttendanceRequestLine | null> {
  let row: EventAttendanceRequestLine | null = null;
  await updateStore((store) => {
    if (!store.event_attendance_request_lines) {
      store.event_attendance_request_lines = [];
    }
    row = {
      id: uid("eal"),
      request_id: input.request_id,
      event_id: input.event_id,
      event_title: input.event_title.trim(),
      user_id: input.user_id,
      person_name: input.person_name.trim(),
      office: input.office.trim(),
      role: input.role.trim(),
      status: input.status,
      notes: input.notes.trim(),
      created_at: nowIso(),
    };
    store.event_attendance_request_lines.push(row);
  });
  return row;
}

export async function updateAttendanceRequestLine(
  id: string,
  status: AttendanceRequestLineStatus
) {
  await updateStore((store) => {
    const idx = (store.event_attendance_request_lines ?? []).findIndex(
      (line) => line.id === id
    );
    if (idx === -1 || !store.event_attendance_request_lines) return;
    store.event_attendance_request_lines[idx] = {
      ...store.event_attendance_request_lines[idx],
      status,
    };
  });
}
