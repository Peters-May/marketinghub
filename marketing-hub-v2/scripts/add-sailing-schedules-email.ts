/**
 * Import the HubSpot sailing schedules email as a reusable template
 * and a draft campaign. The schedule rows stay one HTML block.
 * Safe to re-run. Does not send.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { EmailDesign } from "@/lib/email/design/types";
import {
  compileEmailDesign,
  createBlock,
  createSection,
  normalizeEmailDesign,
} from "@/lib/email/design";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const TEMPLATE_ID = "etpl_sailing_schedules";
const CAMPAIGN_ID = "ecamp_sailing_oct26_w1";
const AUDIENCE_ID = "eaud_51d6c3cc";
const LIST_ID = "ml_385a4ffb";
const SOURCE =
  process.argv[2] ||
  "C:\\Users\\Sophie.Edgerley\\Downloads\\Sailing Schedule Email Oct 26 Week 1.html";

const HEADER =
  "https://hs-144868338.f.hubspotstarter-eu1.net/hub/144868338/hubfs/Sailing%20Schedules%20Email%20Header.png?width=1120&name=Sailing%20Schedules%20Email%20Header.png";
const QUOTE = "https://www.petersandmay.com/request-a-quote/";
const SITE = "https://www.petersandmay.com/";
const BLUE = "#007DC5";
const NAVY = "#0B2545";
const BODY = "#23496d";

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnv();

function scheduleHtml(source: string): string {
  const start = source.indexOf("<!-- ONE ROW -->");
  const end = source.indexOf("</div></td></tr></tbody></table>", start);
  if (start < 0 || end < 0) throw new Error("Schedule HTML block not found");
  let html = source.slice(start, end);
  const style = `<style>
@media only print, only screen and (max-width:600px) {
  td.col { width:100% !important; display:block !important; border-right:none !important; border-bottom:1px solid #eee !important; padding:12px 0 !important; }
}
</style>`;
  html = html.replace(/<style>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/\sdata-hs-link-id(?:-v2)?="[^"]*"/g, "");
  html = html.replace(/href="(https:\/\/www\.petersandmay\.com[^"]*)"/g, (_m, url: string) => {
    return `href="${url.split("?")[0]}"`;
  });
  return `${style}\n${html.trim()}`;
}

const schedules = scheduleHtml(readFileSync(SOURCE, "utf8"));
if (!schedules.includes("TW2610") || !schedules.includes("TW2701")) {
  throw new Error("Schedule rows did not import");
}

function design(): EmailDesign {
  const built: EmailDesign = {
    version: 1,
    styles: {
      pageBackground: "#ffffff",
      contentBackground: "#ffffff",
      contentWidth: 600,
      fontFamily: "Arial, Helvetica, sans-serif",
      headingFontFamily: "Arial, Helvetica, sans-serif",
      textColor: BODY,
      linkColor: BLUE,
      buttonBackground: BLUE,
      buttonColor: "#ffffff",
      buttonRadius: 8,
    },
    sections: [
      createSection("1", {
        id: "sec_header",
        background: "#ffffff",
        paddingTop: 8,
        paddingRight: 20,
        paddingBottom: 0,
        paddingLeft: 20,
        columns: [
          {
            id: "col_header",
            width: 100,
            blocks: [
              createBlock("image", {
                id: "blk_header",
                src: HEADER,
                alt: "Sailing schedules",
                href: SITE,
                widthPercent: 100,
                align: "center",
                paddingTop: 0,
                paddingBottom: 0,
              }),
            ],
          },
        ],
      }),
      createSection("1", {
        id: "sec_intro",
        background: "#ffffff",
        paddingTop: 8,
        paddingRight: 20,
        paddingBottom: 8,
        paddingLeft: 20,
        columns: [
          {
            id: "col_intro",
            width: 100,
            blocks: [
              createBlock("heading", {
                id: "blk_welcome",
                text: "Welcome to Peters & May Updates",
                color: BLUE,
                fontSize: 18,
                align: "left",
                paddingTop: 0,
                paddingBottom: 8,
              }),
              createBlock("text", {
                id: "blk_intro",
                html: `<p>Stay informed with our latest schedules and updates.</p><p><strong>Important note:</strong> The sailings listed below are part of our <strong>charter service</strong> and operate on a demand basis. We also offer <strong>worldwide transport</strong> via regular liner services. If you don't see your route listed, please <a href="${QUOTE}">get in touch</a> — our team will be happy to help with alternative options.</p>`,
                color: BODY,
                fontSize: 15,
                align: "left",
                paddingTop: 0,
                paddingBottom: 0,
              }),
            ],
          },
        ],
      }),
      createSection("1", {
        id: "sec_schedules",
        background: "#ffffff",
        paddingTop: 0,
        paddingRight: 12,
        paddingBottom: 8,
        paddingLeft: 12,
        columns: [
          {
            id: "col_schedules",
            width: 100,
            blocks: [
              createBlock("html", {
                id: "blk_schedules",
                html: schedules,
                align: "left",
                paddingTop: 0,
                paddingBottom: 0,
              }),
            ],
          },
        ],
      }),
      createSection("1", {
        id: "sec_close",
        background: "#ffffff",
        paddingTop: 8,
        paddingRight: 20,
        paddingBottom: 8,
        paddingLeft: 20,
        columns: [
          {
            id: "col_close",
            width: 100,
            blocks: [
              createBlock("text", {
                id: "blk_close",
                html: `<p style="text-align:center"><strong>Ready to request a quote?</strong></p><p style="text-align:center">We also offer discounted round-trip shipping rates, helping owners simplify planning, reduce costs, and secure reliable transport for both outbound and return journeys.</p><p style="text-align:center">Thank you for subscribing to Peters &amp; May Updates.</p><p style="text-align:center">For more information, visit <a href="${SITE}">www.petersandmay.com</a></p>`,
                color: BODY,
                fontSize: 15,
                align: "center",
                paddingTop: 0,
                paddingBottom: 8,
              }),
              createBlock("button", {
                id: "blk_quote",
                label: "Request a quote",
                href: QUOTE,
                background: BLUE,
                color: "#ffffff",
                radius: 8,
                fullWidth: false,
                align: "center",
                paddingTop: 8,
                paddingBottom: 16,
              }),
              createBlock("footer", {
                id: "blk_footer",
                text: "Peters & May, Unit 9, Goodwood Road, Eastleigh, Hampshire SO50 4NT, United Kingdom, +44 (0)2380 480480",
                align: "center",
                paddingTop: 4,
                paddingBottom: 0,
              }),
            ],
          },
        ],
      }),
    ],
  };
  const normalized = normalizeEmailDesign(built);
  if (!normalized) throw new Error("Design failed to normalize");
  return normalized;
}

const emailDesign = design();
const html = compileEmailDesign(emailDesign);
if (!html.includes("TW2610") || !html.includes("{{unsubscribe_url}}")) {
  throw new Error("Compiled email is missing schedules or unsubscribe");
}
if (html.toLowerCase().includes("#ed1c24") || html.includes("hubspotstarter-eu1.net/preferences") || html.includes("hs-sites-eu1.com")) {
  throw new Error("Compiled email still points at HubSpot tracking");
}
if (!html.includes(NAVY) && !html.includes(BLUE)) {
  throw new Error("Compiled email is missing brand colour");
}

const now = new Date().toISOString();

function templateFrom(createdAt?: string) {
  return {
    id: TEMPLATE_ID,
    name: "Sailing Schedules",
    subject_default: "Sailing Schedules & Updates for Peters & May",
    preview_text_default:
      "Check upcoming sailing schedules and updates on upcoming routes.",
    html_body: html,
    design: emailDesign,
    created_at: createdAt || now,
    updated_at: now,
  };
}

function campaignFrom(createdAt?: string) {
  return {
    id: CAMPAIGN_ID,
    title: "Sailing Schedules | Oct 26 Week 1",
    status: "draft",
    subject: "Sailing Schedules & Updates for Peters & May",
    preview_text:
      "Check upcoming sailing schedules and updates on upcoming routes.",
    from_name: "Peters & May",
    from_email: "hello@petersandmay.com",
    html_body: html,
    design: emailDesign,
    template_id: TEMPLATE_ID,
    audience_id: AUDIENCE_ID,
    list_ids: [LIST_ID],
    recipient_ids: [],
    brief:
      "Weekly sailing schedules. The middle block is pasted HTML and is replaced each week. Draft only.",
    hubspot_url: "",
    theme_id: null,
    content_id: null,
    folder: "Yacht",
    follow_up_of: null,
    adj_open_rate: null,
    adj_click_rate: null,
    scheduled_at: null,
    sent_at: null,
    stats: {
      recipients: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      unsubscribed: 0,
    },
    last_error: "",
    created_by: "marketing@petersandmay.com",
    created_at: createdAt || now,
    updated_at: now,
  };
}

function upsertById<T extends { id: string; created_at?: string; status?: string }>(
  list: unknown[],
  item: T
) {
  const rows = Array.isArray(list) ? [...list] : [];
  const index = rows.findIndex(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as { id?: string }).id === item.id
  );
  if (index >= 0) {
    const prev = rows[index] as { created_at?: string; status?: string };
    if (prev.status === "sending" || prev.status === "sent" || prev.status === "scheduled") {
      return rows;
    }
    rows[index] = { ...item, created_at: prev.created_at || item.created_at };
  } else {
    rows.unshift(item);
  }
  return rows;
}

async function main() {
const { createClient } = await import("@supabase/supabase-js");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase service credentials");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let saved = false;
for (let attempt = 0; attempt < 8 && !saved; attempt += 1) {
  const { data, error } = await supabase
    .from("hub_store")
    .select("payload, updated_at")
    .eq("id", "default")
    .single();
  if (error || !data?.payload) {
    throw new Error(error?.message || "hub_store row missing");
  }
  const payload = data.payload as {
    email_templates?: unknown[];
    email_campaigns?: unknown[];
  };
  const existingTemplate = (payload.email_templates ?? []).find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as { id?: string }).id === TEMPLATE_ID
  ) as { created_at?: string } | undefined;
  const existingCampaign = (payload.email_campaigns ?? []).find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as { id?: string }).id === CAMPAIGN_ID
  ) as { created_at?: string } | undefined;
  const nextPayload = {
    ...payload,
    email_templates: upsertById(
      payload.email_templates ?? [],
      templateFrom(existingTemplate?.created_at)
    ),
    email_campaigns: upsertById(
      payload.email_campaigns ?? [],
      campaignFrom(existingCampaign?.created_at)
    ),
  };
  const { data: written, error: writeError } = await supabase.rpc(
    "hub_store_cas_update",
    {
      p_id: "default",
      p_payload: nextPayload,
      p_expected_updated_at: data.updated_at,
    }
  );
  if (writeError) throw new Error(writeError.message);
  if (written == null) continue;
  saved = true;
}
if (!saved) throw new Error("Hub store write conflict");

const localPath = resolve(root, ".data", "store.json");
if (existsSync(localPath)) {
  const local = JSON.parse(readFileSync(localPath, "utf8")) as {
    email_templates?: unknown[];
    email_campaigns?: unknown[];
  };
  const existingTemplate = (local.email_templates ?? []).find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as { id?: string }).id === TEMPLATE_ID
  ) as { created_at?: string } | undefined;
  const existingCampaign = (local.email_campaigns ?? []).find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as { id?: string }).id === CAMPAIGN_ID
  ) as { created_at?: string } | undefined;
  local.email_templates = upsertById(
    local.email_templates ?? [],
    templateFrom(existingTemplate?.created_at)
  );
  local.email_campaigns = upsertById(
    local.email_campaigns ?? [],
    campaignFrom(existingCampaign?.created_at)
  );
  writeFileSync(localPath, JSON.stringify(local));
}

console.log(
  JSON.stringify({
    template: TEMPLATE_ID,
    campaign: CAMPAIGN_ID,
    audience: "HubSpot: Sailing Schedule Updates",
    schedule_chars: schedules.length,
    status: "draft",
  })
);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
