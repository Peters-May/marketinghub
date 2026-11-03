import { createServiceClient } from "@/lib/supabase/admin";
import { HUB_HOW_TO_TOPICS } from "@/lib/ai/hub-how-to";
import { uid } from "@/lib/utils";
import type { KnowledgeAudience } from "@/lib/knowledge/audience";

export type HubHelpDocument = {
  id: string;
  title: string;
  body: string;
  source_url: string;
  active: boolean;
  sort_order: number;
  audience: "internal";
  created_at: string;
  updated_at: string;
};

function rowToHelp(row: Record<string, unknown>): HubHelpDocument {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    source_url: String(row.source_url ?? ""),
    active: row.active !== false,
    sort_order: Number(row.sort_order ?? 100) || 100,
    audience: "internal",
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function listHubHelpDocuments(): Promise<HubHelpDocument[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("hub_help_documents")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    // Table may not be migrated yet — fall back to static how-to seed.
    console.warn("[hub-help]", error.message);
    return seedHelpFromHowTo();
  }
  const rows = (data ?? []).map((r) => rowToHelp(r as Record<string, unknown>));
  if (rows.length === 0) return seedHelpFromHowTo();
  return rows;
}

function seedHelpFromHowTo(): HubHelpDocument[] {
  const now = new Date().toISOString();
  return HUB_HOW_TO_TOPICS.map((topic, index) => ({
    id: `help_${topic.id}`,
    title: topic.title,
    body: `${topic.summary}\n\n${topic.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nOpen: ${topic.href}`,
    source_url: topic.href,
    active: true,
    sort_order: index + 1,
    audience: "internal" as const,
    created_at: now,
    updated_at: now,
  }));
}

export async function upsertHubHelpDocument(input: {
  id?: string;
  title: string;
  body: string;
  source_url?: string;
  active?: boolean;
  sort_order?: number;
}): Promise<HubHelpDocument> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const id = input.id?.trim() || uid("help");
  const row = {
    id,
    title: input.title.trim(),
    body: input.body.trim(),
    source_url: (input.source_url ?? "").trim(),
    active: input.active !== false,
    sort_order: input.sort_order ?? 100,
    updated_at: now,
    ...(input.id ? {} : { created_at: now }),
  };
  const { data, error } = await supabase
    .from("hub_help_documents")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToHelp(data as Record<string, unknown>);
}

export async function deleteHubHelpDocument(id: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("hub_help_documents")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export type KnowledgeOverview = {
  audience: KnowledgeAudience;
  pages_indexed: number;
  pages_active: number;
  documents_active: number;
  suggestions_pending: number;
  last_sync_hint: string;
};

export async function publicKnowledgeOverview(): Promise<
  Omit<KnowledgeOverview, "audience"> & { audience: "public" }
> {
  const supabase = createServiceClient();
  const { data: docs } = await supabase
    .from("chat_kb_documents")
    .select("id,active,updated_at")
    .limit(2000);
  const rows = docs ?? [];
  const site = rows.filter((r) => String(r.id).startsWith("kb_site_"));
  const manual = rows.filter((r) => !String(r.id).startsWith("kb_site_"));
  const { count: pending } = await supabase
    .from("chat_kb_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const latest = rows
    .map((r) => String(r.updated_at ?? ""))
    .filter(Boolean)
    .sort()
    .at(-1);
  return {
    audience: "public",
    pages_indexed: site.length,
    pages_active: site.filter((r) => r.active !== false).length,
    documents_active: manual.filter((r) => r.active !== false).length,
    suggestions_pending: pending ?? 0,
    last_sync_hint: latest || "Never",
  };
}
