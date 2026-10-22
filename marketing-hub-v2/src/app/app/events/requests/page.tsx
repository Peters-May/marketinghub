import { redirect } from "next/navigation";
import { AttendanceRequestsClient } from "@/components/events/AttendanceRequestsClient";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AttendanceRequestsPage() {
  const user = (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || (user.role !== "admin" && user.role !== "staff")) {
    redirect("/app");
  }
  return (
    <AttendanceRequestsClient
      isAdmin={user.role === "admin"}
      userId={user.id}
      userName={user.full_name || user.email || "Staff"}
    />
  );
}
