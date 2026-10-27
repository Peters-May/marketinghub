import { normalizeRichTextStorage } from "@/lib/sanitize";
import { plainTextFromHtml } from "@/lib/plain-text";
import {
  plainReleaseField,
  pressReleaseDateline,
} from "@/lib/pr/release-document";
import type {
  PressReleaseDocument,
  ReleaseAttachment,
  ReleaseBlock,
  ReleaseBlockType,
  ReleasePerson,
  ReleaseSeo,
} from "@/lib/types";

const MAX_BLOCKS = 80;
const MAX_LIST = 40;
const MAX_TABLE_ROWS = 12;
const MAX_TABLE_COLS = 8;
const MAX_GALLERY = 12;
const MAX_PEOPLE = 12;
const MAX_TAGS = 24;
const MAX_ATTACHMENTS = 20;

export const RELEASE_BLOCK_GROUPS: {
  label: string;
  items: { type: ReleaseBlockType; label: string; hint: string }[];
}[] = [
  {
    label: "Basic",
    items: [
      { type: "text", label: "Text", hint: "Simple text block" },
      { type: "header", label: "Header", hint: "Additional header inside the release" },
      { type: "subheader", label: "Sub header", hint: "Sub header inside the release" },
      { type: "lead", label: "Lead", hint: "Special text format for a standfirst" },
      { type: "ul", label: "Unordered list", hint: "Standard bullet list" },
      { type: "ol", label: "Ordered list", hint: "Standard numbered list" },
      { type: "quote", label: "Quote", hint: "Emphasise a comment or statement" },
      { type: "annotation", label: "Annotation", hint: "Footnotes or a minor comment" },
      { type: "table", label: "Table", hint: "Rows and columns" },
      { type: "divider", label: "Divider", hint: "A horizontal line" },
    ],
  },
  {
    label: "Design",
    items: [
      { type: "image", label: "Image", hint: "A single image" },
      { type: "gallery", label: "Gallery", hint: "Several images" },
      { type: "full_image", label: "Full width image", hint: "Large image across the page" },
      { type: "full_video", label: "Full width video", hint: "Large video across the page" },
    ],
  },
  {
    label: "Building blocks",
    items: [
      { type: "authors", label: "Authors", hint: "Authors and contact details" },
      { type: "spokespeople", label: "Spokespeople", hint: "Spokespeople and contact details" },
      { type: "button", label: "Call-to-action button", hint: "A button with a URL" },
    ],
  },
];

export function emptyReleasePerson(): ReleasePerson {
  return { name: "", role: "", organisation: "", email: "", phone: "" };
}

export function emptyReleaseSeo(): ReleaseSeo {
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

export function emptyReleaseDocument(): PressReleaseDocument {
  return {
    blocks: [],
    show_date: true,
    tags: [],
    show_tags: false,
    journalist_toolbox: false,
    attachments: [],
    share_title: "",
    share_description: "",
    seo: emptyReleaseSeo(),
  };
}

/** http(s) or a same-site path. Drops javascript and other schemes. */
export function safeReleaseUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 2000) return "";
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
    return raw;
  }
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return raw;
  } catch {
    return "";
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function htmlField(value: unknown): string {
  return normalizeRichTextStorage(String(value ?? ""));
}

function lines(value: unknown, max: number, length: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, max)
    .map((item) => plainReleaseField(item, length))
    .filter((item) => item.length > 0);
}

function person(value: unknown): ReleasePerson | null {
  const row = asRecord(value);
  if (!row) return null;
  const next: ReleasePerson = {
    name: plainReleaseField(row.name, 120),
    role: plainReleaseField(row.role, 120),
    organisation: plainReleaseField(row.organisation, 120),
    email: plainReleaseField(row.email, 160),
    phone: plainReleaseField(row.phone, 40),
  };
  if (!next.name && !next.role && !next.email && !next.phone) return null;
  return next;
}

function people(value: unknown): ReleasePerson[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_PEOPLE)
    .map(person)
    .filter((row): row is ReleasePerson => row !== null);
}

function blockId(value: unknown, index: number, used: Set<string>): string {
  const raw = String(value ?? "").trim();
  let id = /^[A-Za-z0-9_-]{1,40}$/.test(raw) ? raw : `blk_${index + 1}`;
  while (used.has(id)) id = `${id}_${index + 1}`;
  used.add(id);
  return id;
}

function imageFields(row: Record<string, unknown>) {
  return {
    src: safeReleaseUrl(row.src),
    alt: plainReleaseField(row.alt, 180),
    caption: plainReleaseField(row.caption, 240),
  };
}

function sanitizeBlock(
  value: unknown,
  index: number,
  used: Set<string>
): ReleaseBlock | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = blockId(row.id, index, used);
  const type = String(row.type ?? "");
  switch (type) {
    case "text":
    case "lead":
    case "annotation":
      return { id, type, html: htmlField(row.html) };
    case "header":
    case "subheader":
      return { id, type, text: plainReleaseField(row.text, 240) };
    case "ul":
    case "ol":
      return { id, type, items: lines(row.items, MAX_LIST, 400) };
    case "quote":
      return {
        id,
        type,
        text: plainReleaseField(row.text, 800),
        attribution: plainReleaseField(row.attribution, 160),
      };
    case "table": {
      const rows = Array.isArray(row.rows) ? row.rows.slice(0, MAX_TABLE_ROWS) : [];
      return {
        id,
        type,
        rows: rows.map((line) =>
          Array.isArray(line)
            ? line.slice(0, MAX_TABLE_COLS).map((cell) => plainReleaseField(cell, 240))
            : []
        ),
      };
    }
    case "divider":
      return { id, type };
    case "image":
    case "full_image":
      return { id, type, ...imageFields(row) };
    case "gallery": {
      const images = Array.isArray(row.images) ? row.images : [];
      return {
        id,
        type,
        images: images
          .slice(0, MAX_GALLERY)
          .map((image) => {
            const item = asRecord(image);
            if (!item) return null;
            const src = safeReleaseUrl(item.src);
            if (!src) return null;
            return { src, alt: plainReleaseField(item.alt, 180) };
          })
          .filter((image): image is { src: string; alt: string } => image !== null),
      };
    }
    case "full_video":
      return {
        id,
        type,
        src: safeReleaseUrl(row.src),
        poster: safeReleaseUrl(row.poster),
      };
    case "button":
      return {
        id,
        type,
        label: plainReleaseField(row.label, 80),
        href: safeReleaseUrl(row.href),
      };
    case "authors":
    case "spokespeople":
      return { id, type, people: people(row.people) };
    default:
      return null;
  }
}

function sanitizeSeo(value: unknown): ReleaseSeo {
  const row = asRecord(value) ?? {};
  const flag = (key: keyof ReleaseSeo) => row[key] === true;
  return {
    canonical: safeReleaseUrl(row.canonical),
    keywords: plainReleaseField(row.keywords, 500),
    noindex: flag("noindex"),
    nofollow: flag("nofollow"),
    noarchive: flag("noarchive"),
    nosnippet: flag("nosnippet"),
    notranslate: flag("notranslate"),
    noimageindex: flag("noimageindex"),
    redirect_url: safeReleaseUrl(row.redirect_url),
    redirect_enabled: row.redirect_enabled === true,
  };
}

function sanitizeAttachments(value: unknown): ReleaseAttachment[] {
  if (!Array.isArray(value)) return [];
  const files: ReleaseAttachment[] = [];
  for (const item of value.slice(0, MAX_ATTACHMENTS)) {
    const row = asRecord(item);
    if (!row) continue;
    const url = safeReleaseUrl(row.url);
    if (!url) continue;
    const fallback = decodeURIComponent(url.split("?")[0]?.split("/").pop() || "File");
    files.push({
      url,
      name: plainReleaseField(row.name, 160) || fallback || "File",
    });
  }
  return files;
}

function sanitizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    const tag = plainReleaseField(item, 40);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

export function sanitizePressReleaseDocument(value: unknown): PressReleaseDocument {
  const row = asRecord(value);
  if (!row) return emptyReleaseDocument();
  const used = new Set<string>();
  const blocks = Array.isArray(row.blocks)
    ? row.blocks
        .slice(0, MAX_BLOCKS)
        .map((block, index) => sanitizeBlock(block, index, used))
        .filter((block): block is ReleaseBlock => block !== null)
    : [];
  return {
    blocks,
    show_date: row.show_date !== false,
    tags: sanitizeTags(row.tags),
    show_tags: row.show_tags === true,
    journalist_toolbox: row.journalist_toolbox === true,
    attachments: sanitizeAttachments(row.attachments),
    share_title: plainReleaseField(row.share_title, 140),
    share_description: plainReleaseField(row.share_description, 300),
    seo: sanitizeSeo(row.seo),
  };
}

/** A release that only has HTML in notes opens as one text block. */
export function seedReleaseDocument(
  document: unknown,
  notes: string
): PressReleaseDocument {
  const next = sanitizePressReleaseDocument(document);
  if (next.blocks.length > 0) return next;
  const html = normalizeRichTextStorage(notes);
  if (!html) return next;
  return {
    ...next,
    blocks: [{ id: "blk_legacy", type: "text", html }],
  };
}

export function createReleaseBlock(type: ReleaseBlockType, id: string): ReleaseBlock {
  switch (type) {
    case "text":
    case "lead":
    case "annotation":
      return { id, type, html: "" };
    case "header":
    case "subheader":
      return { id, type, text: "" };
    case "ul":
    case "ol":
      return { id, type, items: [""] };
    case "quote":
      return { id, type, text: "", attribution: "" };
    case "table":
      return {
        id,
        type,
        rows: [
          ["", ""],
          ["", ""],
        ],
      };
    case "divider":
      return { id, type };
    case "image":
    case "full_image":
      return { id, type, src: "", alt: "", caption: "" };
    case "gallery":
      return { id, type, images: [] };
    case "full_video":
      return { id, type, src: "", poster: "" };
    case "button":
      return { id, type, label: "Read more", href: "" };
    case "authors":
    case "spokespeople":
      return { id, type, people: [emptyReleasePerson()] };
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function personLines(personRow: ReleasePerson): string[] {
  return [
    personRow.name,
    [personRow.role, personRow.organisation].filter(Boolean).join(", "),
    personRow.email,
    personRow.phone,
  ].filter(Boolean);
}

export function renderBlocksHtml(blocks: ReleaseBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "text":
        case "lead":
        case "annotation":
          return block.html;
        case "header":
          return block.text ? `<h2>${esc(block.text)}</h2>` : "";
        case "subheader":
          return block.text ? `<h3>${esc(block.text)}</h3>` : "";
        case "ul":
          return block.items.length
            ? `<ul>${block.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
            : "";
        case "ol":
          return block.items.length
            ? `<ol>${block.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>`
            : "";
        case "quote":
          if (!block.text && !block.attribution) return "";
          return `<blockquote><p>${esc(block.text)}</p>${
            block.attribution ? `<p>${esc(block.attribution)}</p>` : ""
          }</blockquote>`;
        case "table":
          if (!block.rows.length) return "";
          return `<table><tbody>${block.rows
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`
            )
            .join("")}</tbody></table>`;
        case "divider":
          return "<hr>";
        case "image":
        case "full_image":
          return [block.alt, block.caption].filter(Boolean).map((line) => `<p>${esc(line)}</p>`).join("");
        case "gallery":
          return block.images
            .map((image) => (image.alt ? `<p>${esc(image.alt)}</p>` : ""))
            .join("");
        case "full_video":
          return block.src ? `<p>${esc(block.src)}</p>` : "";
        case "button":
          if (!block.label) return "";
          return block.href
            ? `<p><a href="${esc(block.href)}">${esc(block.label)}</a></p>`
            : `<p>${esc(block.label)}</p>`;
        case "authors":
        case "spokespeople":
          return block.people
            .map((row) => `<p>${esc(personLines(row).join("\n")).replace(/\n/g, "<br>")}</p>`)
            .join("");
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("");
}

export function blocksToPlainText(blocks: ReleaseBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "text":
        case "lead":
        case "annotation":
          return plainTextFromHtml(block.html);
        case "header":
        case "subheader":
          return block.text;
        case "ul":
        case "ol":
          return block.items.map((item) => `• ${item}`).join("\n");
        case "quote":
          return [block.text, block.attribution].filter(Boolean).join("\n");
        case "table":
          return block.rows.map((row) => row.join(" | ")).join("\n");
        case "image":
        case "full_image":
          return [block.caption, block.alt].filter(Boolean).join("\n");
        case "gallery":
          return block.images.map((image) => image.alt).filter(Boolean).join("\n");
        case "button":
          return [block.label, block.href].filter(Boolean).join(" ");
        case "authors":
        case "spokespeople":
          return block.people.map((row) => personLines(row).join(", ")).join("\n");
        case "full_video":
          return block.src;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

export function releasePlainText(input: {
  title: string;
  subtitle: string;
  location: string;
  date: string | null;
  showDate: boolean;
  blocks: ReleaseBlock[];
  boilerplate: string;
  contact: string;
  attachments: ReleaseAttachment[];
}): string {
  const parts = [
    input.title,
    pressReleaseDateline(input.location, input.showDate ? input.date : null),
    plainTextFromHtml(input.subtitle),
    blocksToPlainText(input.blocks),
    plainTextFromHtml(input.boilerplate),
    input.contact.trim(),
    input.attachments.map((file) => `${file.name} ${file.url}`).join("\n"),
  ];
  return parts.filter(Boolean).join("\n\n");
}
