import type {
  BudgetLine,
  ContentItem,
  EventAttendance,
  EventItem,
  HubTask,
  Sponsorship,
} from "@/lib/types";
import { listWebEnquiries } from "@/lib/data/web-enquiries";
import { listWhatsAppEnquiries } from "@/lib/data/whatsapp-enquiries";
import {
  computeEnquiryStats,
  computeEnquiryYearCompare,
  type EnquiryYearCompare,
  type WebEnquiryStats,
} from "@/lib/data/web-enquiries-stats";
import { ownerMatchesViewer } from "@/lib/identity/owners";
import { contentVisibleToMember } from "@/lib/social/suggest";
import { readStore } from "@/lib/store/local";

type Catalogue = {
  events?: EventItem[];
  event_attendance?: EventAttendance[];
  tasks?: HubTask[];
  content?: ContentItem[];
  sponsorships?: Sponsorship[];
  budget_lines?: BudgetLine[];
  contacts?: unknown[];
  resources?: { title: string; category?: string }[];
};

function cell(value: string | null | undefined) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text || "—";
}

function day(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function section(title: string, rows: string[]) {
  return [`${title} (${rows.length}, complete):`, ...rows.map((row) => `- ${row}`)];
}

/** Every event, task, post, partner, and budget line. Not a sample. */
export function formatHubCatalogue(store: Catalogue, today?: string) {
  const asOf = today ?? new Date().toISOString().slice(0, 10);
  const attendance = new Map<string, string[]>();
  for (const row of store.event_attendance ?? []) {
    const name = row.user_name.trim();
    if (!name) continue;
    const list = attendance.get(row.event_id) ?? [];
    list.push(`${name} (${row.attendance_status})`);
    attendance.set(row.event_id, list);
  }

  const events = [...(store.events ?? [])].sort((a, b) => {
    const byDate = (a.starts_at ?? "9999").localeCompare(b.starts_at ?? "9999");
    return byDate || a.title.localeCompare(b.title);
  });
  const eventLines = events.map((event) => {
    const start = day(event.starts_at) || "undated";
    const end = day(event.ends_at);
    const when = end && end !== start ? `${start} to ${end}` : start;
    const people = (attendance.get(event.id) ?? []).sort((a, b) => a.localeCompare(b));
    const box = event.pm_attending
      ? "We are attending checked"
      : "We are attending not checked";
    const bits = [
      when,
      cell(event.title),
      cell(event.location),
      cell(event.event_type),
      box,
    ];
    if (event.date_status && event.date_status !== "confirmed") {
      bits.push(event.date_status);
    }
    if (event.division?.trim()) bits.push(event.division.trim());
    if (event.pm_attendance?.trim()) bits.push(`proposed: ${cell(event.pm_attendance)}`);
    bits.push(people.length ? people.join(", ") : "no named people");
    return bits.join(" | ");
  });

  const tasks = [...(store.tasks ?? [])].sort((a, b) => {
    const byDate = (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    return byDate || a.title.localeCompare(b.title);
  });
  const taskLines = tasks.map((task) =>
    [
      day(task.due_date) || "no due date",
      cell(task.title),
      cell(task.status),
      cell(task.owner),
    ].join(" | ")
  );

  const content = [...(store.content ?? [])].sort((a, b) => {
    const byDate = (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    return byDate || a.title.localeCompare(b.title);
  });
  const contentLines = content.map((item) =>
    [
      day(item.due_date) || "no date",
      cell(item.title),
      cell(item.status),
      cell((item.channel ?? []).join(", ")),
      cell(item.owner),
    ].join(" | ")
  );

  const partners = [...(store.sponsorships ?? [])].sort((a, b) =>
    a.partner.localeCompare(b.partner)
  );
  const partnerLines = partners.map((item) =>
    [
      cell(item.partner),
      cell(item.package_name),
      cell(item.status),
      [day(item.starts_at), day(item.ends_at)].filter(Boolean).join(" to ") || "no dates",
      cell(item.value),
    ].join(" | ")
  );

  const budget = [...(store.budget_lines ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
  const budgetLines = budget.map((line) =>
    [cell(line.name), cell(line.group), String(line.planned ?? "")].join(" | ")
  );

  const resources = [...(store.resources ?? [])].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const resourceLines = resources.map((item) =>
    [cell(item.title), cell(item.category)].join(" | ")
  );

  const yearCount = (year: string) =>
    events.filter((event) => event.starts_at?.startsWith(year)).length;

  return [
    `Live hub catalogue as of ${asOf}. Sections marked complete list every record in that section. Use them to extract, compare, and name the exact record to edit.`,
    `Events: ${events.length} total, ${yearCount("2026")} in 2026, ${yearCount("2027")} in 2027.`,
    `Contacts are not listed (${(store.contacts ?? []).length} records). Credentials, email bodies, and notes are not listed.`,
    "Edits to events, tasks, and posts still need a hub-command block and confirmation. Do not invent a command for contacts, budget, or media.",
    "Do not invent records, and do not say a listed record is missing.",
    ...section("Events", eventLines),
    ...section("Tasks", taskLines),
    ...section("Content", contentLines),
    ...section("Partners", partnerLines),
    ...section("Budget lines", budgetLines),
    ...section("Resources", resourceLines),
  ].join("\n");
}

/** Full catalogue for the admin assistant. It cannot change records by itself. */
export async function assistantReadContext() {
  const store = await readStore();
  return formatHubCatalogue(store);
}

function enquirySummaryLines(
  stats: WebEnquiryStats,
  whatsappCount: number,
  compare: EnquiryYearCompare
) {
  const lines = [
    `Web enquiries: ${stats.total} total, ${stats.thisWeek} this week, ${stats.thisMonth} this month, ${stats.needsReview} need review, ${stats.googleAds} from Google Ads.`,
    `WhatsApp enquiries: ${whatsappCount}.`,
    `Sources: ${stats.topSources.map((item) => `${item.label} ${item.count}`).join(", ") || "none"}.`,
    `Offices: ${stats.byOffice.map((item) => `${item.label} ${item.count}`).join(", ") || "none"}.`,
    `Google Ads groups: ${stats.googleAdsByReferrer.map((item) => `${item.label} ${item.count}`).join(", ") || "none"}.`,
  ];
  if (compare.compareYear != null) {
    const current = compare.ytdTotals[compare.compareYear] ?? 0;
    const prior =
      compare.priorYear != null
        ? (compare.ytdTotals[compare.priorYear] ?? 0)
        : null;
    lines.push(
      prior != null && compare.priorYear != null
        ? `Year to date ${compare.compareYear}: ${current}. Prior year ${compare.priorYear}: ${prior}.`
        : `Year to date ${compare.compareYear}: ${current}.`
    );
  }
  return lines;
}

/** Read-only catalogue for a member. Totals and titles only. */
export function formatMemberCatalogue(input: {
  events?: EventItem[];
  event_attendance?: EventAttendance[];
  tasks?: HubTask[];
  content?: Pick<ContentItem, "title" | "status" | "due_date" | "channel">[];
  resources?: { title: string; category?: string }[];
  enquiryLines?: string[];
  today?: string;
}) {
  const asOf = input.today ?? new Date().toISOString().slice(0, 10);
  const attendance = new Map<string, string[]>();
  for (const row of input.event_attendance ?? []) {
    const name = row.user_name.trim();
    if (!name) continue;
    const list = attendance.get(row.event_id) ?? [];
    list.push(`${name} (${row.attendance_status})`);
    attendance.set(row.event_id, list);
  }

  const events = [...(input.events ?? [])].sort((a, b) => {
    const byDate = (a.starts_at ?? "9999").localeCompare(b.starts_at ?? "9999");
    return byDate || a.title.localeCompare(b.title);
  });
  const eventLines = events.map((event) => {
    const start = day(event.starts_at) || "undated";
    const end = day(event.ends_at);
    const when = end && end !== start ? `${start} to ${end}` : start;
    const people = (attendance.get(event.id) ?? []).sort((a, b) =>
      a.localeCompare(b)
    );
    const box = event.pm_attending
      ? "We are attending checked"
      : "We are attending not checked";
    return [
      when,
      cell(event.title),
      cell(event.location),
      box,
      people.length ? people.join(", ") : "no named people",
    ].join(" | ");
  });

  const tasks = [...(input.tasks ?? [])].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const taskLines = tasks.map((task) =>
    [day(task.due_date) || "no due date", cell(task.title), cell(task.status)].join(
      " | "
    )
  );

  const content = (input.content ?? [])
    .filter(
      (item) => item.status === "scheduled" || item.status === "published"
    )
    .sort((a, b) => a.title.localeCompare(b.title));
  const contentLines = content.map((item) =>
    [
      day(item.due_date) || "no date",
      cell(item.title),
      cell(item.status),
      cell((item.channel ?? []).join(", ")),
    ].join(" | ")
  );

  const resources = [...(input.resources ?? [])].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const resourceLines = resources.map((item) =>
    [cell(item.title), cell(item.category)].join(" | ")
  );

  return [
    `Read-only hub catalogue as of ${asOf}. Answer from these totals and titles. Do not save records, and do not emit a hub-command block.`,
    "Enquiry rows are totals and sources only. Names, emails, phone numbers, and message text are not listed.",
    "Content lists scheduled and published titles only. Drafts, budget, contacts, and logins are not listed.",
    ...(input.enquiryLines ?? ["Enquiries: unavailable."]),
    ...section("Events", eventLines),
    ...section("Your tasks", taskLines),
    ...section("Content", contentLines),
    ...section("Library resources", resourceLines),
  ].join("\n");
}

/** Member assistant context: stats, their tasks, events, and published content. */
export async function memberAssistantReadContext(user: {
  id: string;
  fullName: string;
}) {
  const store = await readStore();
  const [web, whatsapp] = await Promise.all([
    listWebEnquiries(),
    listWhatsAppEnquiries(),
  ]);
  const stats = computeEnquiryStats(web);
  const compare = computeEnquiryYearCompare(web);
  const content = contentVisibleToMember(store.content ?? [], user.id).filter(
    (item) => item.status === "scheduled" || item.status === "published"
  );
  const tasks = (store.tasks ?? []).filter((task) =>
    ownerMatchesViewer(task.owner, task.owner_user_id, {
      id: user.id,
      fullName: user.fullName,
    })
  );
  return formatMemberCatalogue({
    events: store.events,
    event_attendance: store.event_attendance,
    tasks,
    content,
    resources: store.resources,
    enquiryLines: enquirySummaryLines(stats, whatsapp.length, compare),
  });
}
