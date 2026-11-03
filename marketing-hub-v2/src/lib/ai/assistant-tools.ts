import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { searchHubHowTo, howToForPath } from "@/lib/ai/hub-how-to";
import { ownerMatchesViewer } from "@/lib/identity/owners";
import { contentVisibleToMember } from "@/lib/social/suggest";
import { costTotalsByCurrency, costsSheetPath } from "@/lib/events/costs";
import { readStore } from "@/lib/store/local";
import { computeEnquiryStats } from "@/lib/data/web-enquiries-stats";
import { listWebEnquiries } from "@/lib/data/web-enquiries";
import { listWhatsAppEnquiries } from "@/lib/data/whatsapp-enquiries";

const ROW_CAP = 40;

export type AssistantToolUser = {
  id: string;
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
  includeBudget?: boolean;
  readOnly?: boolean;
};

function day(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function matchesQuery(haystack: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Pure helpers — unit-tested without calling the model. */
export async function toolSearchEvents(input: {
  query?: string;
  upcomingOnly?: boolean;
  limit?: number;
}) {
  const store = await readStore();
  const limit = Math.min(input.limit ?? 20, ROW_CAP);
  const today = todayIso();
  let events = [...(store.events ?? [])];
  if (input.upcomingOnly) {
    events = events.filter(
      (e) => !e.starts_at || e.starts_at.slice(0, 10) >= today
    );
  }
  if (input.query?.trim()) {
    events = events.filter((e) =>
      matchesQuery(
        `${e.title} ${e.location} ${e.event_type} ${e.notes}`,
        input.query!
      )
    );
  }
  events.sort((a, b) =>
    (a.starts_at ?? "9999").localeCompare(b.starts_at ?? "9999")
  );
  return {
    source: "hub_store.events",
    count: events.length,
    items: events.slice(0, limit).map((e) => ({
      id: e.id,
      title: e.title,
      starts_at: day(e.starts_at),
      ends_at: day(e.ends_at),
      location: e.location,
      event_type: e.event_type,
      pm_attending: e.pm_attending,
      href: `/app/events?event=${encodeURIComponent(e.id)}`,
    })),
  };
}

export async function toolEventOutstanding(input: {
  eventQuery: string;
  user?: AssistantToolUser;
}) {
  const store = await readStore();
  const q = input.eventQuery.trim().toLowerCase();
  const event =
    store.events.find((e) => e.id === q) ||
    store.events.find((e) => e.title.toLowerCase() === q) ||
    store.events.find((e) => e.title.toLowerCase().includes(q));
  if (!event) {
    return {
      source: "hub_store",
      found: false,
      message: `No event matched “${input.eventQuery}”.`,
    };
  }

  const attendance = (store.event_attendance ?? []).filter(
    (a) => a.event_id === event.id
  );
  const costs = (store.event_cost_lines ?? []).filter(
    (c) => c.event_id === event.id
  );
  const links = (store.event_content ?? []).filter(
    (l) => l.event_id === event.id
  );
  const contentIds = new Set(links.map((l) => l.content_id));
  let content = (store.content ?? []).filter((c) => contentIds.has(c.id));
  let tasks = (store.tasks ?? []).filter(
    (t) => t.related_type === "event" && t.related_id === event.id
  );
  if (input.user?.readOnly) {
    tasks = tasks.filter((t) =>
      ownerMatchesViewer(t.owner, t.owner_user_id, {
        id: input.user!.id,
        fullName: input.user!.fullName ?? "",
      })
    );
    const visibleIds = new Set(
      contentVisibleToMember(store.content ?? [], input.user.id).map((c) => c.id)
    );
    content = content.filter((c) => visibleIds.has(c.id));
  }
  const openTasks = tasks.filter(
    (t) => !["done", "cancelled", "complete"].includes(t.status.toLowerCase())
  );
  const totals = costTotalsByCurrency(costs);

  return {
    source: "hub_store (event + attendance + costs + tasks + linked content)",
    found: true,
    event: {
      id: event.id,
      title: event.title,
      starts_at: day(event.starts_at),
      ends_at: day(event.ends_at),
      location: event.location,
      pm_attending: event.pm_attending,
      href: costsSheetPath(event.id).replace("&costs=1", ""),
      costs_href: costsSheetPath(event.id),
      checklist: {
        hotel_booked: event.hotel_booked,
        costs_collected: event.costs_collected,
        stand_or_passes_booked: event.stand_or_passes_booked,
        press_kit_ready: event.press_kit_ready,
        social_media_post_completed: event.social_media_post_completed,
      },
    },
    attendance: attendance.map((a) => ({
      name: a.user_name,
      status: a.attendance_status,
    })),
    open_tasks: openTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      due_date: day(t.due_date),
      owner: t.owner,
      href: `/app/tasks`,
    })),
    linked_content: content.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      due_date: day(c.due_date),
      href: `/app/content`,
    })),
    costs: {
      line_count: costs.length,
      totals_by_currency: totals,
      lines: costs.slice(0, ROW_CAP).map((c) => ({
        category: c.category,
        description: c.description,
        amount: c.amount,
        currency: c.currency,
        staff_name: c.staff_name,
      })),
    },
  };
}

export async function toolSearchTasks(input: {
  query?: string;
  overdueOnly?: boolean;
  status?: string;
  user?: AssistantToolUser;
  limit?: number;
}) {
  const store = await readStore();
  const limit = Math.min(input.limit ?? 20, ROW_CAP);
  const today = todayIso();
  let tasks = [...(store.tasks ?? [])];
  if (input.user?.readOnly) {
    tasks = tasks.filter((t) =>
      ownerMatchesViewer(t.owner, t.owner_user_id, {
        id: input.user!.id,
        fullName: input.user!.fullName ?? "",
      })
    );
  }
  if (input.status?.trim()) {
    const status = input.status.trim().toLowerCase();
    tasks = tasks.filter((t) => t.status.toLowerCase() === status);
  }
  if (input.overdueOnly) {
    tasks = tasks.filter((t) => {
      const due = day(t.due_date);
      if (!due) return false;
      const done = ["done", "cancelled", "complete"].includes(
        t.status.toLowerCase()
      );
      return !done && due < today;
    });
  }
  if (input.query?.trim()) {
    tasks = tasks.filter((t) =>
      matchesQuery(`${t.title} ${t.details} ${t.owner}`, input.query!)
    );
  }
  tasks.sort((a, b) =>
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
  );
  return {
    source: "hub_store.tasks",
    count: tasks.length,
    items: tasks.slice(0, limit).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      due_date: day(t.due_date),
      owner: t.owner,
      related_type: t.related_type || null,
      related_id: t.related_id,
      href: `/app/tasks`,
    })),
  };
}

export async function toolSearchContent(input: {
  query?: string;
  status?: string;
  awaitingApproval?: boolean;
  user?: AssistantToolUser;
  limit?: number;
}) {
  const store = await readStore();
  const limit = Math.min(input.limit ?? 20, ROW_CAP);
  let content = [...(store.content ?? [])];
  if (input.user?.readOnly) {
    content = contentVisibleToMember(content, input.user.id);
  }
  if (input.awaitingApproval) {
    content = content.filter((c) =>
      /draft|review|approval|pending|awaiting/i.test(c.status)
    );
  }
  if (input.status?.trim()) {
    const status = input.status.trim().toLowerCase();
    content = content.filter((c) => c.status.toLowerCase() === status);
  }
  if (input.query?.trim()) {
    content = content.filter((c) =>
      matchesQuery(
        `${c.title} ${c.caption} ${c.status} ${(c.channel ?? []).join(" ")}`,
        input.query!
      )
    );
  }
  content.sort((a, b) =>
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
  );
  return {
    source: "hub_store.content",
    count: content.length,
    items: content.slice(0, limit).map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      channel: c.channel,
      due_date: day(c.due_date),
      owner: c.owner,
      href: `/app/content`,
    })),
  };
}

export async function toolEventCosts(input: {
  eventQuery: string;
  year?: number;
}) {
  const store = await readStore();
  if (input.year && !input.eventQuery.trim()) {
    const year = String(input.year);
    const eventIds = new Set(
      store.events
        .filter((e) => e.starts_at?.startsWith(year))
        .map((e) => e.id)
    );
    const lines = (store.event_cost_lines ?? []).filter((c) =>
      eventIds.has(c.event_id)
    );
    return {
      source: "hub_store.event_cost_lines",
      scope: `events starting in ${year}`,
      line_count: lines.length,
      totals_by_currency: costTotalsByCurrency(lines),
      href: `/app/events`,
    };
  }
  return toolEventOutstanding({ eventQuery: input.eventQuery }).then((r) => {
    if (!("found" in r) || !r.found) return r;
    return {
      source: "hub_store.event_cost_lines",
      event: r.event,
      ...r.costs,
    };
  });
}

export async function toolSearchCampaigns(input: {
  query?: string;
  limit?: number;
  user?: AssistantToolUser;
}) {
  if (input.user?.readOnly) {
    return {
      source: "hub_store",
      denied: true,
      message: "Campaign lists are available to admins.",
    };
  }
  const store = await readStore();
  const limit = Math.min(input.limit ?? 20, ROW_CAP);
  let paid = [...(store.paid_campaigns ?? [])];
  let email = [...(store.email_campaigns ?? [])];
  if (input.query?.trim()) {
    paid = paid.filter((c) =>
      matchesQuery(`${c.name} ${c.platform} ${c.status}`, input.query!)
    );
    email = email.filter((c) =>
      matchesQuery(`${c.title} ${c.subject} ${c.status}`, input.query!)
    );
  }
  return {
    source: "hub_store.paid_campaigns + email_campaigns",
    paid: {
      count: paid.length,
      items: paid.slice(0, limit).map((c) => ({
        id: c.id,
        name: c.name,
        platform: c.platform,
        status: c.status,
        spent_gbp: c.spent,
        href: `/app/reports`,
      })),
    },
    email: {
      count: email.length,
      items: email.slice(0, limit).map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        subject: c.subject,
        href: `/app/email`,
      })),
    },
  };
}

export async function toolSearchContacts(input: {
  query: string;
  limit?: number;
  user?: AssistantToolUser;
}) {
  if (input.user?.readOnly) {
    return {
      source: "contacts",
      denied: true,
      message: "Contact search is not available in member mode.",
    };
  }
  const q = input.query.trim().toLowerCase();
  if (q.length < 2) {
    return { source: "contacts", message: "Provide at least 2 characters." };
  }
  const store = await readStore();
  const limit = Math.min(input.limit ?? 15, ROW_CAP);
  const contacts = (store.contacts ?? []) as Array<Record<string, unknown>>;
  const matched = contacts.filter((c) => {
    const hay = [
      c.name,
      c.full_name,
      c.email,
      c.company,
      c.organisation,
      c.country,
    ]
      .filter((v) => typeof v === "string")
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  return {
    source: "hub_store.contacts",
    count: matched.length,
    items: matched.slice(0, limit).map((c) => ({
      id: String(c.id ?? ""),
      name: String(c.name ?? c.full_name ?? ""),
      email: typeof c.email === "string" ? c.email : "",
      company: String(c.company ?? c.organisation ?? ""),
      href: `/app/contacts`,
    })),
  };
}

export async function toolBudgetSummary(input: { user?: AssistantToolUser }) {
  if (!input.user?.includeBudget) {
    return {
      source: "hub_store.budget_lines",
      denied: true,
      message: "Budget data is not available for this account.",
    };
  }
  const store = await readStore();
  const lines = store.budget_lines ?? [];
  const payments = store.budget_payments ?? [];
  const planned = lines.reduce((sum, l) => sum + (Number(l.planned) || 0), 0);
  const spent = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  return {
    source: "hub_store.budget_lines + budget_payments",
    line_count: lines.length,
    payment_count: payments.length,
    planned_total: planned,
    payment_total: spent,
    href: `/app/budget`,
    lines: lines.slice(0, ROW_CAP).map((l) => ({
      name: l.name,
      group: l.group,
      planned: l.planned,
    })),
  };
}

export async function toolEnquiryStats(input: { user?: AssistantToolUser }) {
  const web = await listWebEnquiries();
  const whatsapp = await listWhatsAppEnquiries();
  const stats = computeEnquiryStats(web);
  return {
    source: "web_enquiries + whatsapp_enquiries (aggregates only)",
    web: {
      total: stats.total,
      thisWeek: stats.thisWeek,
      thisMonth: stats.thisMonth,
      needsReview: stats.needsReview,
      googleAds: stats.googleAds,
    },
    whatsapp_count: whatsapp.length,
    href: `/app/enquiries`,
    note: input.user?.readOnly
      ? "Message bodies and contact details are not included."
      : "Use Enquiries page for message detail.",
  };
}

export async function toolSearchAwards(input: {
  query?: string;
  limit?: number;
  user?: AssistantToolUser;
}) {
  if (input.user?.readOnly) {
    return {
      source: "awards",
      denied: true,
      message: "Awards detail is available to admins.",
    };
  }
  const store = await readStore();
  const limit = Math.min(input.limit ?? 20, ROW_CAP);
  let awards = [...(store.awards ?? [])];
  if (input.query?.trim()) {
    awards = awards.filter((a) =>
      matchesQuery(
        `${a.title} ${a.organisation} ${a.category} ${a.status}`,
        input.query!
      )
    );
  }
  return {
    source: "hub_store.awards",
    count: awards.length,
    items: awards.slice(0, limit).map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      year: a.year,
      href: `/app/awards`,
    })),
  };
}

export function toolHubHowTo(input: {
  query: string;
  pathname?: string | null;
}) {
  const topics = searchHubHowTo(input.query, 5);
  const page = howToForPath(input.pathname);
  return {
    source: "hub_how_to + nav",
    page: page
      ? {
          label: page.label,
          href: page.href,
          description: page.description,
        }
      : null,
    topics: topics.map((t) => ({
      title: t.title,
      href: t.href,
      summary: t.summary,
      steps: t.steps,
    })),
  };
}

export function buildAssistantTools(user: AssistantToolUser): ToolSet {
  const withUser = { user };
  return {
    search_events: tool({
      description:
        "Search Marketing Hub events. Use upcomingOnly for future shows. Cite source and hrefs.",
      inputSchema: z.object({
        query: z.string().optional(),
        upcomingOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(ROW_CAP).optional(),
      }),
      execute: async (input) => toolSearchEvents(input),
    }),
    event_outstanding: tool({
      description:
        "Load one event with attendance, open tasks, linked content, and cost lines. Use for questions like what is outstanding for a show.",
      inputSchema: z.object({
        eventQuery: z.string().describe("Event title fragment or id"),
      }),
      execute: async (input) =>
        toolEventOutstanding({ ...input, ...withUser }),
    }),
    event_costs: tool({
      description:
        "Event cost lines and totals. Pass eventQuery for one event, or year for all costs on events starting that year.",
      inputSchema: z.object({
        eventQuery: z.string().optional().default(""),
        year: z.number().int().optional(),
      }),
      execute: async (input) => toolEventCosts(input),
    }),
    search_tasks: tool({
      description:
        "Search tasks. Use overdueOnly for past-due open tasks. Members only see their own.",
      inputSchema: z.object({
        query: z.string().optional(),
        overdueOnly: z.boolean().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(ROW_CAP).optional(),
      }),
      execute: async (input) => toolSearchTasks({ ...input, ...withUser }),
    }),
    search_content: tool({
      description:
        "Search social/content posts. awaitingApproval finds draft/review statuses.",
      inputSchema: z.object({
        query: z.string().optional(),
        status: z.string().optional(),
        awaitingApproval: z.boolean().optional(),
        limit: z.number().int().min(1).max(ROW_CAP).optional(),
      }),
      execute: async (input) => toolSearchContent({ ...input, ...withUser }),
    }),
    search_campaigns: tool({
      description: "List paid media and email campaigns (admin).",
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().min(1).max(ROW_CAP).optional(),
      }),
      execute: async (input) => toolSearchCampaigns({ ...input, ...withUser }),
    }),
    search_contacts: tool({
      description: "Search contacts by name, email, or company (admin).",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(ROW_CAP).optional(),
      }),
      execute: async (input) => toolSearchContacts({ ...input, ...withUser }),
    }),
    budget_summary: tool({
      description: "Budget planned totals and payments when the user has budget access.",
      inputSchema: z.object({}),
      execute: async () => toolBudgetSummary(withUser),
    }),
    enquiry_stats: tool({
      description: "Aggregate enquiry statistics only (no message bodies).",
      inputSchema: z.object({}),
      execute: async () => toolEnquiryStats(withUser),
    }),
    search_awards: tool({
      description: "Search awards entries (admin).",
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().min(1).max(ROW_CAP).optional(),
      }),
      execute: async (input) => toolSearchAwards({ ...input, ...withUser }),
    }),
    hub_how_to: tool({
      description:
        "How to use the Marketing Hub: navigation, workflows, and what the current page is for.",
      inputSchema: z.object({
        query: z.string(),
        pathname: z.string().optional(),
      }),
      execute: async (input) => toolHubHowTo(input),
    }),
  };
}
