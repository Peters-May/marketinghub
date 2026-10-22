import type { EventAttendance, EventItem } from "@/lib/types";

export type Participation = "attending" | "mixed" | "watching";

export type ParticipationColor = {
  bg: string;
  text: string;
  border: string;
  label: string;
};

const COLORS: Record<Participation, ParticipationColor> = {
  attending: {
    bg: "#0B2545",
    text: "#ffffff",
    border: "#0B2545",
    label: "Attending",
  },
  mixed: {
    bg: "#FEF3C7",
    text: "#1B3A5B",
    border: "#B45309",
    label: "Mixed",
  },
  watching: {
    bg: "#E3E6E9",
    text: "#1B3A5B",
    border: "#1B3A5B",
    label: "Watching",
  },
};

export function participationOf(
  event: Pick<EventItem, "id" | "pm_attending">,
  attendance: Pick<EventAttendance, "event_id" | "attendance_status">[]
): Participation {
  if (!event.pm_attending) return "watching";
  const rows = attendance.filter((row) => row.event_id === event.id);
  const going = rows.some(
    (row) =>
      row.attendance_status === "attending" ||
      row.attendance_status === "interested"
  );
  const holdingBack = rows.some(
    (row) =>
      row.attendance_status === "maybe" ||
      row.attendance_status === "not_attending"
  );
  if (holdingBack && (going || rows.length > 0)) return "mixed";
  return "attending";
}

export function participationColor(kind: Participation): ParticipationColor {
  return COLORS[kind];
}
