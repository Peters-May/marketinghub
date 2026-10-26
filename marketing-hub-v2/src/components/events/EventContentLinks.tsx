"use client";

import { useMemo, useState } from "react";
import { SearchSelect } from "@/components/ui/SearchSelect";
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
  const [created, setCreated] = useState<Named[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = useMemo(
    () =>
      links.filter((link) =>
        eventId ? link.event_id === eventId : link.content_id === contentId
      ),
    [links, eventId, contentId]
  );
  const catalog = useMemo(() => {
    const base = eventId ? content : events;
    const seen = new Set(base.map((item) => item.id));
    return [
      ...base,
      ...created.filter((item) => !seen.has(item.id)),
    ];
  }, [eventId, content, events, created]);
  const linkedIds = new Set(
    mine.map((link) => (eventId ? link.content_id : link.event_id))
  );
  const options = catalog
    .filter((item) => !linkedIds.has(item.id))
    .map((item) => ({
      value: item.id,
      label: item.title || "Untitled",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const titleFor = (link: EventContentLink) => {
    const id = eventId ? link.content_id : link.event_id;
    return catalog.find((item) => item.id === id)?.title || "Linked record";
  };

  async function addLink(id: string) {
    if (!id || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/events/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId ?? id,
          content_id: contentId ?? id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not link");
        return;
      }
      if (data.link) setLinks((prev) => [...prev, data.link as EventContentLink]);
    } catch {
      setError("Could not link");
    } finally {
      setSaving(false);
    }
  }

  async function createAndLink(title: string) {
    const name = title.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      const createdItem = eventId
        ? await createContentPiece(name)
        : await createEvent(name);
      setCreated((prev) =>
        prev.some((item) => item.id === createdItem.id)
          ? prev
          : [...prev, createdItem]
      );
      const res = await fetch("/api/events/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId ?? createdItem.id,
          content_id: contentId ?? createdItem.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof data.error === "string" ? data.error : "Could not link";
        setError(message);
        throw new Error(message);
      }
      if (data.link) setLinks((prev) => [...prev, data.link as EventContentLink]);
    } catch (err) {
      if (err instanceof Error && err.message) {
        setError(err.message);
        throw err;
      }
      const message = eventId
        ? "Could not add the content piece"
        : "Could not add the event";
      setError(message);
      throw new Error(message);
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

  const noun = eventId ? "content piece" : "event";

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
        <div className="mt-2">
          <SearchSelect
            value=""
            disabled={saving}
            aria-label={eventId ? "Add a content piece" : "Add an event"}
            placeholder={saving ? "Linking…" : `Add a ${noun}…`}
            searchPlaceholder={`Search or add a ${noun}…`}
            noResultsLabel={`No matches — add a new ${noun}`}
            options={options}
            allowCreate
            createLabel={(query) => `Add “${query}” as a new ${noun}`}
            onCreate={(query) => createAndLink(query)}
            onChange={(id) => {
              if (!id) return;
              void addLink(id);
            }}
          />
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

async function createContentPiece(title: string): Promise<Named> {
  const res = await fetch("/api/content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      content_type: "Editorial",
      channel: ["Editorial"],
      status: "idea",
    }),
  });
  const data = await res.json().catch(() => ({}));
  const item = data.item as { id?: string; title?: string } | undefined;
  if (!res.ok || !item?.id) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Could not add the content piece"
    );
  }
  return { id: item.id, title: item.title || title };
}

async function createEvent(title: string): Promise<Named> {
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, event_type: "Event" }),
  });
  const data = await res.json().catch(() => ({}));
  const event = data.event as { id?: string; title?: string } | undefined;
  if (!res.ok || !event?.id) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Could not add the event"
    );
  }
  return { id: event.id, title: event.title || title };
}
