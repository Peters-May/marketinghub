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

export async function listEmailEventRows(campaignId?: string): Promise<EmailEvent[]> {
  if (!hasServiceRoleKey()) return [];
  const supabase = createServiceClient();
  let query = supabase
    .from(TABLE)
    .select(
      "id, campaign_id, contact_id, email, kind, resend_message_id, meta, link, user_agent, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(10000);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data, error } = await query;
  if (error) {
    console.error("[email-events]", error.message);
    return [];
  }
  const rows: EmailEvent[] = [];
  for (const row of data ?? []) {
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
