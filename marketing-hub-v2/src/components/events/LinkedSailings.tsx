"use client";

import { useEffect, useState } from "react";

type SailingLink = {
  reference: string;
  route: string;
  relationship: string;
  url: string;
};

export function LinkedSailings({ eventId }: { eventId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [sailings, setSailings] = useState<SailingLink[]>([]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/events/linked-sailings?event_id=${encodeURIComponent(eventId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("unavailable");
        return res.json() as Promise<{ sailings?: SailingLink[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setSailings(Array.isArray(data.sailings) ? data.sailings : []);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return (
    <div className="rounded-lg border border-border px-3 py-3">
      <p className="label !mb-1">Relevant Peters & May sailings</p>
      {state === "loading" ? (
        <p className="text-sm text-muted">Loading linked sailings…</p>
      ) : null}
      {state === "error" ? (
        <p className="text-sm text-muted">
          Linked sailings could not be loaded from the website. Sailing details stay on the schedule system.
        </p>
      ) : null}
      {state === "ready" && sailings.length === 0 ? (
        <p className="text-sm text-muted">No sailings are linked to this event yet.</p>
      ) : null}
      {state === "ready" && sailings.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            {sailings.length} linked sailing{sailings.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-1 text-sm">
            {sailings.map((s) => (
              <li key={s.reference}>
                <a href={s.url} className="text-brand hover:underline" target="_blank" rel="noreferrer">
                  {s.reference}
                </a>
                <span className="text-muted"> · {s.route} · {s.relationship}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
