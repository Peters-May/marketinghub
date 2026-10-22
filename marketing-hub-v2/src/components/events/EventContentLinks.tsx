"use client";

import { useMemo, useState } from "react";
import type { EventContentLink } from "@/lib/types";

type Named = { id: string; title: string };

export function EventContentLinks({
  eventId,
  contentId,
  links: initialLinks,
  events,
  content,
  canEdit,
}: {
  eventId?: string;
  contentId?: string;
  links: EventContentLink[];
  events: Named[];
  content: Named[];
  canEdit: boolean;
}) {
  const [links, setLinks] = useState(initialLinks);
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = useMemo(
    () =>
      links.filter((link) =>
        eventId ? link.event_id === eventId : link.content_id === contentId
      ),
    [links, eventId, contentId]
  );
  const linkedIds = new Set(
    mine.map((link) => (eventId ? link.content_id : link.event_id))
  );
  const options = (eventId ? content : events).filter(
    (item) => !linkedIds.has(item.id)
  );
  const titleFor = (link: EventContentLink) => {
    const id = eventId ? link.content_id : link.event_id;
    const list = eventId ? content : events;
    return list.find((item) => item.id === id)?.title || "Linked record";
  };

  async function addLink() {
    if (!choice || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/events/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId ?? choice,
          content_id: contentId ?? choice,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not link");
        return;
      }
      if (data.link) setLinks((prev) => [...prev, data.link as EventContentLink]);
      setChoice("");
    } finally {
      setSaving(false);
    }
  }

  async function removeLink(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/events/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink", id }),
      });
      if (!res.ok) {
        setError("Could not remove the link");
        return;
      }
      setLinks((prev) => prev.filter((link) => link.id !== id));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border pt-3">
      <p className="label !mb-2">{eventId ? "Linked content" : "Linked events"}</p>
      {mine.length === 0 ? (
        <p className="text-sm text-muted">Nothing linked yet.</p>
      ) : (
        <ul className="space-y-1">
          {mine.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{titleFor(link)}</span>
              {canEdit ? (
                <button
                  type="button"
                  className="text-xs text-muted hover:text-foreground"
                  disabled={saving}
                  onClick={() => void removeLink(link.id)}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            className="field min-w-0 flex-1"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="">
              {eventId ? "Add a content piece…" : "Add an event…"}
            </option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title || "Untitled"}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            disabled={!choice || saving}
            onClick={() => void addLink()}
          >
            Link
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
