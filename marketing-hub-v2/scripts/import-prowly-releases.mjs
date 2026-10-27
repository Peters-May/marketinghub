/**
 * Import Peters & May press releases and imagery from the Prowly newsroom.
 *
 * Usage:
 *   node scripts/import-prowly-releases.mjs
 *   node scripts/import-prowly-releases.mjs --apply
 *   node scripts/import-prowly-releases.mjs --apply --overwrite
 *
 * Dry-run prints what would be saved. --apply creates releases that are not
 * already in the hub. --overwrite updates a matching release and leaves its
 * status unchanged. Images go into the media gallery (Gallery / Press releases).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { COMPANY_BOILERPLATE } from "../src/lib/brand/factsheet.mjs";

const require = createRequire(
  new URL("../node_modules/isomorphic-dompurify/package.json", import.meta.url)
);
const { JSDOM } = require("jsdom");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const HUB_STORE_ID = "default";
const ORIGIN = "https://petersandmay.prowly.com";
const GALLERY_FOLDER = "Press releases";
const BOILERPLATE = COMPANY_BOILERPLATE;

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

function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphHtml(el) {
  if (!el) return "";
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      parts.push(escapeHtml(node.textContent || ""));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === "BR") {
      parts.push("<br>");
      return;
    }
    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      const label = clean(node.textContent);
      if (/^https?:\/\//i.test(href) && label) {
        parts.push(
          `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
        );
        return;
      }
    }
    if (tag === "STRONG" || tag === "B") {
      const inner = clean(node.textContent);
      if (inner) parts.push(`<strong>${escapeHtml(inner)}</strong>`);
      return;
    }
    if (tag === "EM" || tag === "I") {
      const inner = clean(node.textContent);
      if (inner) parts.push(`<em>${escapeHtml(inner)}</em>`);
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(el);
  const html = parts.join("").replace(/(?:<br>\s*){3,}/g, "<br><br>").trim();
  if (!html) return "";
  return `<p>${html}</p>`;
}

function plainFromHtml(html) {
  return clean(html.replace(/<[^>]+>/g, " "));
}

function meta(doc, name) {
  const node =
    doc.querySelector(`meta[property="${name}"]`) ||
    doc.querySelector(`meta[name="${name}"]`);
  return clean(node?.getAttribute("content") || "");
}

function releaseIdFromUrl(url) {
  const match = String(url).match(/\/(\d+)-/);
  return match ? match[1] : "";
}

function fileNameFromUrl(url, fallback) {
  try {
    const last = new URL(url).pathname.split("/").pop() || fallback;
    const cleaned = last.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

function contentTypeFor(name, header) {
  const fromHeader = String(header || "").split(";")[0].trim();
  if (fromHeader && fromHeader !== "application/octet-stream") return fromHeader;
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}

function imageAlt(raw, title) {
  const name = clean(
    String(raw || "")
      .replace(/\.(png|jpe?g|webp|gif)$/i, "")
      .replace(/\(\s*\d+\s*x\s*\d+\s*px\s*\)/gi, "")
  );
  return name.length >= 3 ? name : title;
}

function parseContacts(doc) {
  return [...doc.querySelectorAll(".pr-story--media-contact")]
    .map((card) => {
      const name = clean(card.querySelector('[itemprop="name"]')?.textContent);
      const email = (
        card.querySelector('a[href^="mailto:"]')?.getAttribute("href") || ""
      ).replace(/^mailto:/i, "");
      const phone = clean(
        (
          card.querySelector('a[href^="tel:"]')?.getAttribute("href") || ""
        ).replace(/^tel:/i, "") ||
          card.querySelector('[itemprop="telephone"]')?.textContent
      );
      const role = [...card.querySelectorAll("p")]
        .map((node) => clean(node.textContent))
        .find((text) => text && text !== name && !text.includes("@"));
      return { name, role: role || "", email, phone };
    })
    .filter((contact) => contact.name);
}

function formatContacts(contacts) {
  if (!contacts.length) return "";
  return contacts
    .map((contact) =>
      [contact.name, contact.role, contact.email, contact.phone]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

function piecesFromParagraph(el) {
  const pieces = [];
  let buffer = [];
  const flush = () => {
    if (!buffer.length) return;
    const wrap = el.ownerDocument.createElement("div");
    for (const node of buffer) wrap.appendChild(node.cloneNode(true));
    const htmlBlock = paragraphHtml(wrap);
    if (plainFromHtml(htmlBlock)) pieces.push({ type: "text", html: htmlBlock });
    buffer = [];
  };
  const nodes = [...el.childNodes];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const heading =
      node.nodeType === 1 && node.tagName === "STRONG"
        ? clean(node.textContent)
        : "";
    const next = nodes[i + 1];
    const followedByBreak =
      next &&
      ((next.nodeType === 1 && next.tagName === "BR") ||
        (next.nodeType === 3 && !clean(next.textContent)));
    if (heading && heading.length < 140 && followedByBreak) {
      flush();
      pieces.push({ type: "subheader", text: heading });
      while (
        nodes[i + 1] &&
        ((nodes[i + 1].nodeType === 1 && nodes[i + 1].tagName === "BR") ||
          (nodes[i + 1].nodeType === 3 && !clean(nodes[i + 1].textContent)) ||
          (nodes[i + 1].nodeType === 1 &&
            nodes[i + 1].tagName !== "BR" &&
            !clean(nodes[i + 1].textContent)))
      ) {
        i += 1;
      }
      continue;
    }
    buffer.push(node);
  }
  flush();
  return pieces;
}

function parseRelease(html, pageUrl) {
  const doc = new JSDOM(html).window.document;
  const prowlyId = releaseIdFromUrl(pageUrl);
  const title =
    clean(doc.querySelector("h1")?.textContent) ||
    meta(doc, "og:title") ||
    "Untitled press release";
  let published = "";
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const match = script.textContent.match(
      /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/
    );
    if (match) {
      published = match[1];
      break;
    }
  }
  const category =
    clean(doc.querySelector(".pr-story-category")?.textContent) || "News";
  const hero =
    doc.querySelector(
      ".pr-story-background--fullscreen, .pr-story-background--small, .pr-story-background"
    )?.getAttribute("src") || meta(doc, "og:image");

  const contacts = parseContacts(doc);
  const owner = contacts[0]?.name || "";

  const tags = [
    ...new Set(
      [...doc.querySelectorAll(".pr-tag, .pr-story-tag, .tag")].map((node) =>
        clean(node.textContent)
      )
    ),
  ].filter(Boolean);

  const blocks = [];
  const push = (block) => {
    blocks.push({ ...block, id: `${block.type}_${blocks.length + 1}` });
  };
  for (const space of doc.querySelectorAll(".pr-story--element-space")) {
    const childClass = String(space.firstElementChild?.className || "");
    if (/mediacontact/i.test(childClass)) continue;

    const image = space.querySelector("img");
    const imageSrc = image?.getAttribute("src") || "";
    if (
      image &&
      /prowly-prod\.s3|uploads\//.test(imageSrc) &&
      !/company_logos|favicon|template_background/.test(imageSrc)
    ) {
      const caption = clean(
        space.querySelector(
          ".pr-story--text-small, figcaption, .pr-story-image-caption"
        )?.textContent
      );
      push({
        type: "image",
        src: imageSrc,
        alt: imageAlt(image.getAttribute("alt"), title),
        caption,
      });
      continue;
    }

    const quote = space.querySelector(
      ".pr-story--quote.pr-text-font, p.pr-story--quote"
    );
    if (quote) {
      const text = clean(quote.textContent).replace(/[“”"]+$/g, "").trim();
      const attribution = clean(
        space.querySelector(".pr-story--text-small")?.textContent
      );
      if (text) push({ type: "quote", text, attribution });
      continue;
    }

    const standfirst = space.querySelector(".pr-story-lead");
    if (standfirst) {
      const htmlBlock = paragraphHtml(
        standfirst.querySelector(".pr-story--text") || standfirst
      );
      if (plainFromHtml(htmlBlock)) {
        const hasLead = blocks.some((block) => block.type === "lead");
        push({ type: hasLead ? "text" : "lead", html: htmlBlock });
      }
      continue;
    }

    const sub = space.querySelector("h2, h3, .pr-story--subheader");
    if (sub && space.querySelector(".pr-story-subheader, .pr-story--subheader")) {
      const text = clean(sub.textContent);
      if (!text) continue;
      const hasLead = blocks.some((block) => block.type === "lead");
      push(
        !hasLead && text.length > 160
          ? { type: "lead", html: `<p>${escapeHtml(text)}</p>` }
          : { type: "subheader", text }
      );
      continue;
    }

    const paragraph = space.querySelector(".pr-story--text");
    if (!paragraph) continue;
    const pieces = piecesFromParagraph(paragraph);
    for (const piece of pieces) {
      if (piece.type === "subheader") {
        push(piece);
        continue;
      }
      const hasProse = blocks.some(
        (block) => block.type === "lead" || block.type === "text"
      );
      push({
        type: hasProse ? "text" : "lead",
        html: piece.html,
      });
    }
  }

  const attachments = [];
  const seenFiles = new Set();
  for (const card of doc.querySelectorAll(".pr-story--attachment__content")) {
    const link = card.querySelector("a[href]");
    const href = link?.getAttribute("href") || "";
    if (!href || seenFiles.has(href)) continue;
    if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(href)) continue;
    seenFiles.add(href);
    const name =
      clean(card.querySelector(".pr-story--attachment__title")?.textContent) ||
      fileNameFromUrl(href, "Attachment");
    attachments.push({ name, url: href });
  }

  const lead = blocks.find((block) => block.type === "lead");
  const caption = lead
    ? clean(
        lead.html
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
      ).slice(0, 500)
    : meta(doc, "description").slice(0, 500);
  if (blocks[0]?.type === "lead") blocks.shift();

  return {
    prowlyId,
    url: pageUrl,
    title,
    published,
    category,
    owner,
    tags: [category, ...tags.filter((tag) => tag !== category)].slice(0, 12),
    hero,
    caption,
    blocks,
    attachments,
    contacts,
    contact: formatContacts(contacts),
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "PetersMayHubImporter/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function listReleaseUrls() {
  const xml = await fetchText(`${ORIGIN}/sitemap.xml`);
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].trim())
    .filter((url) => /\/\d+-/.test(url));
}

async function uploadAsset(supabase, sourceUrl, prowlyId) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Download failed ${response.status} ${sourceUrl}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const headerType = response.headers.get("content-type");
  const filename = fileNameFromUrl(sourceUrl, "asset");
  const contentType = contentTypeFor(filename, headerType);
  const objectPath = `hub-content/prowly/${prowlyId}/${filename}`;
  const { error } = await supabase.storage
    .from("attachments")
    .upload(objectPath, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("attachments").getPublicUrl(objectPath);
  return {
    url: data.publicUrl,
    name: filename,
    type: contentType,
    size: bytes.length,
    sourceUrl,
  };
}

function emptySeo() {
  return {
    canonical: "",
    keywords: "",
    noindex: false,
    nofollow: false,
    noarchive: false,
    nosnippet: false,
    notranslate: false,
    noimageindex: false,
    redirect_url: "",
    redirect_enabled: false,
  };
}

function toContentItem(release, urls, newsroomTitle, now) {
  const due = release.published
    ? `${release.published}T09:00:00.000Z`
    : now;
  return {
    id: `cnt_prowly_${release.prowlyId}`,
    title: release.title,
    channel: ["PR"],
    content_type: "PR",
    owner: release.owner,
    due_date: due,
    deadline_date: null,
    status: "published",
    category: "press release",
    priority: "",
    website: "",
    caption: release.caption,
    theme_id: null,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "",
    asset_url: urls.hero || "",
    notes: `Imported from Prowly\n${release.url}`,
    share_token: "",
    share_enabled: false,
    pin_homepage: false,
    in_slider: false,
    newsroom_name: newsroomTitle,
    pr_location: "",
    pr_boilerplate: BOILERPLATE,
    pr_contact: release.contact,
    pr_document: {
      blocks: release.blocks.map((block) => {
        if (block.type === "image") {
          return {
            ...block,
            src: urls.images.get(block.src) || block.src,
          };
        }
        return block;
      }),
      show_date: true,
      tags: release.tags,
      show_tags: true,
      journalist_toolbox: false,
      attachments: release.attachments.map((file) => ({
        name: file.name,
        url: urls.files.get(file.url) || file.url,
      })),
      share_title: release.title.slice(0, 140),
      share_description: release.caption.slice(0, 300),
      seo: emptySeo(),
    },
    created_at: due,
    updated_at: now,
  };
}

const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");
const env = { ...loadEnv(path.join(ROOT, ".env.local")), ...process.env };
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing Supabase env in .env.local");
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const urls = await listReleaseUrls();
const releases = [];
for (const url of urls) {
  const html = await fetchText(url);
  releases.push(parseRelease(html, url));
}
releases.sort((a, b) => (a.published < b.published ? 1 : -1));

console.log(
  JSON.stringify(
    releases.map((release) => ({
      id: release.prowlyId,
      title: release.title,
      published: release.published,
      category: release.category,
      owner: release.owner,
      contact: release.contact,
      tags: release.tags,
      hero: release.hero,
      caption: release.caption.slice(0, 140),
      blocks: release.blocks.map((block) => block.type),
      images: release.blocks
        .filter((block) => block.type === "image")
        .map((block) => ({ alt: block.alt, src: block.src })),
      attachments: release.attachments,
    })),
    null,
    2
  )
);

if (!apply) {
  console.log(
    "\nDry run only. Re-run with --apply to create new releases. Pass --overwrite to update matches without changing status."
  );
  process.exit(0);
}

const { data: storeRow, error: readErr } = await supabase
  .from("hub_store")
  .select("payload, updated_at")
  .eq("id", HUB_STORE_ID)
  .maybeSingle();
if (readErr) throw new Error(readErr.message);
if (!storeRow?.payload) throw new Error("hub_store default row missing");

const payload = structuredClone(storeRow.payload);
const newsroomTitle =
  clean(payload.newsroom_settings?.title) || "Peters & May News";
const now = new Date().toISOString();
const content = Array.isArray(payload.content) ? payload.content : [];

const { data: tables, error: tablesErr } = await supabase
  .from("tables")
  .select("id,name,supabase_table");
if (tablesErr) throw new Error(tablesErr.message);
const mediaTable = (tables || []).find((table) =>
  /^table_media(_|$)/i.test(table.supabase_table)
);
if (!mediaTable) throw new Error("Media table not found");

const { data: actorRow, error: actorErr } = await supabase
  .from(mediaTable.supabase_table)
  .select("created_by")
  .not("created_by", "is", null)
  .limit(1);
if (actorErr) throw new Error(actorErr.message);
const actorId = actorRow?.[0]?.created_by;
if (!actorId) throw new Error("No media actor id");

const uploaded = new Map();
async function hosted(sourceUrl, prowlyId) {
  if (!sourceUrl) return "";
  if (uploaded.has(sourceUrl)) return uploaded.get(sourceUrl).url;
  const file = await uploadAsset(supabase, sourceUrl, prowlyId);
  uploaded.set(sourceUrl, file);
  return file.url;
}

function normTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'");
}

function findExistingRelease(rows, release) {
  const title = normTitle(release.title);
  const matches = rows.filter((row) => {
    if (String(row.id).startsWith("cnt_prowly_")) return false;
    if (normTitle(row.title) !== title) return false;
    const type = String(row.content_type || "").toLowerCase();
    const channels = (Array.isArray(row.channel) ? row.channel : []).map((value) =>
      String(value).toLowerCase()
    );
    return (
      String(row.id).startsWith("cnt_rel_") ||
      type === "pr" ||
      type === "press" ||
      channels.includes("pr") ||
      row.newsroom_name != null
    );
  });
  return (
    matches.find((row) => String(row.id).startsWith("cnt_rel_")) ||
    matches[0] ||
    null
  );
}

let added = 0;
let updated = 0;
let removedDuplicates = 0;
let skipped = 0;
const gallery = [];

for (const release of releases) {
  const prowlyId = `cnt_prowly_${release.prowlyId}`;
  const existingBefore = findExistingRelease(content, release);
  const duplicateBefore = content.findIndex((row) => row.id === prowlyId);
  if ((existingBefore || duplicateBefore !== -1) && !overwrite) {
    skipped += 1;
    continue;
  }

  const hero = await hosted(release.hero, release.prowlyId);
  const images = new Map();
  for (const block of release.blocks) {
    if (block.type !== "image") continue;
    images.set(block.src, await hosted(block.src, release.prowlyId));
  }
  const files = new Map();
  for (const file of release.attachments) {
    files.set(file.url, await hosted(file.url, release.prowlyId));
  }
  const item = toContentItem(
    release,
    { hero, images, files },
    newsroomTitle,
    now
  );
  const existing = findExistingRelease(content, release);
  const duplicateIndex = content.findIndex((row) => row.id === item.id);
  if (existing) {
    const index = content.findIndex((row) => row.id === existing.id);
    content[index] = {
      ...existing,
      owner: item.owner || existing.owner,
      due_date: item.due_date || existing.due_date,
      caption: item.caption,
      asset_url: item.asset_url,
      notes: item.notes,
      pr_boilerplate: item.pr_boilerplate,
      pr_contact: item.pr_contact || existing.pr_contact,
      pr_document: item.pr_document,
      status: existing.status,
      updated_at: now,
    };
    updated += 1;
    if (duplicateIndex !== -1) {
      content.splice(duplicateIndex, 1);
      removedDuplicates += 1;
    }
  } else if (duplicateIndex === -1) {
    content.push(item);
    added += 1;
  } else {
    content[duplicateIndex] = {
      ...content[duplicateIndex],
      ...item,
      status: content[duplicateIndex].status || item.status,
      pr_contact: item.pr_contact || content[duplicateIndex].pr_contact,
      created_at: content[duplicateIndex].created_at || item.created_at,
    };
    updated += 1;
  }

  const imageAssets = [
    release.hero
      ? { source: release.hero, alt: release.title, kind: "hero" }
      : null,
    ...release.blocks
      .filter((block) => block.type === "image")
      .map((block) => ({ source: block.src, alt: block.alt || release.title, kind: "inline" })),
  ].filter(Boolean);
  for (const asset of imageAssets) {
    const file = uploaded.get(asset.source);
    if (!file || !file.type.startsWith("image/")) continue;
    gallery.push({
      source: asset.source,
      name: asset.alt.slice(0, 140) || release.title,
      public_title: asset.alt.slice(0, 140) || release.title,
      file,
      releaseTitle: release.title,
    });
  }
}

payload.content = content;

const { data: casData, error: casErr } = await supabase.rpc("hub_store_cas_update", {
  p_id: HUB_STORE_ID,
  p_payload: payload,
  p_expected_updated_at: storeRow.updated_at,
});
if (casErr) throw new Error(`CAS update failed: ${casErr.message}`);
if (casData == null) {
  throw new Error("CAS conflict — hub_store changed while importing. Re-run the script.");
}

const { data: existingMedia, error: mediaReadErr } = await supabase
  .from(mediaTable.supabase_table)
  .select("id,notes")
  .is("deleted_at", null)
  .ilike("notes", "%Imported from Prowly image%");
if (mediaReadErr) throw new Error(mediaReadErr.message);
const existingNotes = new Set(
  (existingMedia || []).map((row) => String(row.notes || ""))
);

let galleryAdded = 0;
for (const asset of gallery) {
  const note = `Imported from Prowly image\n${asset.source}\n${asset.releaseTitle}`;
  if ([...existingNotes].some((row) => row.includes(asset.source))) continue;
  const id = crypto.randomUUID();
  const { error } = await supabase.from(mediaTable.supabase_table).insert({
    id,
    name: asset.name,
    public_title: asset.public_title,
    hub_category: "Gallery",
    subfolder: GALLERY_FOLDER,
    subfolder_visibility: "public",
    visibility: "public",
    division: "All",
    document_link: null,
    notes: note,
    status: "Published",
    media: [
      {
        url: asset.file.url,
        name: asset.file.name,
        type: asset.file.type,
        size: asset.file.size,
      },
    ],
    created_at: now,
    updated_at: now,
    created_by: actorId,
    updated_by: actorId,
    deleted_at: null,
  });
  if (error) throw new Error(`Gallery insert failed: ${error.message}`);
  existingNotes.add(note);
  galleryAdded += 1;
}

const localPath = path.join(ROOT, ".data", "store.json");
try {
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, JSON.stringify(payload, null, 2), "utf8");
} catch (err) {
  console.warn("Local store write skipped:", err.message);
}

console.log(
  JSON.stringify(
    {
      added,
      updated,
      skipped,
      removedDuplicates,
      galleryAdded,
      totalContent: content.length,
    },
    null,
    2
  )
);
