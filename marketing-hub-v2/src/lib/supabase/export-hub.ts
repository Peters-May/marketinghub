import type { HubStore } from "@/lib/types";
import { DEFAULT_CLOTHING_LOGO } from "@/lib/merch/north-sails";
import { createServiceClient } from "@/lib/supabase/admin";
import { readStore } from "@/lib/store/local";
import { formatChannels } from "@/lib/data/normalize";

export type ExportResult = {
  events: number;
  content: number;
  sponsorships: number;
  contacts: number;
  resources: number;
  themes: number;
  theme_mains: number;
  theme_offshoots: number;
  awards: number;
  tasks: number;
  merch_orders: number;
  staff_requests: number;
  reports: number;
};

const BATCH = 200;

async function upsertBatch(
  table: string,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (!rows.length) return 0;
  const client = createServiceClient();
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await client.from(table).upsert(chunk, { onConflict: "id" });
    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }
  }
  return rows.length;
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, 10);
}

/** Push the local hub store into durable Supabase hub tables. */
export async function exportStoreToSupabase(
  store?: HubStore
): Promise<ExportResult> {
  const data = store ?? (await readStore());

  const events = await upsertBatch(
    "events",
    data.events.map((e) => ({
      id: e.id,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      location: e.location ?? "",
      event_type: e.event_type ?? "Event",
      division: e.division ?? "",
      notes: e.notes ?? "",
      link_url: e.link_url ?? "",
      social_media_post_completed: e.social_media_post_completed ?? false,
      personal_social_media_graphics_completed:
        e.personal_social_media_graphics_completed ?? false,
      reached_out_for_pr_to_organisers:
        e.reached_out_for_pr_to_organisers ?? false,
      transport_relevant: e.transport_relevant === true,
      show_in_transport_planner: e.show_in_transport_planner === true,
      planner_category: e.planner_category ?? "",
      recommended_arrival_start: dateOnly(e.recommended_arrival_start),
      recommended_arrival_end: dateOnly(e.recommended_arrival_end),
      transport_destination_region: e.transport_destination_region ?? "",
      transport_destination_port: e.transport_destination_port ?? "",
      transport_origin_regions: e.transport_origin_regions ?? [],
      planner_priority: e.planner_priority ?? "standard",
      date_status: e.date_status ?? "confirmed",
      recurring_event: e.recurring_event === true,
      event_series_id: e.event_series_id ?? "",
      planner_slug: e.planner_slug ?? "",
      pm_attendance: e.pm_attendance ?? "",
      created_by: e.created_by,
      created_at: e.created_at,
      updated_at: e.updated_at,
    }))
  );

  const content = await upsertBatch(
    "content_items",
    data.content.map((c) => ({
      id: c.id,
      title: c.title,
      channel: formatChannels(c.channel),
      content_type: c.content_type ?? "Social",
      owner: c.owner ?? "",
      due_date: dateOnly(c.due_date),
      deadline_date: dateOnly(c.deadline_date),
      status: c.status,
      category: c.category ?? "",
      priority: c.priority ?? "",
      website: c.website ?? "",
      caption: c.caption ?? "",
      theme_id: c.theme_id ?? "",
      planable_url: c.planable_url ?? "",
      planable_post_id: c.planable_post_id ?? "",
      planable_group_id: c.planable_group_id ?? "",
      planable_page_ids: Array.isArray(c.planable_page_ids)
        ? c.planable_page_ids
        : [],
      last_synced_at: c.last_synced_at ?? null,
      sync_source: c.sync_source ?? "",
      asset_url: c.asset_url ?? "",
      notes: c.notes ?? "",
      created_at: c.created_at,
      updated_at: c.updated_at,
    }))
  );

  const sponsorships = await upsertBatch(
    "sponsorships",
    data.sponsorships.map((s) => ({
      id: s.id,
      kind: s.kind ?? "sponsorship",
      partner: s.partner,
      package_name: s.package_name ?? "",
      starts_at: dateOnly(s.starts_at),
      ends_at: dateOnly(s.ends_at),
      value: s.value ?? "",
      status: s.status,
      deliverables: s.deliverables ?? "",
      owner: s.owner ?? "",
      onedrive_url: s.onedrive_url ?? "",
      notes: s.notes ?? "",
      created_at: s.created_at,
      updated_at: s.updated_at,
    }))
  );

  const contacts = await upsertBatch(
    "contacts",
    data.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      organisation: c.organisation ?? "",
      role: c.role ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      tags: c.tags ?? [],
      notes: c.notes ?? "",
      created_at: c.created_at,
      updated_at: c.updated_at,
    }))
  );

  const resources = await upsertBatch(
    "resource_links",
    data.resources.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      url: r.url,
      category: r.category ?? "General",
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
  );

  const themes = await upsertBatch(
    "quarterly_themes",
    data.themes.map((t) => ({
      id: t.id,
      title: t.title,
      quarter: t.quarter,
      year: t.year,
      status: t.status,
      summary: t.summary ?? "",
      created_at: t.created_at,
      updated_at: t.updated_at,
    }))
  );

  const theme_mains = await upsertBatch(
    "theme_main_content",
    data.theme_mains.map((m) => ({
      id: m.id,
      theme_id: m.theme_id,
      content_id: m.content_id ?? null,
      title: m.title,
      channel: m.channel ?? "",
      owner: m.owner ?? "",
      status: m.status,
      notes: m.notes ?? "",
      created_at: m.created_at,
      updated_at: m.updated_at,
    }))
  );

  const theme_offshoots = await upsertBatch(
    "theme_offshoots",
    data.theme_offshoots.map((o) => ({
      id: o.id,
      main_content_id: o.main_content_id,
      title: o.title,
      channel: o.channel ?? "",
      owner: o.owner ?? "",
      status: o.status,
      notes: o.notes ?? "",
      created_at: o.created_at,
      updated_at: o.updated_at,
    }))
  );

  const awards = await upsertBatch(
    "award_entries",
    data.awards.map((a) => ({
      id: a.id,
      title: a.title,
      organisation: a.organisation ?? "",
      category: a.category ?? "",
      year: a.year,
      status: a.status,
      ceremony_at: dateOnly(a.ceremony_at),
      owner: a.owner ?? "",
      event_id: a.event_id,
      notes: a.notes ?? "",
      created_at: a.created_at,
      updated_at: a.updated_at,
    }))
  );

  const tasks = await upsertBatch(
    "hub_tasks",
    data.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      details: t.details ?? "",
      due_date: dateOnly(t.due_date),
      category: t.category ?? "",
      status: t.status,
      owner: t.owner ?? "",
      created_at: t.created_at,
      updated_at: t.updated_at,
    }))
  );

  const merch_orders = await upsertBatch(
    "merch_orders",
    data.merch_orders.map((m) => ({
      id: m.id,
      item: m.item,
      fit: m.fit === "male" || m.fit === "female" ? m.fit : "",
      size: m.size ?? "",
      quantity: m.quantity ?? 1,
      colour: m.colour ?? "",
      logo: m.logo ?? DEFAULT_CLOTHING_LOGO,
      items: m.items ?? [],
      requested_for: m.requested_for ?? "",
      requested_for_contact_id: m.requested_for_contact_id ?? null,
      office: m.office ?? "",
      needed_by: dateOnly(m.needed_by),
      status: m.status,
      notes: m.notes ?? "",
      created_by: m.created_by ?? "",
      created_at: m.created_at,
      updated_at: m.updated_at,
    }))
  );

  const staff_requests = await upsertBatch(
    "staff_requests",
    data.staff_requests.map((s) => ({
      id: s.id,
      kind: s.kind,
      category: s.category ?? "",
      title: s.title,
      details: s.details ?? "",
      requested_by: s.requested_by ?? "",
      needed_by: dateOnly(s.needed_by),
      attachment_url: s.attachment_url ?? "",
      status: s.status,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }))
  );

  const reports = await upsertBatch(
    "report_links",
    data.reports.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      url: r.url ?? "",
      category: r.category ?? "",
      tool: r.tool ?? "",
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
  );

  return {
    events,
    content,
    sponsorships,
    contacts,
    resources,
    themes,
    theme_mains,
    theme_offshoots,
    awards,
    tasks,
    merch_orders,
    staff_requests,
    reports,
  };
}
