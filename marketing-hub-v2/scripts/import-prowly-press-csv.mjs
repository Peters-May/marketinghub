/**
 * Import Prowly press contacts CSV into hub_store, tagged as "Press".
 *
 * Usage:
 *   node scripts/import-prowly-press-csv.mjs [csvPath] [--apply]
 *
 * Default is dry-run. Pass --apply to write to Supabase hub_store (+ local .data).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const HUB_STORE_ID = "default";
const GROUP_TAG = "Press";
const SOURCE_TAG = "Prowly";
const SKIP_EMAILS = new Set(["marketing@petersandmay.com"]);

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

/** Parse CSV/TSV with a given delimiter; supports quoted fields. */
function parseDelimited(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') {
        field += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && n === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => String(x).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((x) => String(x).trim() !== "")) rows.push(row);
  }
  return rows;
}

function clean(v) {
  return String(v ?? "")
    .replace(/^""$/, "")
    .trim();
}

function firstUrl(profiles) {
  const raw = clean(profiles);
  if (!raw) return "";
  const parts = raw.split(/;\s*/).map((p) => p.trim()).filter(Boolean);
  const http = parts.find((p) => /^https?:\/\//i.test(p));
  return http || parts[0] || "";
}

function buildNotes(row) {
  const bits = [];
  const desc = clean(row.description);
  if (desc) bits.push(desc);
  const media = clean(row.media_type);
  if (media) bits.push(`Media: ${media}`);
  const topics = clean(row.topics);
  if (topics) bits.push(`Topics: ${topics}`);
  const country = [clean(row.city), clean(row.state), clean(row.country)]
    .filter(Boolean)
    .join(", ");
  if (country) bits.push(`Location: ${country}`);
  const langs = clean(row.languages);
  if (langs) bits.push(`Languages: ${langs}`);
  bits.push("Imported from Prowly");
  return bits.join("\n");
}

function mapRow(row, now) {
  const email = clean(row.email).toLowerCase();
  const contactType = clean(row.contact_type).toLowerCase();
  const isOutlet = contactType === "outlet";
  const first = clean(row.first_name);
  const last = clean(row.last_name);
  const full =
    clean(row.name) ||
    [first, last].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const outlet = clean(row.outlet);
  const name = full || outlet || email || "Unnamed press contact";
  const organisation = outlet || (isOutlet ? name : "");
  const role = clean(row.occupation);
  const phone = clean(row.phones);
  const website = firstUrl(row.profiles);

  return {
    id: `ctc_${crypto.randomUUID().slice(0, 12)}`,
    kind: isOutlet ? "company" : "person",
    name,
    organisation,
    role,
    email: clean(row.email),
    phone,
    website,
    services: "",
    tags: [GROUP_TAG, SOURCE_TAG],
    notes: buildNotes(row),
    user_id: null,
    created_at: now,
    updated_at: now,
  };
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const csvPath =
  args.find((a) => !a.startsWith("--")) ||
  "C:/Users/Sophie.Edgerley/Downloads/export_09-17-2026-11_56_13.csv";

const env = { ...loadEnv(path.join(ROOT, ".env.local")), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env in .env.local");

const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
const delimiter = text.includes(";") ? ";" : ",";
const rows = parseDelimited(text, delimiter);
if (rows.length < 2) throw new Error("CSV has no data rows");

const header = rows[0].map((h) => clean(h).toLowerCase());
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
for (const required of ["email", "name", "outlet"]) {
  if (idx[required] == null) {
    throw new Error(`Missing column: ${required}. Found: ${header.join(", ")}`);
  }
}

const get = (r, key) => clean(r[idx[key]]);
const mapped = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const obj = Object.fromEntries(header.map((h) => [h, get(r, h)]));
  mapped.push(obj);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: storeRow, error: readErr } = await supabase
  .from("hub_store")
  .select("payload, updated_at")
  .eq("id", HUB_STORE_ID)
  .maybeSingle();
if (readErr) throw new Error(readErr.message);
if (!storeRow?.payload) throw new Error("hub_store default row missing");

const payload = structuredClone(storeRow.payload);
const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
const byEmail = new Map();
for (const c of contacts) {
  const e = String(c.email ?? "")
    .trim()
    .toLowerCase();
  if (e) byEmail.set(e, c);
}

const now = new Date().toISOString();
let added = 0;
let taggedExisting = 0;
let skippedSelf = 0;
let skippedDup = 0;
let skippedEmpty = 0;
const additions = [];

for (const row of mapped) {
  const email = clean(row.email).toLowerCase();
  if (email && SKIP_EMAILS.has(email)) {
    skippedSelf++;
    continue;
  }
  const hasIdentity =
    email ||
    clean(row.name) ||
    clean(row.first_name) ||
    clean(row.last_name) ||
    clean(row.outlet);
  if (!hasIdentity) {
    skippedEmpty++;
    continue;
  }

  if (email && byEmail.has(email)) {
    const existing = byEmail.get(email);
    const tags = Array.isArray(existing.tags) ? [...existing.tags] : [];
    let changed = false;
    for (const t of [GROUP_TAG, SOURCE_TAG]) {
      if (!tags.includes(t)) {
        tags.push(t);
        changed = true;
      }
    }
    if (changed) {
      existing.tags = tags;
      existing.updated_at = now;
      taggedExisting++;
    } else {
      skippedDup++;
    }
    continue;
  }

  const contact = mapRow(row, now);
  contacts.push(contact);
  if (contact.email) byEmail.set(contact.email.toLowerCase(), contact);
  additions.push({
    name: contact.name,
    organisation: contact.organisation,
    email: contact.email,
    kind: contact.kind,
  });
  added++;
}

payload.contacts = contacts;

console.log(
  JSON.stringify(
    {
      csv: csvPath,
      delimiter,
      csvRows: mapped.length,
      apply,
      groupTag: GROUP_TAG,
      added,
      taggedExisting,
      skippedDup,
      skippedSelf,
      skippedEmpty,
      totalContactsAfter: contacts.length,
      sampleAdded: additions.slice(0, 8),
    },
    null,
    2
  )
);

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to save.");
  process.exit(0);
}

const { data: casData, error: casErr } = await supabase.rpc(
  "hub_store_cas_update",
  {
    p_id: HUB_STORE_ID,
    p_payload: payload,
    p_expected_updated_at: storeRow.updated_at,
  }
);
if (casErr) throw new Error(`CAS update failed: ${casErr.message}`);
if (casData == null) {
  throw new Error(
    "CAS conflict — hub_store changed while importing. Re-run the script."
  );
}

const localPath = path.join(ROOT, ".data", "store.json");
try {
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`\nWrote local ${localPath}`);
} catch (err) {
  console.warn("Local store write skipped:", err.message);
}

console.log("\nApplied to hub_store (Press group).");
