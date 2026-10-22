import { addDays, differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import { attendanceChecklistProgress } from "@/lib/events/attendance-checklist";
import { isClosedTaskStatus } from "@/lib/data/collections";
import type {
  EventAttendance,
  EventItem,
  HubNotification,
  HubTask,
  NotificationRule,
} from "@/lib/types";

export type PlannedTask = {
  automation_key: string;
  title: string;
  due_date: string;
  related_type: "event";
  related_id: string;
  owner: string;
  owner_user_id: string | null;
};

export type PlannedNotification = Omit<HubNotification, "id" | "created_at" | "read_at">;

function dayFrom(value: string | null | undefined) {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = parseISO(day);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function ruleFor(rules: NotificationRule[], key: NotificationRule["key"], fallback: number) {
  return rules.find((rule) => rule.key === key) ?? {
    id: key,
    key,
    enabled: true,
    days_before: fallback,
  };
}

export function planDailyWork(input: {
  now: Date;
  events: EventItem[];
  attendance: EventAttendance[];
  tasks: HubTask[];
  rules: NotificationRule[];
}) {
  const today = startOfDay(input.now);
  const tasks: PlannedTask[] = [];
  const notifications: PlannedNotification[] = [];
  const existingKeys = new Set(
    input.tasks.map((task) => task.automation_key).filter(Boolean) as string[]
  );
  const eventPrep = ruleFor(input.rules, "event_prep", 21);
  const taskDue = ruleFor(input.rules, "task_due", 2);

  if (eventPrep.enabled) {
    const horizon = addDays(today, eventPrep.days_before);
    for (const event of input.events) {
      if (!event.pm_attending || !event.starts_at) continue;
      const start = dayFrom(event.starts_at);
      if (!start || start.getTime() < today.getTime() || start.getTime() > horizon.getTime()) {
        continue;
      }
      const progress = attendanceChecklistProgress(event);
      if (progress.done >= progress.total) continue;
      const key = `event-prep:${event.id}`;
      if (existingKeys.has(key)) continue;
      const lead = input.attendance.find(
        (row) =>
          row.event_id === event.id &&
          (row.attendance_status === "attending" || row.attendance_status === "interested")
      );
      tasks.push({
        automation_key: key,
        title: `Prepare for ${event.title}`,
        due_date: event.starts_at.slice(0, 10),
        related_type: "event",
        related_id: event.id,
        owner: lead?.user_name ?? "",
        owner_user_id: lead?.user_id ?? null,
      });
      if (lead?.user_id) {
        notifications.push({
          user_id: lead.user_id,
          title: `Prepare for ${event.title}`,
          body: `Checklist ${progress.done}/${progress.total}. A task has been added.`,
          href: `/app/events?open=${encodeURIComponent(event.id)}`,
        });
      }
    }
  }

  if (taskDue.enabled) {
    for (const task of input.tasks) {
      if (isClosedTaskStatus(task.status) || !task.owner_user_id || !task.due_date) continue;
      const due = dayFrom(task.due_date);
      if (!due) continue;
      const days = differenceInCalendarDays(due, today);
      if (days < 0 || days > taskDue.days_before) continue;
      const key = `task-due:${task.id}:${task.due_date.slice(0, 10)}`;
      if (existingKeys.has(key)) continue;
      notifications.push({
        user_id: task.owner_user_id,
        title: days === 0 ? `Due today: ${task.title}` : `Due soon: ${task.title}`,
        body: days === 0 ? "This task is due today." : `Due in ${days} day${days === 1 ? "" : "s"}.`,
        href: `/app/tasks?open=${encodeURIComponent(task.id)}`,
      });
      existingKeys.add(key);
    }
  }

  return { tasks, notifications };
}
