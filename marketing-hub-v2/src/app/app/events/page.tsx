import { EventsClient } from "@/components/events/EventsClient";
import { getSessionUser } from "@/lib/auth/session";
import { getFieldOptionsMap } from "@/lib/data/data-admin";
import {
  listAllAttendance,
  listContent,
  listEventContentLinks,
  listEvents,
} from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [events, attendance, user, fieldOptions, content, eventContentLinks] =
    await Promise.all([
      listEvents(),
      listAllAttendance(),
      getSessionUser(),
      getFieldOptionsMap("events"),
      listContent(),
      listEventContentLinks(),
    ]);
  const isAdmin = user?.role === "admin";
  const contentOptions = content
    .filter(
      (item) =>
        isAdmin || eventContentLinks.some((link) => link.content_id === item.id)
    )
    .map((item) => ({ id: item.id, title: item.title }));
  return (
    <EventsClient
      initialEvents={events}
      initialAttendance={attendance}
      currentUserId={user?.id ?? null}
      currentUserName={user?.full_name || user?.email || null}
      fieldOptions={fieldOptions}
      contentOptions={contentOptions}
      eventContentLinks={eventContentLinks}
    />
  );
}
