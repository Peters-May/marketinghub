import { createTask } from "@/lib/data/repos";
import { planDailyWork } from "@/lib/automation/plan";
import { readStore, updateStore } from "@/lib/store/local";
import { uid } from "@/lib/utils";

export async function runDailyAutomation(now = new Date()) {
  const started = now.toISOString();
  const store = await readStore();
  const plan = planDailyWork({
    now,
    events: store.events ?? [],
    attendance: store.event_attendance ?? [],
    tasks: store.tasks ?? [],
    rules: store.notification_rules ?? [],
  });

  let createdTasks = 0;
  for (const task of plan.tasks) {
    const fresh = await readStore();
    if ((fresh.tasks ?? []).some((row) => row.automation_key === task.automation_key)) {
      continue;
    }
    await createTask({
      title: task.title,
      details: "Added by the daily event reminder.",
      start_date: null,
      due_date: task.due_date,
      category: "Events",
      status: "todo",
      owner: task.owner,
      owner_user_id: task.owner_user_id,
      related_type: task.related_type,
      related_id: task.related_id,
      automation_key: task.automation_key,
    });
    createdTasks += 1;
  }

  const notified = new Set<string>();
  await updateStore((next) => {
    if (!next.notifications) next.notifications = [];
    const seen = new Set(
      next.notifications.map((item) => `${item.user_id}:${item.title}:${item.href}`)
    );
    for (const item of plan.notifications) {
      const fingerprint = `${item.user_id}:${item.title}:${item.href}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      notified.add(fingerprint);
      next.notifications.push({
        ...item,
        id: uid("ntf"),
        read_at: null,
        created_at: new Date().toISOString(),
      });
    }
    if (!next.automation_runs) next.automation_runs = [];
    next.automation_runs.push({
      id: uid("arn"),
      key: "daily",
      started_at: started,
      finished_at: new Date().toISOString(),
      status: "ok",
      summary: `Created ${createdTasks} task${createdTasks === 1 ? "" : "s"} and ${notified.size} notification${notified.size === 1 ? "" : "s"}.`,
    });
    next.automation_runs = next.automation_runs.slice(-40);
  });

  return { createdTasks, notifications: notified.size };
}
