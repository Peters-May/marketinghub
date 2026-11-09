import type { DailyPlan } from "@/lib/automation/run";

export async function dailyAutomationWorkflow() {
  "use workflow";
  console.log("[workflow] daily automation start");
  const plan = await planDailyWorkStep();
  const result = await applyDailyPlanStep(plan);
  console.log("[workflow] daily automation finished", result);
  return result;
}

async function planDailyWorkStep() {
  "use step";
  console.log("[workflow] plan daily work");
  const { loadDailyPlan } = await import("@/lib/automation/run");
  return loadDailyPlan();
}

async function applyDailyPlanStep(plan: DailyPlan) {
  "use step";
  console.log(
    "[workflow] apply daily plan",
    plan.tasks.length,
    "tasks",
    plan.notifications.length,
    "notifications"
  );
  const { applyDailyAutomationPlan } = await import("@/lib/automation/run");
  return applyDailyAutomationPlan(plan);
}
