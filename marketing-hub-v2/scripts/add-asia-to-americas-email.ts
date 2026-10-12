/**
 * One-shot: add the Asia to Americas sailing email as a draft campaign
 * with a visual builder document. Safe to re-run.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { EmailDesign } from "@/lib/email/design/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

const CAMPAIGN_ID = "ecamp_asia_americas";
const LOGO =
  "https://144868338.hs-sites-eu1.com/hs-fs/hubfs/PM%20Global%20Yacht%20Transport%20small.png?width=300&upscale=true&name=PM%20Global%20Yacht%20Transport%20small.png";
const HERO =
  "https://144868338.hs-sites-eu1.com/hs-fs/hubfs/asia%20us%20eaast%20coast-1.jpg?width=1200&upscale=true&name=asia%20us%20eaast%20coast-1.jpg";
const PHOTO =
  "https://144868338.hs-sites-eu1.com/hs-fs/hubfs/DJI_20250613193510_0310_D_ALEX4-Enhanced-NR.jpg?width=1200&upscale=true&name=DJI_20250613193510_0310_D_ALEX4-Enhanced-NR.jpg";
const GROUP =
  "https://144868338.hs-sites-eu1.com/hs-fs/hubfs/PM-group.png?width=300&upscale=true&name=PM-group.png";
const SITE = "https://www.petersandmay.com";
const ENQUIRE = "https://www.petersandmay.com/sailing-schedules/fe-us2611/";
const SCHEDULES = "https://www.petersandmay.com/sailing-schedules/";
const BLUE = "#007DC5";
const NAVY = "#0B2545";
const BODY = "#666666";
const BAND = "#CFE2F3";

const { createClient } = await import("@supabase/supabase-js");
const { compileEmailDesign, createBlock, createSection, normalizeEmailDesign } =
  await import("@/lib/email/design");

function design(): EmailDesign {
  const built: EmailDesign = {
    version: 1,
    styles: {
      pageBackground: "#DCDCDC",
      contentBackground: "#FFFFFF",
      contentWidth: 600,
      fontFamily: "Archivo, Arial, sans-serif",
      headingFontFamily: "League Spartan, Arial, sans-serif",
      textColor: BODY,
      linkColor: BLUE,
      buttonBackground: BLUE,
      buttonColor: "#FFFFFF",
      buttonRadius: 19,
    },
    sections: [
      createSection("1", {
        id: "sec_logo",
        background: "#FFFFFF",
        paddingTop: 32,
        paddingRight: 24,
        paddingBottom: 24,
        paddingLeft: 24,
        columnGap: 0,
        columns: [
          {
            id: "col_logo",
            width: 100,
            blocks: [
              createBlock("logo", {
                id: "blk_logo",
                src: LOGO,
                alt: "Peters & May Global Yacht Transport",
                href: SITE,
                width: 150,
                align: "center",
                paddingTop: 0,
                paddingBottom: 0,
              }),
            ],
          },
        ],
      }),
      createSection("1", {
        id: "sec_banner",
        background: BLUE,
        paddingTop: 36,
        paddingRight: 32,
        paddingBottom: 28,
        paddingLeft: 32,
        columnGap: 0,
        columns: [
          {
            id: "col_banner",
            width: 100,
            blocks: [
              createBlock("heading", {
                id: "blk_title",
                text: "Asia to the Americas",
                color: "#FFFFFF",
                fontSize: 30,
                align: "center",
                paddingTop: 0,
                paddingBottom: 8,
              }),
              createBlock("text", {
                id: "blk_dates",
                html: "<p><strong>20 OCTOBER 2026 – 16 JANUARY 2027</strong></p>",
                color: "#FFFFFF",
                fontSize: 16,
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
        background: "#FFFFFF",
        paddingTop: 20,
        paddingRight: 40,
        paddingBottom: 8,
        paddingLeft: 40,
        columnGap: 0,
        columns: [
          {
            id: "col_intro",
            width: 100,
            blocks: [
              createBlock("text", {
                id: "blk_intro",
                html: "<p>Dear Subscriber,</p><p>Whether you are relocating a yacht to the US, repositioning between key cruising grounds, or planning ahead for the next season, our upcoming Asia to the Americas sailing offers a practical transport option.</p><p>With connections from Singapore and Hong Kong and discharge options across both the Pacific and Atlantic coasts, including La Paz, Golfito and Fort Lauderdale, this sailing provides flexible access to key destinations across the Americas.</p>",
                color: BODY,
                fontSize: 16,
                align: "left",
                paddingTop: 0,
                paddingBottom: 8,
              }),
              createBlock("divider", {
                id: "blk_rule_1",
                color: "#222222",
                thickness: 1,
                paddingTop: 12,
                paddingBottom: 4,
              }),
            ],
          },
        ],
      }),
      createSection("1", {
        id: "sec_route",
        background: BAND,
        paddingTop: 20,
        paddingRight: 0,
        paddingBottom: 12,
        paddingLeft: 0,
        columnGap: 0,
        columns: [
          {
            id: "col_route",
            width: 100,
            blocks: [
              createBlock("image", {
                id: "blk_hero",
                src: HERO,
                alt: "Asia to the Americas sailing",
                href: "",
                widthPercent: 100,
                align: "center",
                paddingTop: 0,
                paddingBottom: 0,
              }),
              createBlock("button", {
                id: "blk_enquire",
                label: "Enquire About This Sailing",
                href: ENQUIRE,
                background: BLUE,
                color: "#FFFFFF",
                radius: 19,
                fullWidth: false,
                align: "center",
                paddingTop: 16,
                paddingRight: 20,
                paddingBottom: 8,
                paddingLeft: 20,
              }),
            ],
          },
        ],
      }),
      createSection("1", {
        id: "sec_why",
        background: "#FFFFFF",
        paddingTop: 24,
        paddingRight: 28,
        paddingBottom: 4,
        paddingLeft: 28,
        columnGap: 0,
        columns: [
          {
            id: "col_why",
            width: 100,
            blocks: [
              createBlock("heading", {
                id: "blk_why",
                text: "Why choose Peters & May",
                color: NAVY,
                fontSize: 24,
                align: "left",
                paddingTop: 0,
                paddingBottom: 8,
              }),
              createBlock("text", {
                id: "blk_why_body",
                html: "<ul><li>Experienced yacht transport teams across Asia and the Americas</li><li>Dedicated planning from booking through to discharge</li><li>Technical oversight of loading, stowage and discharge operations</li><li>Coordination with owners, captains, brokers and local agents</li><li>Support throughout the shipment from our global team</li></ul><p>Space on individual sailings is limited, so early planning gives us the best opportunity to secure your preferred loading and discharge options.</p><p><strong>Request a quote or speak to our team about your yacht and intended destination.</strong></p>",
                color: BODY,
                fontSize: 16,
                align: "left",
                paddingTop: 0,
                paddingBottom: 0,
              }),
            ],
          },
        ],
      }),
      createSection("2", {
        id: "sec_actions",
        background: "#FFFFFF",
        paddingTop: 8,
        paddingRight: 12,
        paddingBottom: 8,
        paddingLeft: 12,
        columnGap: 8,
        columns: [
          {
            id: "col_ask",
            width: 50,
            blocks: [
              createBlock("button", {
                id: "blk_ask",
                label: "Ask a Question",
                href: "mailto:info@petersandmay.com",
                background: "#8A9099",
                color: "#FFFFFF",
                radius: 25,
                fullWidth: true,
                align: "center",
                paddingTop: 8,
                paddingBottom: 8,
              }),
            ],
          },
          {
            id: "col_schedules",
            width: 50,
            blocks: [
              createBlock("button", {
                id: "blk_schedules",
                label: "Sailing Schedules",
                href: SCHEDULES,
                background: BLUE,
                color: "#FFFFFF",
                radius: 25,
                fullWidth: true,
                align: "center",
                paddingTop: 8,
                paddingBottom: 8,
              }),
            ],
          },
        ],
      }),
      createSection("1", {
        id: "sec_close",
        background: "#FFFFFF",
        paddingTop: 8,
        paddingRight: 28,
        paddingBottom: 8,
        paddingLeft: 28,
        columnGap: 0,
        columns: [
          {
            id: "col_close",
            width: 100,
            blocks: [
              createBlock("divider", {
                id: "blk_rule_2",
                color: "#222222",
                thickness: 1,
                paddingTop: 8,
                paddingBottom: 12,
              }),
              createBlock("text", {
                id: "blk_close",
                html: "<p>From initial planning through to loading and discharge, our team coordinates each stage of the shipment and keeps you informed throughout.</p><p>If you are considering moving a yacht from Asia to the Americas over the coming months, speak to us about the available options.</p><p>Best regards,<br><strong>The Peters &amp; May Team</strong></p>",
                color: BODY,
                fontSize: 16,
                align: "left",
                paddingTop: 0,
                paddingBottom: 8,
              }),
              createBlock("text", {
                id: "blk_contact",
                html: '<p>Contact our team today to get a quote:</p><p><a href="mailto:info@petersandmay.com"><strong>info@petersandmay.com</strong></a> or +44 (0)2380 480 480</p>',
                color: BODY,
                fontSize: 16,
                align: "center",
                paddingTop: 0,
                paddingBottom: 4,
              }),
            ],
          },
        ],
      }),
      createSection("1", {
        id: "sec_social",
        background: "#FFFFFF",
        paddingTop: 4,
        paddingRight: 16,
        paddingBottom: 8,
        paddingLeft: 16,
        columnGap: 0,
        columns: [
          {
            id: "col_social",
            width: 100,
            blocks: [
              createBlock("social", {
                id: "blk_social",
                align: "center",
                paddingTop: 4,
                paddingBottom: 4,
                links: [
                  { network: "facebook", url: "https://www.facebook.com/PetersandMay/" },
                  {
                    network: "linkedin",
                    url: "https://www.linkedin.com/company/peters-%26-may-ltd",
                  },
                  { network: "instagram", url: "https://www.instagram.com/petersandmay/" },
                  { network: "youtube", url: "https://www.youtube.com/@Petersandmay" },
                ],
              }),
              createBlock("text", {
                id: "blk_social_extra",
                html: '<p><a href="https://x.com/petersandmay">X</a> · <a href="mailto:info@petersandmay.com">Email</a> · <a href="https://www.petersandmay.com">Website</a></p>',
                color: BLUE,
                fontSize: 13,
                align: "center",
                paddingTop: 0,
                paddingBottom: 4,
              }),
              createBlock("text", {
                id: "blk_nav",
                html: '<p><a href="https://www.petersandmay.com/our-services/">Our Services</a> | <a href="https://www.petersandmay.com/about-us/">About us</a> | <a href="https://www.petersandmay.com/news">News</a> | <a href="https://www.petersandmay.com/case-studies/">Case Studies</a> | <a href="https://www.petersandmay.com/contact-us">Contact us</a></p>',
                color: BLUE,
                fontSize: 14,
                align: "center",
                paddingTop: 4,
                paddingBottom: 4,
              }),
            ],
          },
        ],
      }),
      createSection("1", {
        id: "sec_photo",
        background: "#FFFFFF",
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        columnGap: 0,
        columns: [
          {
            id: "col_photo",
            width: 100,
            blocks: [
              createBlock("image", {
                id: "blk_photo",
                src: PHOTO,
                alt: "Yacht transport",
                href: "",
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
        id: "sec_footer",
        background: "#FFFFFF",
        paddingTop: 16,
        paddingRight: 24,
        paddingBottom: 24,
        paddingLeft: 24,
        columnGap: 0,
        columns: [
          {
            id: "col_footer",
            width: 100,
            blocks: [
              createBlock("logo", {
                id: "blk_group",
                src: GROUP,
                alt: "Peters & May",
                href: SITE,
                width: 150,
                align: "center",
                paddingTop: 8,
                paddingBottom: 8,
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

function campaignFrom(html: string, emailDesign: EmailDesign, createdAt?: string) {
  const now = new Date().toISOString();
  return {
    id: CAMPAIGN_ID,
    title: "Asia to Americas",
    status: "draft",
    subject: "Asia to the Americas",
    preview_text: "Plan your yacht's journey from Asia to the Americas.",
    from_name: "Peters & May Marketing",
    from_email: "marketing@petersandmay.com",
    html_body: html,
    design: emailDesign,
    template_id: null,
    audience_id: null,
    list_ids: [],
    recipient_ids: [],
    brief:
      "Asia to the Americas sailing, 20 October 2026 to 16 January 2027. Built in the template builder from the HubSpot draft.",
    hubspot_url: "https://144868338.hs-sites-eu1.com/asia-to-us-east-coast-sailing",
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

function upsertCampaign(list: unknown[], item: ReturnType<typeof campaignFrom>) {
  const campaigns = Array.isArray(list) ? [...list] : [];
  const index = campaigns.findIndex(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as { id?: string }).id === CAMPAIGN_ID
  );
  if (index >= 0) {
    const prev = campaigns[index] as { created_at?: string };
    campaigns[index] = { ...item, created_at: prev.created_at || item.created_at };
  } else {
    campaigns.unshift(item);
  }
  return campaigns;
}

const emailDesign = design();
const html = compileEmailDesign(emailDesign);
if (!html.includes("Asia to the Americas")) {
  throw new Error("Compiled HTML is missing the heading");
}
if (html.toLowerCase().includes("#ed1c24")) {
  throw new Error("Compiled HTML uses logo red as a layout colour");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase service credentials");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let saved = false;
for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
  const { data, error } = await supabase
    .from("hub_store")
    .select("payload, updated_at")
    .eq("id", "default")
    .single();
  if (error || !data?.payload) {
    throw new Error(error?.message || "hub_store row missing");
  }
  const payload = data.payload as { email_campaigns?: unknown[] };
  const existing = (payload.email_campaigns ?? []).find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as { id?: string }).id === CAMPAIGN_ID
  ) as { created_at?: string } | undefined;
  const nextPayload = {
    ...payload,
    email_campaigns: upsertCampaign(
      payload.email_campaigns ?? [],
      campaignFrom(html, emailDesign, existing?.created_at)
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
    email_campaigns?: unknown[];
  };
  const existing = (local.email_campaigns ?? []).find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as { id?: string }).id === CAMPAIGN_ID
  ) as { created_at?: string } | undefined;
  local.email_campaigns = upsertCampaign(
    local.email_campaigns ?? [],
    campaignFrom(html, emailDesign, existing?.created_at)
  );
  writeFileSync(localPath, JSON.stringify(local, null, 2));
}

console.log(
  JSON.stringify({
    id: CAMPAIGN_ID,
    sections: emailDesign.sections.length,
    htmlBytes: html.length,
  })
);
