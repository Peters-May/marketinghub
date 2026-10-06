/**
 * Replay Hub campaign sends and suppressions to the Portal.
 * The Portal treats a repeated send for the same contact and campaign as success.
 *
 * Requires .env.local (or process env):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   PORTAL_BASE_URL, PORTAL_ENQUIRY_SYNC_SECRET
 *
 * Usage:
 *   node scripts/backfill-portal-marketing.mjs
 *   node scripts/backfill-portal-marketing.mjs --limit=50
 *   node scripts/backfill-portal-marketing.mjs --dry-run
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const fileEnv = {
  ...loadEnv(path.join(root, ".env.local")),
  ...loadEnv(path.join(root, ".env")),
};
const env = { ...fileEnv, ...process.env };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 500;

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const portalBase = (env.PORTAL_BASE_URL ?? "").trim().replace(/\/+$/, "");
const portalSecret = (env.PORTAL_ENQUIRY_SYNC_SECRET ?? "").trim();
const hubOrigin = (env.NEXT_PUBLIC_APP_URL ?? "https://marketing.petersandmay.com")
  .trim()
  .replace(/\/+$/, "");

if (!supabaseUrl || !serviceKey) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!dryRun && (!portalBase || !portalSecret)) {
  console.error("Need PORTAL_BASE_URL and PORTAL_ENQUIRY_SYNC_SECRET (or --dry-run)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function postPortal(body) {
  if (dryRun) return { ok: true };
  const res = await fetch(`${portalBase}/api/marketing/hub-sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${portalSecret}`,
      "X-Webhook-Secret": portalSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.slice(0, 300) || `Portal HTTP ${res.status}`);
  }
  return { ok: true };
}

const { data, error } = await supabase
  .from("hub_store")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();

if (error) {
  console.error(error.message);
  process.exit(1);
}

const store = data?.payload ?? {};
const contacts = Array.isArray(store.contacts) ? store.contacts : [];
const campaigns = Array.isArray(store.email_campaigns) ? store.email_campaigns : [];
const events = Array.isArray(store.email_events) ? store.email_events : [];
const suppressions = Array.isArray(store.email_suppressions) ? store.email_suppressions : [];

function contactFor(email, contactId) {
  const normalized = String(email || "").trim().toLowerCase();
  return (
    contacts.find((item) => item.id === contactId) ||
    contacts.find((item) => String(item.email || "").trim().toLowerCase() === normalized)
  );
}

let posted = 0;
let skipped = 0;

for (const event of events) {
  if (posted >= limit) break;
  if (event.kind !== "sent") continue;
  const contact = contactFor(event.email, event.contact_id);
  if (!contact?.portal_contact_id) {
    skipped += 1;
    continue;
  }
  const campaign = campaigns.find((item) => item.id === event.campaign_id);
  await postPortal({
    event: "send",
    contact_id: contact.portal_contact_id,
    email: String(contact.email || event.email || "").trim().toLowerCase(),
    hub_campaign_id: event.campaign_id,
    campaign_title: campaign?.title || "Marketing email",
    campaign_url: `${hubOrigin}/app/email?campaign=${encodeURIComponent(event.campaign_id)}`,
    sent_at: event.created_at,
  });
  posted += 1;
}

let suppressed = 0;
for (const row of suppressions) {
  if (posted + suppressed >= limit) break;
  const reason = row.reason;
  if (reason !== "unsubscribe" && reason !== "bounce" && reason !== "complaint") continue;
  const contact = contactFor(row.email, row.contact_id);
  await postPortal({
    event: "suppress",
    contact_id: contact?.portal_contact_id ?? null,
    email: String(row.email || "").trim().toLowerCase(),
    reason,
    suppressed_at: row.created_at,
  });
  suppressed += 1;
}

console.log(
  `${dryRun ? "Dry run" : "Posted"} ${posted} send tag(s), ${suppressed} suppression(s). Skipped ${skipped} send(s) with no Portal contact.`
);
