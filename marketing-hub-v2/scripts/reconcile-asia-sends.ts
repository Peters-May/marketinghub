import { createRequire } from "node:module";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(fileURLToPath(import.meta.url));
const react = require("react") as { cache?: unknown };
if (typeof react.cache !== "function") react.cache = (fn: unknown) => fn;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[t.slice(0, i).trim()] = val;
  }
}

async function main() {
  const { Resend } = await import("resend");
  const { createClient } = await import("@supabase/supabase-js");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const since = Date.parse("2026-10-19T10:41:00.000Z");
  const recent: { id: string; to: string; created_at: string }[] = [];
  let page: string | undefined;
  for (let n = 0; n < 8; n += 1) {
    const result = await resend.emails.list({ limit: 100 });
    if (result.error) throw new Error(result.error.message);
    const payload = result.data as { data?: unknown[]; has_more?: boolean } | unknown[] | null;
    const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);
    if (n === 0) {
      const first = (rows[0] ?? {}) as Record<string, unknown>;
      console.log(JSON.stringify({
        rowCount: rows.length,
        rowKeys: Object.keys(first),
        created: first.created_at ?? null,
      }));
    }
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows as Array<{ id?: string; to?: string | string[]; created_at?: string; subject?: string }>) {
      const created = Date.parse(String(row.created_at ?? ""));
      if (!row.id || Number.isNaN(created) || created < since) continue;
      if (!String(row.subject ?? "").includes("Asia to the Americas")) continue;
      const to = Array.isArray(row.to) ? row.to[0] : row.to;
      if (!to) continue;
      recent.push({ id: row.id, to: to.trim().toLowerCase(), created_at: new Date(created).toISOString() });
    }
    const hasMore = (result.data as { has_more?: boolean } | null)?.has_more;
    page = (result.data as { next?: string } | null)?.next;
    if (!hasMore) break;
    if (!page) break;
  }
  const { data: existing, error } = await supabase
    .from("hub_email_events")
    .select("email")
    .eq("campaign_id", "ecamp_asia_americas")
    .eq("kind", "sent");
  if (error) throw new Error(error.message);
  const known = new Set((existing ?? []).map((row) => String(row.email)));
  const missing = recent.filter((row) => !known.has(row.to));
  if (missing.length > 0) {
    const { error: insertError } = await supabase.from("hub_email_events").insert(
      missing.map((row) => ({
        id: `eevt_${row.id}`,
        campaign_id: "ecamp_asia_americas",
        contact_id: null,
        email: row.to,
        kind: "sent",
        resend_message_id: row.id,
        meta: "reconciled",
        link: "",
        user_agent: "",
        created_at: row.created_at,
      }))
    );
    if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
  }
  console.log(JSON.stringify({ recent: recent.length, missing: missing.length, known: known.size }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
