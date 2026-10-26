import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from "date-fns";
import { attendanceChecklistProgress } from "@/lib/events/attendance-checklist";
import { enquiryRoutingGap } from "@/lib/enquiries/routing";
import { isClosedTaskStatus } from "@/lib/data/collections";
import { ownerMatchesViewer } from "@/lib/identity/owner-match";
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
    | "id"
    | "customer_name"
    | "needs_manual_review"
    | "selected_office"
    | "status"
    | "updated_at"
  >[];
  emails: Pick<EmailCampaign, "id" | "title" | "status" | "scheduled_at">[];
  budget: BudgetTotals | null;
};

function pushAwardActions(input: {
  awards: AwardEntry[];
  today: Date;
  seen: Set<string>;
  actions: DashboardAction[];
  linkedAwards: Set<string>;
  personal: boolean;
  viewer: DashboardViewer;
}) {
  const awardHorizon = addDays(input.today, AWARD_HORIZON_DAYS);
  let research = 0;
  for (const award of input.awards) {
    if (
      award.status === "submitted" ||
      award.status === "won" ||
      award.status === "not_won" ||
      award.status === "shortlisted"
    ) {
      continue;
    }
    if (
      input.personal &&
      !assignedToViewer(award.owner, null, input.viewer)
    ) {
      continue;
    }
    if (input.linkedAwards.has(award.id)) continue;
    const due = dayFrom(award.submission_deadline);
    const verified = award.deadline_verified === true;
    if (award.status === "watching" && !due) {
      const key = `award:${award.id}`;
      if (input.seen.has(key) || research >= 5) continue;
      research += 1;
      input.seen.add(key);
      input.actions.push({
        key,
        title: award.title,
        reason: "Award needs research",
        when: null,
        href: recordPath("award", award.id),
        tone: "attention",
      });
      continue;
    }
    if (!due || due.getTime() > awardHorizon.getTime()) continue;
    const key = `award:${award.id}`;
    if (input.seen.has(key)) continue;
    input.seen.add(key);
    const overdue = due.getTime() < input.today.getTime();
    input.actions.push({
      key,
      title: award.title,
      reason: verified ? "Award deadline" : "Award deadline, date not verified",
      when: `${overdue ? "Overdue" : "Deadline"} ${formatDay(due)}`,
      href: recordPath("award", award.id),
      tone: overdue ? "overdue" : "soon",
    });
  }
}

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

function recordPath(
  kind: "task" | "content" | "event" | "award" | "enquiry" | "email",
  id: string
) {
  const encoded = encodeURIComponent(id);
  if (kind === "task") return `/app/tasks?open=${encoded}`;
  if (kind === "content") return `/app/content?open=${encoded}`;
  if (kind === "event") return `/app/events?open=${encoded}`;
  if (kind === "award") return `/app/awards?open=${encoded}`;
  if (kind === "enquiry") return `/app/enquiries?open=${encoded}`;
  return `/app/email?campaign=${encoded}`;
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

  const openTasks: HubTask[] = [];
  const seenTaskIds = new Set<string>();
  for (const task of input.tasks) {
    if (isClosedTaskStatus(task.status) || seenTaskIds.has(task.id)) continue;
    seenTaskIds.add(task.id);
    openTasks.push(task);
  }
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
      href: recordPath("task", row.task.id),
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
      href: recordPath("content", item.id),
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
      href: recordPath("event", event.id),
      tone: "attention",
    });
  }

  if (!personal && viewer.isAdmin) {
    const review = input.enquiries.filter(
      (enquiry) => enquiryRoutingGap(enquiry) !== null
    );
    for (const enquiry of review.slice(0, 5)) {
      const key = `enquiry:${enquiry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const gap = enquiryRoutingGap(enquiry);
      actions.push({
        key,
        title: enquiry.customer_name.trim() || "Website enquiry",
        reason:
          gap === "no office"
            ? "Enquiry has no office"
            : "Enquiry needs review",
        when: null,
        href: recordPath("enquiry", enquiry.id),
        tone: "attention",
      });
    }

    pushAwardActions({
      awards: input.awards,
      today,
      seen,
      actions,
      linkedAwards,
      personal: false,
      viewer,
    });

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
        href: recordPath("email", email.id),
        tone: "overdue",
      });
    }
  } else if (personal) {
    pushAwardActions({
      awards: input.awards,
      today,
      seen,
      actions,
      linkedAwards,
      personal: true,
      viewer,
    });
  }

  const placed = new Set(actions.map((action) => action.key));
  function takeFresh(rows: DashboardRow[], limit: number) {
    const picked: DashboardRow[] = [];
    for (const row of rows) {
      if (placed.has(row.key)) continue;
      placed.add(row.key);
      picked.push(row);
      if (picked.length >= limit) break;
    }
    return picked;
  }

  const upcomingEvents = takeFresh(
    input.events
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
        href: recordPath("event", event.id),
      })),
    5
  );

  const contentDeadlines = takeFresh(
    input.content
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
      .sort((a, b) => a.due!.getTime() - b.due!.getTime())
      .map((row) => ({
        key: `content:${row.item.id}`,
        title: row.item.title,
        detail: `${row.item.content_type || "Content"} · ${formatDay(row.due!)}`,
        href: recordPath("content", row.item.id),
      })),
    5
  );

  const recentSources: (DashboardRow & { updated_at: string })[] = [
    ...input.events.map((event) => ({
      key: `event:${event.id}`,
      title: event.title,
      detail: "Event",
      href: recordPath("event", event.id),
      updated_at: event.updated_at,
    })),
    ...input.tasks
      .filter((task) =>
        personal
          ? assignedToViewer(task.owner, task.owner_user_id, viewer)
          : true
      )
      .map((task) => ({
        key: `task:${task.id}`,
        title: task.title,
        detail: "Task",
        href: recordPath("task", task.id),
        updated_at: task.updated_at,
      })),
    ...input.awards.map((award) => ({
      key: `award:${award.id}`,
      title: award.title,
      detail: "Award",
      href: recordPath("award", award.id),
      updated_at: award.updated_at,
    })),
    ...(viewer.isAdmin
      ? input.content.map((item) => ({
          key: `content:${item.id}`,
          title: item.title,
          detail: "Content",
          href: recordPath("content", item.id),
          updated_at: item.updated_at,
        }))
      : []),
  ];

  const recentlyUpdated = takeFresh(
    recentSources.sort((a, b) =>
      (b.updated_at || "").localeCompare(a.updated_at || "")
    ),
    6
  );

  const unowned =
    !personal && viewer.isAdmin
    ? takeFresh(
        [
          ...openTasks
            .filter((task) => !task.owner.trim())
            .map((task) => ({
              key: `task:${task.id}`,
              title: task.title,
              detail: "Task with no owner",
              href: recordPath("task", task.id),
            })),
          ...input.content
            .filter(
              (item) =>
                !item.owner.trim() &&
                item.status !== "published" &&
                item.status !== "cancelled"
            )
            .map((item) => ({
              key: `content:${item.id}`,
              title: item.title,
              detail: "Content with no owner",
              href: recordPath("content", item.id),
            })),
        ],
        8
      )
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
