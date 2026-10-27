import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export default async function PrHomePage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }
  redirect("/app/pr/releases");
}
