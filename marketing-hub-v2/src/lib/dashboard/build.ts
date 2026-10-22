import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from "date-fns";
import { attendanceChecklistProgress } from "@/lib/events/attendance-checklist";
import { isClosedTaskStatus } from "@/lib/data/collections";
import { ownerMatchesViewer } from "@/lib/identity/owners";
import type {
  AwardEntry,
  ContentItem,
  EmailCampaign,
  EventAttendance,
  EventItem,
  HubTask,
  WebEnquiry,
} from "@/lib/types";
import type { BudgetTotals } from "@/lib/budget/totals";

export type DashboardViewer = {
  id: string;
  fullName: string;
  isAdmin: boolean;
};

export type DashboardAction = {
  key: string;
  title: string;
  reason: string;
  when: string | null;
  href: string;
  tone: "overdue" | "soon" | "attention";
};

export type DashboardRow = {
  key: string;
  title: string;
  detail: string;
  href: string;
};

export type DashboardBudget = {
  planned: number;
  paid: number;
  pending: number;
  remaining: number;
};

export type DashboardModel = {
  actions: DashboardAction[];
  upcomingEvents: DashboardRow[];
  contentDeadlines: DashboardRow[];
  recentlyUpdated: DashboardRow[];
  unowned: DashboardRow[];
  budget: DashboardBudget | null;
};

type BuildInput = {
  now: Date;
  viewer: DashboardViewer;
  scope: "mine" | "everyone";
  tasks: HubTask[];
  content: ContentItem[];
  events: EventItem[];
  attendance: EventAttendance[];
  awards: AwardEntry[];
  enquiries: Pick<
    WebEnquiry,
    "id" | "customer_name" | "needs_manual_review" | "status" | "updated_at"
  >[];
  emails: Pick<EmailCampaign, "id" | "title" | "status" | "scheduled_at">[];
  budget: BudgetTotals | null;
};

const TASK_HORIZON_DAYS = 7;
const CONTENT_HORIZON_DAYS = 14;
const EVENT_HORIZON_DAYS = 90;
const AWARD_HORIZON_DAYS = 30;

function dayFrom(value: string | null | undefined): Date | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = parseISO(day);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
}

function formatDay(value: Date) {
  return format(value, "d MMM");
}

function assignedToViewer(owner: string, ownerUserId: string | null | undefined, viewer: DashboardViewer) {
  return ownerMatchesViewer(owner, ownerUserId, viewer);
}

function contentDate(item: ContentItem) {
  return dayFrom(item.deadline_date) ?? dayFrom(item.due_date);
}

export function buildDashboard(input: BuildInput): DashboardModel {
  const today = startOfDay(input.now);
  const personal = input.scope === "mine";
  const viewer = input.viewer;
  const seen = new Set<string>();
  const actions: DashboardAction[] = [];

  const openTasks = input.tasks.filter((task) => !isClosedTaskStatus(task.status));
  const taskRows = openTasks
    .filter((task) =>
      personal ? assignedToViewer(task.owner, task.owner_user_id, viewer) : true
    )
    .map((task) => {
      const due = dayFrom(task.due_date);
      const days = due ? differenceInCalendarDays(due, today) : null;
      return { task, due, days };
    })
    .filter((row) => row.days === null || row.days <= TASK_HORIZON_DAYS)
    .sort((a, b) => {
      const rank = (days: number | null) => {
        if (days === null) return 2;
        if (days < 0) return 0;
        return 1;
      };
      const group = rank(a.days) - rank(b.days);
      if (group !== 0) return group;
      if (a.due && b.due) return a.due.getTime() - b.due.getTime();
      return a.task.title.localeCompare(b.task.title);
    });
  const datedTasks = taskRows.filter((row) => row.days !== null);
  const undatedTasks = taskRows.filter((row) => row.days === null).slice(0, 8);
  const visibleTasks = [...datedTasks, ...undatedTasks];

  const linkedContent = new Set<string>();
  const linkedAwards = new Set<string>();
  for (const row of visibleTasks) {
    if (row.task.related_type === "content" && row.task.related_id) {
      linkedContent.add(row.task.related_id);
    }
    if (row.task.related_type === "award" && row.task.related_id) {
      linkedAwards.add(row.task.related_id);
    }
  }

  for (const row of visibleTasks) {
    const key = `task:${row.task.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const overdue = row.days !== null && row.days < 0;
    actions.push({
      key,
      title: row.task.title,
      reason: overdue
        ? "Overdue task"
        : row.days === null
          ? "Assigned task, no deadline"
          : row.days === 0
            ? "Task due today"
            : "Task due this week",
      when: row.due
        ? `${overdue ? "Overdue" : "Due"} ${formatDay(row.due)}`
        : "No deadline",
      href: "/app/tasks",
      tone: overdue ? "overdue" : "soon",
    });
  }

  const contentHorizon = addDays(today, CONTENT_HORIZON_DAYS);
  for (const item of input.content) {
    if (item.status !== "draft" && item.status !== "review") continue;
    if (linkedContent.has(item.id)) continue;
    if (
      personal &&
      !assignedToViewer(item.owner, item.owner_user_id, viewer)
    ) {
      continue;
    }
    const due = contentDate(item);
    if (!due || due.getTime() > contentHorizon.getTime()) continue;
    const key = `content:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const overdue = due.getTime() < today.getTime();
    actions.push({
      key,
      title: item.title,
      reason:
        item.status === "review" ? "Content in review" : "Content in draft",
      when: `${overdue ? "Overdue" : "Due"} ${formatDay(due)}`,
      href: "/app/content",
      tone: overdue ? "overdue" : "soon",
    });
  }

  const eventHorizon = addDays(today, EVENT_HORIZON_DAYS);
  const myEventIds = new Set(
    input.attendance
      .filter(
        (row) =>
          row.user_id === viewer.id &&
          (row.attendance_status === "attending" ||
            row.attendance_status === "maybe" ||
            row.attendance_status === "interested")
      )
      .map((row) => row.event_id)
  );
  for (const event of input.events) {
    if (!event.pm_attending || !event.starts_at) continue;
    if (personal && !myEventIds.has(event.id)) continue;
    const progress = attendanceChecklistProgress(event);
    if (progress.done >= progress.total) continue;
    const start = dayFrom(event.starts_at);
    if (!start || start.getTime() > eventHorizon.getTime()) continue;
    const end = dayFrom(event.ends_at);
    if (end && end.getTime() < today.getTime()) continue;
    if (!end && start.getTime() < today.getTime()) continue;
    const key = `event:${event.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push({
      key,
      title: event.title,
      reason: `Preparation ${progress.done}/${progress.total}`,
      when: formatDay(start),
      href: "/app/events",
      tone: "attention",
    });
  }

  if (!personal && viewer.isAdmin) {
    const review = input.enquiries.filter(
      (enquiry) => enquiry.needs_manual_review && enquiry.status !== "done"
    );
    for (const enquiry of review.slice(0, 5)) {
      const key = `enquiry:${enquiry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({
        key,
        title: enquiry.customer_name.trim() || "Website enquiry",
        reason: "Enquiry needs review",
        when: null,
        href: "/app/enquiries",
        tone: "attention",
      });
    }

    const awardHorizon = addDays(today, AWARD_HORIZON_DAYS);
    for (const award of input.awards) {
      if (
        award.status === "submitted" ||
        award.status === "won" ||
        award.status === "not_won" ||
        award.status === "shortlisted"
      ) {
        continue;
      }
      if (linkedAwards.has(award.id)) continue;
      const due = dayFrom(award.submission_deadline);
      if (!due || due.getTime() > awardHorizon.getTime()) continue;
      const key = `award:${award.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const overdue = due.getTime() < today.getTime();
      actions.push({
        key,
        title: award.title,
        reason: "Award deadline",
        when: `${overdue ? "Overdue" : "Deadline"} ${formatDay(due)}`,
        href: "/app/awards",
        tone: overdue ? "overdue" : "soon",
      });
    }

    for (const email of input.emails) {
      const scheduled = dayFrom(email.scheduled_at);
      const failed = email.status === "failed";
      const overdue =
        email.status === "scheduled" &&
        scheduled !== null &&
        scheduled.getTime() < today.getTime();
      if (!failed && !overdue) continue;
      const key = `email:${email.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({
        key,
        title: email.title,
        reason: failed ? "Email send failed" : "Scheduled email is overdue",
        when: scheduled ? formatDay(scheduled) : null,
        href: "/app/email",
        tone: "overdue",
      });
    }
  } else if (personal) {
    const awardHorizon = addDays(today, AWARD_HORIZON_DAYS);
    for (const award of input.awards) {
      if (
        award.status === "submitted" ||
        award.status === "won" ||
        award.status === "not_won" ||
        award.status === "shortlisted"
      ) {
        continue;
      }
      if (!assignedToViewer(award.owner, null, viewer)) continue;
      if (linkedAwards.has(award.id)) continue;
      const due = dayFrom(award.submission_deadline);
      if (!due || due.getTime() > awardHorizon.getTime()) continue;
      const key = `award:${award.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const overdue = due.getTime() < today.getTime();
      actions.push({
        key,
        title: award.title,
        reason: "Award deadline",
        when: `${overdue ? "Overdue" : "Deadline"} ${formatDay(due)}`,
        href: "/app/awards",
        tone: overdue ? "overdue" : "soon",
      });
    }
  }

  const actionKeys = new Set(actions.map((action) => action.key));

  const upcomingEvents = input.events
    .filter((event) => {
      const start = dayFrom(event.starts_at);
      if (!start) return false;
      const days = differenceInCalendarDays(start, today);
      return days >= 0 && days <= EVENT_HORIZON_DAYS;
    })
    .sort(
      (a, b) =>
        (dayFrom(a.starts_at)?.getTime() ?? 0) -
        (dayFrom(b.starts_at)?.getTime() ?? 0)
    )
    .filter((event) => !actionKeys.has(`event:${event.id}`))
    .slice(0, 5)
    .map((event) => ({
      key: `event:${event.id}`,
      title: event.title,
      detail: [
        event.starts_at ? formatDay(dayFrom(event.starts_at)!) : "",
        event.division,
        event.location,
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/app/events",
    }));

  const contentDeadlines = input.content
    .filter((item) => {
      if (viewer.isAdmin) {
        return item.status === "draft" || item.status === "review" || item.status === "scheduled";
      }
      return item.status === "scheduled";
    })
    .map((item) => ({ item, due: contentDate(item) }))
    .filter((row) => {
      if (!row.due) return false;
      const days = differenceInCalendarDays(row.due, today);
      return days >= 0 && days <= 30;
    })
    .filter((row) => !actionKeys.has(`content:${row.item.id}`))
    .sort((a, b) => a.due!.getTime() - b.due!.getTime())
    .slice(0, 5)
    .map((row) => ({
      key: `content:${row.item.id}`,
      title: row.item.title,
      detail: `${row.item.content_type || "Content"} · ${formatDay(row.due!)}`,
      href: "/app/content",
    }));

  const recentSources: (DashboardRow & { updated_at: string })[] = [
    ...input.events.map((event) => ({
      key: `event:${event.id}`,
      title: event.title,
      detail: "Event",
      href: "/app/events",
      updated_at: event.updated_at,
    })),
    ...input.tasks.map((task) => ({
      key: `task:${task.id}`,
      title: task.title,
      detail: "Task",
      href: "/app/tasks",
      updated_at: task.updated_at,
    })),
    ...input.awards.map((award) => ({
      key: `award:${award.id}`,
      title: award.title,
      detail: "Award",
      href: "/app/awards",
      updated_at: award.updated_at,
    })),
    ...(viewer.isAdmin
      ? input.content.map((item) => ({
          key: `content:${item.id}`,
          title: item.title,
          detail: "Content",
          href: "/app/content",
          updated_at: item.updated_at,
        }))
      : []),
  ];

  const recentlyUpdated = recentSources
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
    .filter((row) => !actionKeys.has(row.key))
    .slice(0, 6)
    .map(({ updated_at: _updated, ...row }) => row);

  const unowned = viewer.isAdmin
    ? [
        ...openTasks
          .filter((task) => !task.owner.trim())
          .slice(0, 5)
          .map((task) => ({
            key: `task:${task.id}`,
            title: task.title,
            detail: "Task with no owner",
            href: "/app/tasks",
          })),
        ...input.content
          .filter(
            (item) =>
              !item.owner.trim() &&
              item.status !== "published" &&
              item.status !== "cancelled"
          )
          .slice(0, 5)
          .map((item) => ({
            key: `content:${item.id}`,
            title: item.title,
            detail: "Content with no owner",
            href: "/app/content",
          })),
      ].slice(0, 8)
    : [];

  return {
    actions,
    upcomingEvents,
    contentDeadlines,
    recentlyUpdated,
    unowned,
    budget: input.budget
      ? {
          planned: input.budget.planned,
          paid: input.budget.paid,
          pending: input.budget.pending,
          remaining: input.budget.remaining,
        }
      : null,
  };
}
