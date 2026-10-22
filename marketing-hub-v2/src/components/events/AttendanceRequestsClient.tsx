"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { HUB_OFFICE_LABELS } from "@/lib/events/offices";
import type {
  EventAttendanceRequest,
  EventAttendanceRequestLine,
} from "@/lib/types";

export function AttendanceRequestsClient({
  isAdmin,
  userId,
  userName,
}: {
  isAdmin: boolean;
  userId: string;
  userName: string;
}) {
  const [requests, setRequests] = useState<EventAttendanceRequest[]>([]);
  const [lines, setLines] = useState<EventAttendanceRequestLine[]>([]);
  const [title, setTitle] = useState(`${new Date().getFullYear() + 1} attendance`);
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [office, setOffice] = useState<string>(HUB_OFFICE_LABELS[0]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/events/attendance-requests");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not load requests");
      return;
    }
    setRequests(data.requests ?? []);
    setLines(data.lines ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/events/attendance-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not save");
      return;
    }
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Attendance requests"
        description="Annual list of who should attend which shows. This does not replace the RSVP on each event."
        actions={<Link href="/app/events" className="btn-secondary">Events</Link>}
      />
      {error ? <p className="mb-4 text-sm text-rose-700">{error}</p> : null}
      {isAdmin ? (
        <form
          className="surface-card mb-6 grid gap-3 p-4 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void post({
              action: "save_request",
              title,
              year: Number(year),
              office,
              status: "open",
              notes: "",
            });
          }}
        >
          <input className="field sm:col-span-2" value={title} onChange={(event) => setTitle(event.target.value)} />
          <input className="field" value={year} onChange={(event) => setYear(event.target.value)} />
          <input className="field" list="hub-offices" value={office} onChange={(event) => setOffice(event.target.value)} />
          <datalist id="hub-offices">
            {HUB_OFFICE_LABELS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button type="submit" className="btn-primary sm:col-span-4 w-fit">Open request</button>
        </form>
      ) : null}
      <div className="space-y-4">
        {requests.map((request) => {
          const mine = lines.filter((line) => line.request_id === request.id);
          return (
            <section key={request.id} className="surface-card p-4">
              <h2 className="font-display text-lg text-brand">{request.title}</h2>
              <p className="text-xs text-muted">{request.year} · {request.office || "All offices"} · {request.status}</p>
              <ul className="mt-3 divide-y divide-border">
                {mine.map((line) => (
                  <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>{line.person_name} · {line.event_title}</span>
                    <span className="text-xs text-muted">{line.status}</span>
                    {isAdmin && line.status === "requested" ? (
                      <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={() => void post({ action: "set_line_status", id: line.id, status: "approved" })}>
                        Approve
                      </button>
                    ) : null}
                  </li>
                ))}
                {mine.length === 0 ? <li className="py-2 text-sm text-muted">No names yet.</li> : null}
              </ul>
              {request.status === "open" ? (
                <form
                  className="mt-3 flex flex-wrap gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void post({
                      action: "add_line",
                      request_id: request.id,
                      event_title: String(form.get("event_title") ?? ""),
                      person_name: userName,
                      user_id: userId,
                      office: request.office,
                      role: String(form.get("role") ?? ""),
                      status: "requested",
                    });
                    event.currentTarget.reset();
                  }}
                >
                  <input className="field" name="event_title" placeholder="Event" />
                  <input className="field" name="role" placeholder="Role" />
                  <button type="submit" className="btn-secondary">Add me</button>
                </form>
              ) : null}
            </section>
          );
        })}
        {requests.length === 0 ? (
          <p className="text-sm text-muted">No attendance request is open yet.</p>
        ) : null}
      </div>
    </div>
  );
}
