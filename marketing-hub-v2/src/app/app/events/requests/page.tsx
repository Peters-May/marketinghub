import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Annual attendance list is parked until it is ready to use. */
export default function AttendanceRequestsPage() {
  redirect("/app/events");
}
