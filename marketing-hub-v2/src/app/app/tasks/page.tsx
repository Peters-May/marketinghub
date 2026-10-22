import { redirect } from "next/navigation";
import { TasksClient } from "@/components/tasks/TasksClient";
import { getSessionUser } from "@/lib/auth/session";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getFieldOptionsMap } from "@/lib/data/data-admin";
import { listTasks } from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }

  const [tasks, fieldOptions] = await Promise.all([
    listTasks(),
    getFieldOptionsMap("tasks"),
  ]);
  return <TasksClient initial={tasks} fieldOptions={fieldOptions} />;
}
