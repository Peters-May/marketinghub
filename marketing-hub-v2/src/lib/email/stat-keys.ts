import { createServiceClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import type { EmailEventKind } from "@/lib/types";
import { readAllPages } from "@/lib/email/event-log";

const TABLE = "hub_email_events";
const STAT_KEY_MAX = 250_000;
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

export type EmailStatKey = {
  campaign_id: string;
  email: string;
  kind: EmailEventKind;
};

/** Address and kind for every stored event, used to fill list counters. */
export async function listEmailStatKeyRows(): Promise<EmailStatKey[]> {
  if (!hasServiceRoleKey()) return [];
  const supabase = createServiceClient();
  let data: Array<{
    campaign_id: string | null;
    email: string | null;
    kind: string | null;
  }>;
  try {
    data = await readAllPages((from, to) =>
      supabase
        .from(TABLE)
        .select("campaign_id, email, kind")
        .order("id", { ascending: true })
        .range(from, to),
      STAT_KEY_MAX
    );
  } catch (err) {
    console.error("[email-events]", err instanceof Error ? err.message : err);
    return [];
  }
  const rows: EmailStatKey[] = [];
  for (const row of data) {
    const kind = asKind(String(row.kind ?? ""));
    const campaignId = String(row.campaign_id ?? "");
    if (!kind || !campaignId) continue;
    rows.push({
      campaign_id: campaignId,
      email: String(row.email ?? ""),
      kind,
    });
  }
  return rows;
}

/** True when this address already has this kind of event on the campaign. */
export async function hasEmailEventRow(
  campaignId: string,
  email: string,
  kind: EmailEventKind
): Promise<boolean> {
  if (!hasServiceRoleKey() || !campaignId || !email) return false;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("kind", kind)
    .eq("email", email)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
