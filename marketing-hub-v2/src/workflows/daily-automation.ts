import type { PlannedNotification, PlannedTask } from "@/lib/automation/plan";

export async function dailyAutomationWorkflow() {
  "use workflow";
  console.log("[workflow] daily automation start");
  const plan = await planDailyWorkStep();
  let createdTasks = 0;
  for (const task of plan.tasks) {
    const created = await createDailyTask(task);
    if (created) createdTasks += 1;
  }
  const notifications = await recordDailyRun({
    started: plan.started,
    createdTasks,
    notifications: plan.notifications,
  });
  const result = { createdTasks, notifications };
  console.log("[workflow] daily automation finished", result);
  return result;
}

async function planDailyWorkStep() {
  "use step";
  console.log("[workflow] plan daily work");
  const { loadDailyPlan } = await import("@/lib/automation/run");
  return loadDailyPlan();
}

async function createDailyTask(task: PlannedTask) {
  "use step";
  console.log("[workflow] create daily task", task.automation_key);
  const { createPlannedTask } = await import("@/lib/automation/run");
  return createPlannedTask(task);
}

async function recordDailyRun(input: {
  started: string;
  createdTasks: number;
  notifications: PlannedNotification[];
}) {
  "use step";
  console.log("[workflow] record daily run", input.createdTasks);
  const { recordDailyAutomationRun } = await import("@/lib/automation/run");
  return recordDailyAutomationRun(input);
}
