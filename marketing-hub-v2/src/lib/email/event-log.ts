import { createServiceClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import type { EmailEvent, EmailEventKind } from "@/lib/types";

const TABLE = "hub_email_events";
const KINDS = new Set<EmailEventKind>([
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
]);

function asKind(value: string): EmailEventKind | null {
  return KINDS.has(value as EmailEventKind) ? (value as EmailEventKind) : null;
}

/** Insert send and tracking rows without rewriting the hub document. */
export async function insertEmailEventRows(items: EmailEvent[]): Promise<void> {
  if (!hasServiceRoleKey() || items.length === 0) return;
  const supabase = createServiceClient();
  const rows = items.map((item) => ({
    id: item.id,
    campaign_id: item.campaign_id,
    contact_id: item.contact_id,
    email: item.email,
    kind: item.kind,
    resend_message_id: item.resend_message_id,
    meta: item.meta,
    link: item.link ?? "",
    user_agent: item.user_agent ?? "",
    created_at: item.created_at,
  }));
  const { error } = await supabase.from(TABLE).insert(rows);
  if (!error) return;
  if (error.code !== "23505") {
    throw new Error(error.message);
  }
  for (const row of rows) {
    const one = await supabase.from(TABLE).insert(row);
    if (one.error && one.error.code !== "23505") {
      throw new Error(one.error.message);
    }
  }
}

const PAGE_SIZE = 1000;
/** Matches the old single-query cap for report reads. */
const MAX_EVENT_ROWS = 10000;

type Page<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Read every page of a query. PostgREST caps one response (1,000 rows by
 * default), so one big .limit() silently drops rows. Throws on any error.
 */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
  maxRows = Number.POSITIVE_INFINITY
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, maxRows) - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

/**
 * Every address with a sent event for the campaign. Sends use it to skip
 * people already mailed, so it reads all pages and throws rather than
 * returning a partial list that would cause re-sends.
 */
export async function listSentEmailRows(campaignId: string): Promise<string[]> {
  if (!hasServiceRoleKey()) return [];
  const supabase = createServiceClient();
  const rows = await readAllPages<{ email: string | null }>((from, to) =>
    supabase
      .from(TABLE)
      .select("email")
      .eq("campaign_id", campaignId)
      .eq("kind", "sent")
      .order("id", { ascending: true })
      .range(from, to)
  );
  return rows
    .map((row) => String(row.email ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export async function listEmailEventRows(campaignId?: string): Promise<EmailEvent[]> {
  if (!hasServiceRoleKey()) return [];
  const supabase = createServiceClient();
  let data: Array<Record<string, unknown>>;
  try {
    data = await readAllPages<Record<string, unknown>>((from, to) => {
      let query = supabase
        .from(TABLE)
        .select(
          "id, campaign_id, contact_id, email, kind, resend_message_id, meta, link, user_agent, created_at"
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
      if (campaignId) query = query.eq("campaign_id", campaignId);
      return query.range(from, to);
    }, MAX_EVENT_ROWS);
  } catch (err) {
    console.error("[email-events]", err instanceof Error ? err.message : err);
    return [];
  }
  const rows: EmailEvent[] = [];
  for (const row of data) {
    const kind = asKind(String(row.kind ?? ""));
    if (!kind) continue;
    rows.push({
      id: String(row.id),
      campaign_id: String(row.campaign_id),
      contact_id: row.contact_id ? String(row.contact_id) : null,
      email: String(row.email ?? ""),
      kind,
      resend_message_id: String(row.resend_message_id ?? ""),
      meta: String(row.meta ?? ""),
      link: String(row.link ?? ""),
      user_agent: String(row.user_agent ?? ""),
      created_at: String(row.created_at ?? ""),
    });
  }
  return rows;
}
