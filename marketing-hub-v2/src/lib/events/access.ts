import type { SessionUser } from "@/lib/auth/session";

/** Admins may delete any event. Members may delete only an event they created. */
export function canDeleteEvent(
  event: { created_by: string | null },
  user: Pick<SessionUser, "id" | "role">
) {
  if (user.role === "admin") return true;
  if (user.role !== "staff") return false;
  return Boolean(event.created_by) && event.created_by === user.id;
}
