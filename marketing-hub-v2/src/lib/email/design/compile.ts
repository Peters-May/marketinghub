import { ensureUnsubscribeFooter, ensureViewInBrowserLink } from "@/lib/email/merge";
import { resolveFooterLinkSettings } from "@/lib/email/footer-links";
import type {
  EmailBlock,
  EmailDesign,
  EmailSection,
  SectionShowFor,
} from "@/lib/email/design/types";
import { extractEmailBody, OFFICE_FOOTER } from "@/lib/email/design/document";

export type CompileEmailOptions = {
  /** When set, sections with a matching showFor (or "all") are kept. */
  topic?: SectionShowFor | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

const GALLERY_PATH =
  /^\/api\/email\/gallery\/file\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;

/** Allow http(s), mailto, and merge tokens. */
export function safeEmailUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^\{\{\s*[a-zA-Z0-9_]+\s*\}\}$/.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  return "";
}

function appOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3001";
}

/** Image src for the canvas, or an absolute URL when the email is compiled. */
export function emailImageSrc(url: string, absolute: boolean): string {
  const trimmed = url.trim();
  if (GALLERY_PATH.test(trimmed)) {
    return absolute ? `${appOrigin()}${trimmed}` : trimmed;
  }
  return safeEmailUrl(trimmed);
}

const RICH_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "span",
  "blockquote",
]);

/** Keep a small set of tags for text blocks. */
export function sanitizeRichEmailHtml(html: string): string {
  const withoutDanger = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  return withoutDanger.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag, attrs) => {
    const name = String(tag).toLowerCase();
    if (!RICH_TAGS.has(name)) return "";
    if (full.startsWith("</")) return `</${name}>`;
    if (name === "br") return "<br>";
    if (name === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(String(attrs));
      const url = safeEmailUrl(href?.[2] || href?.[3] || "");
      return url ? `<a href="${escapeAttr(url)}" style="color:inherit;">` : "<span>";
    }
    return `<${name}>`;
  });
}

/** Paragraph spacing shared with the canvas and the selected editor. */
function emailRichHtml(html: string): string {
  return sanitizeRichEmailHtml(html)
    .replace(/<p>/g, '<p style="margin:0 0 12px;">')
    .replace(/<h2>/g, '<h2 style="margin:12px 0 6px;font-size:1.15em;line-height:1.3;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 12px;padding-left:20px;">')
    .replace(/<ol>/g, '<ol style="margin:0 0 12px;padding-left:20px;">');
}

/** HTML blocks keep layout markup, without scripts or event handlers. */
export function sanitizeHtmlBlock(html: string): string {
  return extractEmailBody(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function paddingStyle(block: EmailBlock): string {
  return `padding:${block.paddingTop}px ${block.paddingRight}px ${block.paddingBottom}px ${block.paddingLeft}px;`;
}

function alignStyle(align: EmailBlock["align"]): string {
  return `text-align:${align};`;
}

function renderBlock(block: EmailBlock, design: EmailDesign): string {
  const styles = design.styles;
  const pad = paddingStyle(block);
  const align = alignStyle(block.align);

  switch (block.type) {
    case "heading": {
      const level = block.level === 2 || block.level === 3 ? block.level : 1;
      const tag = `h${level}`;
      return `<${tag} style="margin:0;${pad}${align}font-family:${styles.headingFontFamily};font-size:${block.fontSize}px;line-height:1.2;font-weight:600;color:${escapeAttr(block.color || styles.textColor)};">${escapeHtml(block.text)}</${tag}>`;
    }
    case "text":
      return `<div style="margin:0;${pad}${align}font-family:${styles.fontFamily};font-size:${block.fontSize}px;line-height:1.5;color:${escapeAttr(block.color || styles.textColor)};">${emailRichHtml(block.html)}</div>`;
    case "image": {
      const src = emailImageSrc(block.src, true);
      if (!src) {
        return "";
      }
      const width = Math.round((styles.contentWidth * block.widthPercent) / 100);
      const img = `<img src="${escapeAttr(src)}" alt="${escapeAttr(block.alt)}" width="${width}" style="display:inline-block;border:0;max-width:100%;height:auto;width:${block.widthPercent}%;" />`;
      const href = safeEmailUrl(block.href);
      const linked = href ? `<a href="${escapeAttr(href)}">${img}</a>` : img;
      return `<div style="${pad}${align}">${linked}</div>`;
    }
    case "logo": {
      const src = emailImageSrc(block.src, true);
      const href = safeEmailUrl(block.href);
      const inner = src
        ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(block.alt || "Peters & May")}" width="${block.width}" style="display:inline-block;border:0;max-width:100%;height:auto;width:${block.width}px;" />`
        : `<span style="font-family:${styles.headingFontFamily};font-size:18px;font-weight:600;color:${styles.textColor};">${escapeHtml(block.alt || "Peters & May")}</span>`;
      const linked = href ? `<a href="${escapeAttr(href)}" style="text-decoration:none;color:${styles.textColor};">${inner}</a>` : inner;
      return `<div style="${pad}${align}">${linked}</div>`;
    }
    case "button": {
      const href = safeEmailUrl(block.href) || "#";
      const width = block.fullWidth ? "display:block;width:100%;" : "display:inline-block;";
      const fontSize = block.fontSize || 16;
      const padX = block.paddingX ?? 22;
      const padY = block.paddingY ?? 14;
      const borderW = block.borderWidth ?? 0;
      const border =
        borderW > 0 && block.borderColor
          ? `border:${borderW}px solid ${escapeAttr(block.borderColor)};`
          : "border:0;";
      return `<div style="${pad}${align}"><a href="${escapeAttr(href)}" style="${width}background:${escapeAttr(block.background)};color:${escapeAttr(block.color)};font-family:${styles.fontFamily};font-size:${fontSize}px;font-weight:600;line-height:1;text-decoration:none;padding:${padY}px ${padX}px;border-radius:${block.radius}px;${border}">${escapeHtml(block.label || "Read more")}</a></div>`;
    }
    case "divider":
      return `<div style="${pad}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:${block.thickness}px solid ${escapeAttr(block.color)};font-size:0;line-height:0;">&nbsp;</td></tr></table></div>`;
    case "spacer":
      return `<div style="height:${block.height}px;line-height:${block.height}px;font-size:1px;">&nbsp;</div>`;
    case "social": {
      const links = block.links
        .map((link) => {
          const url = safeEmailUrl(link.url);
          if (!url) return "";
          const label =
            link.network === "linkedin"
              ? "LinkedIn"
              : link.network === "instagram"
                ? "Instagram"
                : link.network === "youtube"
                  ? "YouTube"
                  : "Facebook";
          return `<a href="${escapeAttr(url)}" style="color:${styles.linkColor};text-decoration:underline;font-family:${styles.fontFamily};font-size:13px;">${label}</a>`;
        })
        .filter(Boolean);
      if (links.length === 0) return "";
      return `<div style="${pad}${align}font-family:${styles.fontFamily};font-size:13px;line-height:1.6;">${links.join("&nbsp;&nbsp;")}</div>`;
    }
    case "html":
      return `<div style="${pad}">${sanitizeHtmlBlock(block.html)}</div>`;
    case "footer": {
      const footerText =
        block.text.trim() === "Peters & May" ? OFFICE_FOOTER : block.text;
      const links = resolveFooterLinkSettings(styles, block);
      const linkParts: string[] = [];
      if (links.showUnsubscribe) {
        linkParts.push(
          `<a href="{{unsubscribe_url}}" style="color:${styles.linkColor};">${escapeHtml(links.unsubscribeLabel)}</a>`
        );
      }
      if (links.showPreferences) {
        linkParts.push(
          `<a href="{{preferences_url}}" style="color:${styles.linkColor};">${escapeHtml(links.preferencesLabel)}</a>`
        );
      }
      const linkRow =
        linkParts.length > 0
          ? `<p style="margin:8px 0 0;">${linkParts.join(" &nbsp;|&nbsp; ")}</p>`
          : "";
      return `<div style="${pad}${align}font-family:${styles.fontFamily};font-size:12px;line-height:1.5;color:#666666;">${sanitizeRichEmailHtml(footerText).replace(/\n/g, "<br>")}${linkRow}</div>`;
    }
    case "video": {
      const thumb = emailImageSrc(block.thumbnailSrc, true);
      const href = safeEmailUrl(block.videoUrl);
      if (!href) return "";
      const width = Math.round((styles.contentWidth * block.widthPercent) / 100);
      const img = thumb
        ? `<img src="${escapeAttr(thumb)}" alt="${escapeAttr(block.alt || "Watch video")}" width="${width}" style="display:block;border:0;max-width:100%;height:auto;width:100%;" />`
        : `<span style="display:inline-block;padding:28px 20px;background:#0B2545;color:#ffffff;font-family:${styles.fontFamily};font-size:16px;font-weight:600;">Watch video</span>`;
      return `<div style="${pad}${align}"><a href="${escapeAttr(href)}" style="text-decoration:none;">${img}</a><p style="margin:8px 0 0;font-family:${styles.fontFamily};font-size:12px;color:#666666;"><a href="${escapeAttr(href)}" style="color:${styles.linkColor};">Watch the video</a></p></div>`;
    }
    case "quote": {
      const attr = block.attribution.trim()
        ? `<p style="margin:10px 0 0;font-family:${styles.fontFamily};font-size:13px;color:#666666;">— ${escapeHtml(block.attribution)}</p>`
        : "";
      return `<div style="${pad}${align}border-left:4px solid ${escapeAttr(block.accentColor)};padding-left:${Math.max(12, block.paddingLeft)}px;"><p style="margin:0;font-family:${styles.headingFontFamily};font-size:${block.fontSize}px;line-height:1.35;font-weight:600;color:${escapeAttr(block.color || styles.textColor)};">${escapeHtml(block.text)}</p>${attr}</div>`;
    }
    case "content_card": {
      const src = emailImageSrc(block.imageSrc, true);
      const href = safeEmailUrl(block.ctaHref) || "#";
      const image = src
        ? `<img src="${escapeAttr(src)}" alt="" width="100%" style="display:block;border:0;max-width:100%;height:auto;margin:0 0 12px;" />`
        : "";
      const cta = block.ctaLabel.trim()
        ? `<p style="margin:12px 0 0;"><a href="${escapeAttr(href)}" style="display:inline-block;background:${escapeAttr(styles.buttonBackground)};color:${escapeAttr(styles.buttonColor)};font-family:${styles.fontFamily};font-size:14px;font-weight:600;text-decoration:none;padding:12px 18px;border-radius:${styles.buttonRadius}px;">${escapeHtml(block.ctaLabel)}</a></p>`
        : "";
      return `<div style="${pad}${align}border:1px solid #E3E6E9;padding:16px;">${image}<h2 style="margin:0 0 8px;font-family:${styles.headingFontFamily};font-size:22px;line-height:1.25;color:${escapeAttr(styles.textColor)};">${escapeHtml(block.title)}</h2><div style="font-family:${styles.fontFamily};font-size:15px;line-height:1.5;color:${escapeAttr(styles.textColor)};">${emailRichHtml(block.bodyHtml)}</div>${cta}</div>`;
    }
    default:
      return "";
  }
}

function sectionVisibleForTopic(
  section: EmailSection,
  topic?: SectionShowFor | null
): boolean {
  if (!section.showFor || section.showFor === "all") return true;
  if (!topic || topic === "all") return true;
  return section.showFor === topic;
}

function renderSection(section: EmailSection, design: EmailDesign): string {
  const background = section.background || design.styles.contentBackground;
  const valign =
    section.verticalAlign === "middle"
      ? "middle"
      : section.verticalAlign === "bottom"
        ? "bottom"
        : "top";
  // Reverse DOM order + dir=rtl keeps desktop LTR while stacking right-first on mobile.
  const reverse = section.mobileStack === "reverse";
  const ordered = reverse ? [...section.columns].reverse() : section.columns;
  const cells = ordered
    .map((col, index) => {
      const padLeft = reverse
        ? index === ordered.length - 1
          ? 0
          : section.columnGap
        : index === 0
          ? 0
          : section.columnGap;
      const inner = col.blocks.map((block) => renderBlock(block, design)).join("");
      return `<td class="em-stack" valign="${valign}" width="${col.width}%" style="width:${col.width}%;padding-left:${padLeft}px;vertical-align:${valign};${
        reverse ? "direction:ltr;" : ""
      }">${inner}</td>`;
    })
    .join("");
  const rowAttr = reverse ? ' dir="rtl"' : "";
  return `<tr><td style="background:${escapeAttr(background)};padding:${section.paddingTop}px ${section.paddingRight}px ${section.paddingBottom}px ${section.paddingLeft}px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr${rowAttr}>${cells}</tr></table></td></tr>`;
}

export function compileEmailDesign(
  design: EmailDesign,
  options?: CompileEmailOptions
): string {
  const styles = design.styles;
  const width = styles.contentWidth;
  const sections = design.sections
    .filter((section) => sectionVisibleForTopic(section, options?.topic))
    .map((section) => renderSection(section, design))
    .join("");
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title></title>
<style>
  body { margin:0; padding:0; }
  @media only screen and (max-width: 620px) {
    .em-container { width:100% !important; }
    .em-stack { display:block !important; width:100% !important; max-width:100% !important; padding-left:0 !important; direction:ltr !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${escapeAttr(styles.pageBackground)};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${escapeAttr(styles.pageBackground)};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="em-container" width="${width}" cellpadding="0" cellspacing="0" style="width:${width}px;max-width:${width}px;background:${escapeAttr(styles.contentBackground)};">
${sections}
</table>
</td></tr>
</table>
</body>
</html>`;
  const linkSettings = resolveFooterLinkSettings(styles);
  return ensureViewInBrowserLink(
    ensureUnsubscribeFooter(html, {
      showUnsubscribe: linkSettings.showUnsubscribe,
      showPreferences: linkSettings.showPreferences,
      unsubscribeLabel: linkSettings.unsubscribeLabel,
      preferencesLabel: linkSettings.preferencesLabel,
      linkColor: styles.linkColor,
    })
  );
}
