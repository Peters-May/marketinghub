/**
 * One-shot: push existing Hub web_enquiries + whatsapp_enquiries to Portal.
 *
 * Requires .env.local (or process env):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   PORTAL_BASE_URL, PORTAL_ENQUIRY_SYNC_SECRET
 *
 * Usage:
 *   node scripts/backfill-portal-enquiries.mjs
 *   node scripts/backfill-portal-enquiries.mjs --web
 *   node scripts/backfill-portal-enquiries.mjs --whatsapp
 *   node scripts/backfill-portal-enquiries.mjs --limit=50
 *   node scripts/backfill-portal-enquiries.mjs --dry-run
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
const webOnly = args.includes("--web");
const waOnly = args.includes("--whatsapp");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const portalBase = (env.PORTAL_BASE_URL ?? "").trim().replace(/\/+$/, "");
const portalSecret = (env.PORTAL_ENQUIRY_SYNC_SECRET ?? "").trim();

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

const doWeb = !waOnly;
const doWa = !webOnly;

async function postPortal(pathSuffix, body) {
  if (dryRun) {
    return { ok: true, dryRun: true };
  }
  const res = await fetch(`${portalBase}${pathSuffix}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${portalSecret}`,
      "X-Webhook-Secret": portalSecret,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, status: res.status, error: text.slice(0, 300) };
  }
  return { ok: true, status: res.status };
}

async function fetchAll(table, orderCol = "received_at") {
  const pageSize = 1000;
  const all = [];
  let from = 0;
  for (;;) {
    let to = from + pageSize - 1;
    if (limit != null && Number.isFinite(limit)) {
      const remaining = limit - all.length;
      if (remaining <= 0) break;
      to = from + Math.min(pageSize, remaining) - 1;
    }
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("is_test", false)
      .order(orderCol, { ascending: false, nullsFirst: false })
      .range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    if (limit != null && all.length >= limit) break;
    from += pageSize;
  }
  return limit != null ? all.slice(0, limit) : all;
}

function whatsAppSyncBody(row) {
  return {
    channel: "whatsapp",
    external_id: row.external_id,
    customer_name: row.customer_name || null,
    company: row.company || null,
    customer_email: row.customer_email || null,
    customer_phone: row.customer_phone || null,
    customer_country: row.customer_country || null,
    category: row.category || null,
    service: row.service || null,
    vessel_cargo: row.vessel_cargo || null,
    collection_location: row.collection_location || null,
    delivery_location: row.delivery_location || null,
    dimensions: row.dimensions || null,
    declared_value: row.declared_value || null,
    preferred_timeframe: row.preferred_timeframe || null,
    selected_office: row.selected_office || null,
    office_email: row.office_email || null,
    tracker_status: row.tracker_status || null,
    status: row.status || null,
    email_subject: row.email_subject || null,
    source: row.source || "mcp",
    message: row.message || null,
    notes: row.notes || null,
    sent_to_office_at: row.sent_to_office_at,
    follow_up_at: row.follow_up_at,
    needs_manual_review: row.needs_manual_review,
    is_test: row.is_test,
    marketing_emails_consent: false,
    raw_payload: row.raw_payload ?? {},
  };
}

function webBody(row) {
  const raw =
    row.raw_payload && typeof row.raw_payload === "object"
      ? row.raw_payload
      : null;
  if (raw && (raw.submission_id || raw.make_fields || raw.customer)) {
    return raw;
  }
  // Reconstruct a minimal PMQB-shaped body from flat columns.
  return {
    submission_id: row.submission_id,
    created_at: row.created_at,
    make_fields: {
      ...(row.make_fields && typeof row.make_fields === "object"
        ? row.make_fields
        : {}),
      submission_id: row.submission_id,
      customer_name: row.customer_name,
      customer_email: row.customer_email,
      customer_phone: row.customer_phone,
      customer_country: row.customer_country,
      final_service_category: row.final_service_category,
      user_selected_service: row.user_selected_service,
      collection_location: row.collection_location,
      delivery_location: row.delivery_location,
      selected_office: row.selected_office,
      office_email: row.office_email,
      needs_manual_review: row.needs_manual_review,
      marketing_emails_consent: row.marketing_emails_consent,
      routing_reason: row.routing_reason,
    },
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
      country: row.customer_country,
    },
    routing: {
      selected_office: row.selected_office,
      office_email: row.office_email,
      routing_reason: row.routing_reason,
      needs_manual_review: row.needs_manual_review,
    },
  };
}

let ok = 0;
let fail = 0;

async function run() {
  console.log(
    dryRun ? "DRY RUN — no Portal posts" : `Portal: ${portalBase}`
  );

  if (doWeb) {
    const rows = await fetchAll("web_enquiries", "created_at");
    console.log(`Web enquiries: ${rows.length}`);
    for (const row of rows) {
      const body = webBody(row);
      const sid = body.submission_id || row.submission_id;
      const result = await postPortal("/api/enquiries", body);
      if (result.ok) {
        ok++;
        console.log(`  OK web ${sid}`);
      } else {
        fail++;
        console.error(`  FAIL web ${sid}: ${result.status} ${result.error}`);
      }
    }
  }

  if (doWa) {
    const rows = await fetchAll("whatsapp_enquiries", "created_at");
    console.log(`WhatsApp enquiries: ${rows.length}`);
    for (const row of rows) {
      const body = whatsAppSyncBody(row);
      const result = await postPortal("/api/enquiries/hub-sync", body);
      if (result.ok) {
        ok++;
        console.log(`  OK wa ${row.external_id}`);
      } else {
        fail++;
        console.error(
          `  FAIL wa ${row.external_id}: ${result.status} ${result.error}`
        );
      }
    }
  }

  console.log(`Done. ok=${ok} fail=${fail}`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
