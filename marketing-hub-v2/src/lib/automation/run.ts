import { createTask } from "@/lib/data/repos";
import { planDailyWork, type PlannedNotification, type PlannedTask } from "@/lib/automation/plan";
import { readStore, updateStore } from "@/lib/store/local";
import { uid } from "@/lib/utils";

export type DailyPlan = {
  started: string;
  tasks: PlannedTask[];
  notifications: PlannedNotification[];
};

export async function loadDailyPlan(now = new Date()): Promise<DailyPlan> {
  const store = await readStore();
  const plan = planDailyWork({
    now,
    events: store.events ?? [],
    attendance: store.event_attendance ?? [],
    tasks: store.tasks ?? [],
    rules: store.notification_rules ?? [],
  });
  console.log("[automation] planned", plan.tasks.length, "tasks");
  return {
    started: now.toISOString(),
    tasks: plan.tasks,
    notifications: plan.notifications,
  };
}

export async function createPlannedTask(task: PlannedTask): Promise<boolean> {
  const fresh = await readStore();
  if ((fresh.tasks ?? []).some((row) => row.automation_key === task.automation_key)) {
    return false;
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
  return true;
}

export async function recordDailyAutomationRun(input: {
  started: string;
  createdTasks: number;
  notifications: PlannedNotification[];
}): Promise<number> {
  const notified = new Set<string>();
  await updateStore((next) => {
    if (!next.notifications) next.notifications = [];
    const seen = new Set(
      next.notifications.map((item) => `${item.user_id}:${item.title}:${item.href}`)
    );
    for (const item of input.notifications) {
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
      started_at: input.started,
      finished_at: new Date().toISOString(),
      status: "ok",
      summary: `Created ${input.createdTasks} task${input.createdTasks === 1 ? "" : "s"} and ${notified.size} notification${notified.size === 1 ? "" : "s"}.`,
    });
    next.automation_runs = next.automation_runs.slice(-40);
  });
  return notified.size;
}

export async function runDailyAutomation(now = new Date()) {
  const plan = await loadDailyPlan(now);
  let createdTasks = 0;
  for (const task of plan.tasks) {
    if (await createPlannedTask(task)) createdTasks += 1;
  }
  const notifications = await recordDailyAutomationRun({
    started: plan.started,
    createdTasks,
    notifications: plan.notifications,
  });
  return { createdTasks, notifications };
}
