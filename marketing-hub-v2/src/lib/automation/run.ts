import { planDailyWork, type PlannedNotification, type PlannedTask } from "@/lib/automation/plan";
import { createTask } from "@/lib/data/repos";
import { matchOwnerUserId, loadOwnerDirectory } from "@/lib/identity/owners";
import { readStore, updateStore } from "@/lib/store/local";
import type { HubTask } from "@/lib/types";
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

/** One store write for all planned tasks, notifications, and the run log. */
export async function applyDailyAutomationPlan(plan: DailyPlan): Promise<{
  createdTasks: number;
  notifications: number;
}> {
  const directory = await loadOwnerDirectory();
  let createdTasks = 0;
  let notified = 0;

  await updateStore((next) => {
    // Reset on every CAS retry so counters stay accurate.
    createdTasks = 0;
    notified = 0;
    if (!next.tasks) next.tasks = [];
    const existingKeys = new Set(
      next.tasks
        .map((row) => row.automation_key)
        .filter((key): key is string => Boolean(key))
    );
    const stamp = new Date().toISOString();

    for (const task of plan.tasks) {
      if (existingKeys.has(task.automation_key)) continue;
      existingKeys.add(task.automation_key);
      const item: HubTask = {
        title: task.title,
        details: "Added by the daily event reminder.",
        start_date: null,
        due_date: task.due_date,
        category: "Events",
        status: "todo",
        owner: task.owner,
        owner_user_id:
          task.owner_user_id ?? matchOwnerUserId(task.owner, directory),
        related_type: task.related_type,
        related_id: task.related_id,
        automation_key: task.automation_key,
        id: uid("tsk"),
        created_at: stamp,
        updated_at: stamp,
      };
      next.tasks.push(item);
      createdTasks += 1;
    }

    if (!next.notifications) next.notifications = [];
    const seen = new Set(
      next.notifications.map((item) => `${item.user_id}:${item.title}:${item.href}`)
    );
    for (const item of plan.notifications) {
      const fingerprint = `${item.user_id}:${item.title}:${item.href}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      notified += 1;
      next.notifications.push({
        ...item,
        id: uid("ntf"),
        read_at: null,
        created_at: stamp,
      });
    }

    if (!next.automation_runs) next.automation_runs = [];
    next.automation_runs.push({
      id: uid("arn"),
      key: "daily",
      started_at: plan.started,
      finished_at: stamp,
      status: "ok",
      summary: `Created ${createdTasks} task${createdTasks === 1 ? "" : "s"} and ${notified} notification${notified === 1 ? "" : "s"}.`,
    });
    next.automation_runs = next.automation_runs.slice(-40);
  });

  return { createdTasks, notifications: notified };
}

export async function recordDailyAutomationRun(input: {
  started: string;
  createdTasks: number;
  notifications: PlannedNotification[];
}): Promise<number> {
  const notified = new Set<string>();
  await updateStore((next) => {
    notified.clear();
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
  return applyDailyAutomationPlan(plan);
}
