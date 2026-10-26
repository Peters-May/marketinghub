import type { ContentItem } from "@/lib/types";
import { compileEmailDesign, pressPitchDesign } from "@/lib/email/design";
import { imageAssetUrls, parseAssetUrls } from "@/lib/data/normalize";
import {
  isRichTextEmpty,
  looksLikeHtml,
  plainTextFromHtml,
} from "@/lib/plain-text";
import { formatReleaseDate } from "@/lib/pr/release-document";

export const PRESS_PITCH_TEMPLATE_ID = "etpl_press_pitch";

const DEFAULT_BOILER =
  "Peters & May is a global specialist in bespoke logistics. The company ships commercial and private vessels, and moves cargo by air, land and sea.";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absoluteUrl(origin: string, url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) {
    return `${origin.replace(/\/$/, "")}${trimmed}`;
  }
  return "";
}

function fileLabel(url: string): string {
  const path = url.split("?")[0] ?? url;
  const name = decodeURIComponent(path.split("/").pop() || "File");
  return name || "File";
}

function richBlock(value: string, fallback: string): string {
  if (isRichTextEmpty(value)) return `<p>${esc(fallback)}</p>`;
  if (looksLikeHtml(value)) return value;
  return value
    .split(/\n{2,}/)
    .map((part) => `<p>${esc(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function pressPitchTemplateRecord(now: string) {
  const design = pressPitchDesign();
  return {
    id: PRESS_PITCH_TEMPLATE_ID,
    name: "Press pitch",
    subject_default: "Press release from Peters & May",
    preview_text_default: "A release for your newsdesk",
    html_body: compileEmailDesign(design),
    design,
    created_at: now,
    updated_at: now,
  };
}

/** Fill the press-pitch layout from a release and other newsroom stories. */
export function pressPitchFromRelease(
  release: ContentItem,
  others: ContentItem[],
  origin: string
) {
  const images = imageAssetUrls(release.asset_url)
    .map((url) => absoluteUrl(origin, url))
    .filter(Boolean);
  const files = parseAssetUrls(release.asset_url)
    .map((url) => absoluteUrl(origin, url))
    .filter(Boolean);
  const related = others
    .filter((item) => item.id !== release.id)
    .sort((a, b) => {
      const rank = (item: ContentItem) => (item.status === "published" ? 0 : 1);
      return rank(a) - rank(b);
    })
    .slice(0, 3);
  const newsroom = absoluteUrl(origin, "/newsroom");
  const lead = plainTextFromHtml(release.caption || "");
  const story = [
    lead ? `<p>${esc(lead)}</p>` : "",
    isRichTextEmpty(release.notes) ? "" : richBlock(release.notes, ""),
  ]
    .filter(Boolean)
    .join("");
  const category = (release.category || "").trim();
  const releaseType =
    !category || category.toLowerCase() === "press release"
      ? "Press release"
      : category;
  const articles = [
    `<p><a href="${esc(newsroom)}">Visit the newsroom</a></p>`,
    ...related.map((item) => {
      const href = absoluteUrl(origin, `/newsroom/${item.id}`);
      return `<p><a href="${esc(href)}">${esc(item.title)}</a></p>`;
    }),
  ].join("");
  const media = files.length
    ? files
        .map(
          (url) =>
            `<p><a href="${esc(url)}">${esc(fileLabel(url))}</a></p>`
        )
        .join("")
    : "<p>Add downloadable images and files here.</p>";
  const contact = (release.pr_contact || "").trim();

  return pressPitchDesign({
    releaseType,
    title: release.title || "Release headline",
    imageSrc: images[0] || "",
    imageAlt: release.title,
    storyHtml: story || "<p>Write the release here.</p>",
    extraImages: images.slice(1).map((src) => ({ src, alt: release.title })),
    articlesHtml: articles,
    boilerplateHtml: richBlock(release.pr_boilerplate || "", DEFAULT_BOILER),
    mediaHtml: media,
    related: related.map((item) => {
      const excerpt = plainTextFromHtml(item.caption || item.notes).slice(0, 180);
      const date = formatReleaseDate(item.due_date || item.updated_at);
      const body = [date, excerpt].filter(Boolean).map((line) => `<p>${esc(line)}</p>`).join("");
      return {
        title: item.title,
        imageSrc: imageAssetUrls(item.asset_url)
          .map((url) => absoluteUrl(origin, url))
          .find(Boolean) || "",
        bodyHtml: body || "<p>Newsroom story.</p>",
        href: absoluteUrl(origin, `/newsroom/${item.id}`),
      };
    }),
    contactsHtml: contact
      ? `<p>${esc(contact).replace(/\n/g, "<br>")}</p>`
      : "<p>Name<br>Role, Peters &amp; May<br>email@petersandmay.com</p>",
  });
}
