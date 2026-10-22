import { EventsClient } from "@/components/events/EventsClient";
import { getSessionUser } from "@/lib/auth/session";
import { getFieldOptionsMap } from "@/lib/data/data-admin";
import { listAllAttendance, listEvents } from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [events, attendance, user, fieldOptions] = await Promise.all([
    listEvents(),
    listAllAttendance(),
    getSessionUser(),
    getFieldOptionsMap("events"),
  ]);
  return (
    <EventsClient
      initialEvents={events}
      initialAttendance={attendance}
      currentUserId={user?.id ?? null}
      currentUserName={user?.full_name || user?.email || null}
      fieldOptions={fieldOptions}
    />
  );
}
