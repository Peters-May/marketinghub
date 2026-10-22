import { redirect } from "next/navigation";
import { TasksClient } from "@/components/tasks/TasksClient";
import { getSessionUser } from "@/lib/auth/session";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getFieldOptionsMap } from "@/lib/data/data-admin";
import {
  listAwards,
  listContent,
  listEvents,
  listSponsorships,
  listTasks,
  listThemes,
} from "@/lib/data/repos";
import { ownerMatchesViewer } from "@/lib/identity/owners";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: { open?: string };
}) {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || (user.role !== "admin" && user.role !== "staff")) {
    redirect("/app");
  }
  const isAdmin = user.role === "admin";
  const viewer = { id: user.id, fullName: user.full_name, isAdmin };

  const [tasks, fieldOptions, events, content, themes, awards, sponsorships] =
    await Promise.all([
      listTasks(),
      getFieldOptionsMap("tasks"),
      listEvents(),
      listContent(),
      listThemes(),
      listAwards(),
      listSponsorships(),
    ]);

  const visible = isAdmin
    ? tasks
    : tasks.filter((task) =>
        ownerMatchesViewer(task.owner, task.owner_user_id, viewer)
      );

  const titles = new Map<string, string>();
  for (const event of events) titles.set(`event:${event.id}`, event.title);
  for (const item of content) titles.set(`content:${item.id}`, item.title);
  for (const theme of themes) titles.set(`theme:${theme.id}`, theme.title);
  for (const award of awards) titles.set(`award:${award.id}`, award.title);
  for (const partner of sponsorships) {
    titles.set(`sponsorship:${partner.id}`, partner.partner || partner.package_name);
  }

  const relatedLabels: Record<string, string> = {};
  for (const task of visible) {
    if (!task.related_type || !task.related_id) continue;
    const key = `${task.related_type}:${task.related_id}`;
    const title = titles.get(key);
    if (title) relatedLabels[key] = title;
  }

  return (
    <TasksClient
      initialOpenId={searchParams?.open ?? null}
      initial={visible}
      fieldOptions={fieldOptions}
      viewer={viewer}
      relatedLabels={relatedLabels}
    />
  );
}
