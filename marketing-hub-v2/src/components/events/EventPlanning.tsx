"use client";

import { useCallback, useEffect, useState } from "react";
import { HUB_OFFICE_LABELS } from "@/lib/events/offices";
import type { EventAttendance, EventBooking, EventOffice } from "@/lib/types";

type Tab = "people" | "travel";

export function EventPlanning({
  eventId,
  isAdmin,
  currentUserId,
  tab,
}: {
  eventId: string;
  isAdmin: boolean;
  currentUserId: string | null;
  tab: Tab;
}) {
  const [offices, setOffices] = useState<EventOffice[]>([]);
  const [bookings, setBookings] = useState<EventBooking[]>([]);
  const [attendance, setAttendance] = useState<EventAttendance[]>([]);
  const [profileOffice, setProfileOffice] = useState("");
  const [office, setOffice] = useState<string>(HUB_OFFICE_LABELS[0]);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<EventBooking["kind"]>("hotel");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/planning?eventId=${encodeURIComponent(eventId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not load planning");
      return;
    }
    setOffices(data.offices ?? []);
    setBookings(data.bookings ?? []);
    setAttendance(data.attendance ?? []);
    setProfileOffice(data.profileOffice ?? "");
    setError(null);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/events/planning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not save");
      return;
    }
    setError(null);
    await load();
  }

  const mine = attendance.find((row) => row.user_id === currentUserId) ?? null;

  return (
    <div className="space-y-4 text-sm">
      {error ? <p className="text-rose-700">{error}</p> : null}
      {tab === "people" ? (
        <>
          <label className="block">
            <span className="label">Your office</span>
            <input
              className="field mt-1"
              list="hub-offices"
              value={profileOffice}
              onChange={(event) => setProfileOffice(event.target.value)}
              onBlur={() => void post({ action: "profile_office", office: profileOffice })}
            />
          </label>
          <datalist id="hub-offices">
            {HUB_OFFICE_LABELS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {mine ? (
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void post({
                  action: "travel",
                  event_id: eventId,
                  user_id: currentUserId,
                  office: String(form.get("office") ?? ""),
                  role: String(form.get("role") ?? ""),
                  arrival_on: String(form.get("arrival_on") ?? ""),
                  departure_on: String(form.get("departure_on") ?? ""),
                });
              }}
            >
              <input className="field" name="office" placeholder="Office on this event" defaultValue={mine.office ?? ""} list="hub-offices" />
              <input className="field" name="role" placeholder="Role" defaultValue={mine.role ?? ""} />
              <input className="field" name="arrival_on" type="date" defaultValue={mine.arrival_on ?? ""} />
              <input className="field" name="departure_on" type="date" defaultValue={mine.departure_on ?? ""} />
              <button type="submit" className="btn-secondary sm:col-span-2">Save travel</button>
            </form>
          ) : (
            <p className="text-muted">Mark whether you are attending before adding arrival and departure.</p>
          )}
          <ul className="divide-y divide-border">
            {attendance.map((row) => (
              <li key={row.id} className="py-2">
                <p className="font-medium">{row.user_name}</p>
                <p className="text-xs text-muted">
                  {[row.attendance_status.replace(/_/g, " "), row.office, row.role, row.arrival_on && `arrives ${row.arrival_on}`, row.departure_on && `leaves ${row.departure_on}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
          <div>
            <p className="label">Offices at this event</p>
            <ul className="mt-1 space-y-1">
              {offices.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2">
                  <span>{row.office}</span>
                  {isAdmin ? (
                    <button type="button" className="text-xs text-muted underline" onClick={() => void post({ action: "remove_office", id: row.id })}>
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
              {offices.length === 0 ? <li className="text-muted">No office assigned yet.</li> : null}
            </ul>
            {isAdmin ? (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void post({ action: "add_office", event_id: eventId, office });
                }}
              >
                <input className="field" list="hub-offices" value={office} onChange={(event) => setOffice(event.target.value)} />
                <button type="submit" className="btn-secondary">Add</button>
              </form>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            Hotel and flight bookings sit alongside the single hotel block. Confirmation references are shown to admins and to the person the booking is for.
          </p>
          <ul className="divide-y divide-border">
            {bookings.map((row) => (
              <li key={row.id} className="py-2">
                <p className="font-medium">{row.label}</p>
                <p className="text-xs text-muted">
                  {[row.kind, row.attendee_name, row.starts_on, row.reference ? `ref ${row.reference}` : "reference hidden"]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {isAdmin ? (
                  <button type="button" className="text-xs text-muted underline" onClick={() => void post({ action: "remove_booking", id: row.id })}>
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
            {bookings.length === 0 ? <li className="text-muted">No extra bookings yet.</li> : null}
          </ul>
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void post({
                action: "add_booking",
                event_id: eventId,
                kind,
                label,
                reference,
                attendee_user_id: isAdmin ? "" : currentUserId,
                attendee_name: "",
              }).then(() => {
                setLabel("");
                setReference("");
              });
            }}
          >
            <select className="field" value={kind} onChange={(event) => setKind(event.target.value as EventBooking["kind"])}>
              <option value="hotel">Hotel</option>
              <option value="flight">Flight</option>
              <option value="other">Other</option>
            </select>
            <input className="field" placeholder="Hotel or route" value={label} onChange={(event) => setLabel(event.target.value)} />
            <input className="field" placeholder="Confirmation reference" value={reference} onChange={(event) => setReference(event.target.value)} />
            <button type="submit" className="btn-secondary">Add booking</button>
          </form>
        </>
      )}
    </div>
  );
}
