import { ensureUnsubscribeFooter, ensureViewInBrowserLink } from "@/lib/email/merge";
import {
  resolveFooterLinkSettings,
  type FooterLinkSettings,
} from "@/lib/email/footer-links";
import type {
  EmailBlock,
  EmailDesign,
  EmailSection,
  SectionShowFor,
} from "@/lib/email/design/types";
import { extractEmailBody, OFFICE_FOOTER } from "@/lib/email/design/document";
import { cssNumber, cssValue } from "@/lib/email/css-value";

export type CompileEmailOptions = {
  /** When set, sections with a matching showFor (or "all") are kept. */
  topic?: SectionShowFor | null;
  /** Hub Email → Settings footer links (overrides design styles when set). */
  footerLinks?: FooterLinkSettings | null;
  /** Inbox snippet. Merge tokens such as {{first_name}} are left for send time. */
  previewText?: string;
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

/** Merge tokens that are filled with a link we build. Contact fields are not links. */
const URL_MERGE_TOKENS = new Set(["unsubscribe_url", "preferences_url", "view_in_browser_url"]);

/** Allow http(s), mailto, and the link merge tokens. */
export function safeEmailUrl(url: string): string {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return "";
  const token = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/.exec(trimmed);
  if (token) return URL_MERGE_TOKENS.has(token[1].toLowerCase()) ? trimmed : "";
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

const DATA_IMAGE =
  /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\r\n]+$/i;

/** Image src for the canvas, or an absolute URL when the email is compiled. */
export function emailImageSrc(url: string, absolute: boolean): string {
  const trimmed = url.trim();
  if (DATA_IMAGE.test(trimmed)) return trimmed.replace(/\s+/g, "");
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
export function sanitizeRichEmailHtml(html: string, linkColor?: string): string {
  const color = escapeAttr(cssValue(linkColor, "inherit"));
  const withoutDanger = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // A tag with no closing ">" would otherwise survive and be closed by
    // the markup we wrap around it, e.g. a trailing `<img src=x onerror=…`.
    .replace(/<[a-z!/][^>]*$/i, "");
  return withoutDanger.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag, attrs) => {
    const name = String(tag).toLowerCase();
    if (!RICH_TAGS.has(name)) return "";
    if (full.startsWith("</")) return `</${name}>`;
    if (name === "br") return "<br>";
    if (name === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(String(attrs));
      const url = safeEmailUrl(href?.[2] || href?.[3] || "");
      return url
        ? `<a href="${escapeAttr(url)}" style="color:${color};text-decoration:underline;">`
        : "<span>";
    }
    return `<${name}>`;
  });
}

/** Paragraph spacing shared with the canvas and the selected editor. */
function emailRichHtml(html: string, linkColor?: string): string {
  return sanitizeRichEmailHtml(html, linkColor)
    .replace(/<p>/g, '<p style="margin:0 0 12px;">')
    .replace(/<h2>/g, '<h2 style="margin:12px 0 6px;font-size:1.15em;line-height:1.3;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 12px;padding-left:20px;">')
    .replace(/<ol>/g, '<ol style="margin:0 0 12px;padding-left:20px;">');
}

/** HTML blocks keep layout markup, without scripts or event handlers. */
export function sanitizeHtmlBlock(html: string): string {
  return extractEmailBody(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|iframe|object|noscript|template|form)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|iframe|object|embed|base|meta|link|form|noscript|template)\b[^>]*>/gi, "")
    .replace(/<[a-z!/][^>]*$/i, "")
    // Attributes can follow a quote or a slash with no space: <img src=x/onerror=…>.
    .replace(/([\s"'/])(on[a-z]+|srcdoc|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "$1")
    .replace(/(java|vb)script\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "");
}

/** Design keys written into markup as numbers (px, %, levels). */
const NUMERIC_STYLE_KEYS = new Set([
  "fontSize",
  "width",
  "widthPercent",
  "thickness",
  "height",
  "radius",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "paddingX",
  "paddingY",
  "borderWidth",
  "contentWidth",
  "buttonRadius",
  "columnGap",
]);

/** Design keys written into style="…" as text. */
const TEXT_STYLE_KEYS = new Set([
  "fontFamily",
  "headingFontFamily",
  "linkColor",
  "textColor",
  "pageBackground",
  "contentBackground",
  "buttonBackground",
  "buttonColor",
  "background",
  "color",
  "borderColor",
  "accentColor",
]);

const ALIGNMENTS = new Set(["left", "center", "right"]);

function cleanStyleFields<T extends object>(value: T): T {
  const out = { ...value } as Record<string, unknown>;
  for (const [key, field] of Object.entries(out)) {
    if (field === undefined || field === null) continue;
    if (NUMERIC_STYLE_KEYS.has(key)) out[key] = cssNumber(field);
    else if (TEXT_STYLE_KEYS.has(key)) out[key] = cssValue(field);
    else if (key === "align" && !ALIGNMENTS.has(String(field))) out[key] = "left";
  }
  return out as T;
}

/**
 * Design JSON is saved from the browser, so a colour, font or width can
 * hold anything. Clean every value that is written into markup unescaped.
 */
function safeDesignForCompile(design: EmailDesign): EmailDesign {
  return {
    ...design,
    styles: cleanStyleFields(design.styles),
    sections: design.sections.map((section) => ({
      ...cleanStyleFields(section),
      columns: section.columns.map((column) => ({
        ...cleanStyleFields(column),
        blocks: column.blocks.map((block) => cleanStyleFields(block)),
      })),
    })),
  };
}

function paddingStyle(block: EmailBlock): string {
  return `padding:${block.paddingTop}px ${block.paddingRight}px ${block.paddingBottom}px ${block.paddingLeft}px;`;
}

function alignStyle(align: EmailBlock["align"]): string {
  return `text-align:${align};`;
}

const PRESENTATION =
  'role="presentation" cellpadding="0" cellspacing="0" border="0"';

/**
 * Outlook's Word engine ignores padding and border-radius on a link, so a
 * CSS button paints as a highlight on the words. Word gets a VML shape.
 * Other clients get a table cell with the same padding and colour.
 */
function bulletproofButton(options: {
  href: string;
  label: string;
  background: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  padX: number;
  padY: number;
  radius: number;
  fullWidth: boolean;
  align: EmailBlock["align"];
  borderWidth: number;
  borderColor: string;
  contentWidth: number;
}): string {
  const label = options.label.trim() || "Read more";
  const bg = escapeAttr(options.background);
  const fg = escapeAttr(options.color);
  const font = escapeAttr(options.fontFamily);
  const url = escapeAttr(options.href);
  const safeLabel = escapeHtml(label);
  const borderW = options.borderWidth > 0 && options.borderColor ? options.borderWidth : 0;
  const border =
    borderW > 0
      ? `border:${borderW}px solid ${escapeAttr(options.borderColor)};`
      : "";
  const height = options.padY * 2 + options.fontSize + borderW * 2;
  const textWidth = Math.ceil(label.length * options.fontSize * 0.5);
  const buttonWidth = options.fullWidth
    ? Math.max(120, options.contentWidth)
    : Math.max(options.fontSize * 4, textWidth + options.padX * 2 + borderW * 2);
  const arc =
    height > 0 ? Math.min(100, Math.round((options.radius / (height / 2)) * 100)) : 0;
  const stroke =
    borderW > 0
      ? `stroke="t" strokecolor="${escapeAttr(options.borderColor)}" strokeweight="${borderW}px"`
      : `stroke="f"`;
  const display = options.fullWidth ? "block" : "inline-block";
  const widthAttr = options.fullWidth ? ' width="100%"' : "";
  return `<!--[if mso]>
<table ${PRESENTATION} width="100%" style="border-collapse:collapse;"><tr><td align="${options.align}">
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:office" href="${url}" style="height:${height}px;v-text-anchor:middle;width:${buttonWidth}px;" arcsize="${arc}%" ${stroke} fillcolor="${bg}">
<w:anchorlock/>
<center style="color:${fg};font-family:${font};font-size:${options.fontSize}px;font-weight:bold;">${safeLabel}</center>
</v:roundrect>
</td></tr></table>
<![endif]-->
<!--[if !mso]><!-->
<table ${PRESENTATION} align="${options.align}"${widthAttr} style="border-collapse:collapse;${options.fullWidth ? "width:100%;" : ""}">
<tr><td align="center" bgcolor="${bg}" style="background-color:${bg};border-radius:${options.radius}px;${border}">
<a href="${url}" style="display:${display};padding:${options.padY}px ${options.padX}px;background-color:${bg};color:${fg};font-family:${font};font-size:${options.fontSize}px;font-weight:600;line-height:${options.fontSize}px;text-align:center;text-decoration:none;border-radius:${options.radius}px;${border}${options.fullWidth ? "width:100%;box-sizing:border-box;" : ""}">${safeLabel}</a>
</td></tr></table>
<!--<![endif]-->`;
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
      return `<div style="margin:0;${pad}${align}font-family:${styles.fontFamily};font-size:${block.fontSize}px;line-height:1.5;color:${escapeAttr(block.color || styles.textColor)};">${emailRichHtml(block.html, styles.linkColor)}</div>`;
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
      const fontSize = block.fontSize || 16;
      const padX = block.paddingX ?? 22;
      const padY = block.paddingY ?? 14;
      const borderW = block.borderWidth ?? 0;
      return `<div style="${pad}${align}">${bulletproofButton({
        href,
        label: block.label,
        background: block.background,
        color: block.color,
        fontFamily: styles.fontFamily,
        fontSize,
        padX,
        padY,
        radius: block.radius,
        fullWidth: block.fullWidth,
        align: block.align,
        borderWidth: borderW,
        borderColor: block.borderColor,
        contentWidth: styles.contentWidth,
      })}</div>`;
    }
    case "divider":
      return `<div style="${pad}"><table ${PRESENTATION} width="100%" style="border-collapse:collapse;"><tr><td style="border-top:${block.thickness}px solid ${escapeAttr(block.color)};font-size:0;line-height:0;">&nbsp;</td></tr></table></div>`;
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
      return `<div class="em-html" style="${pad}font-family:${styles.fontFamily};font-size:15px;line-height:1.5;color:${escapeAttr(styles.textColor)};">${sanitizeHtmlBlock(block.html)}</div>`;
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
      return `<div style="${pad}${align}font-family:${styles.fontFamily};font-size:12px;line-height:1.5;color:#666666;">${sanitizeRichEmailHtml(footerText, styles.linkColor).replace(/\n/g, "<br>")}${linkRow}</div>`;
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
        ? `<div style="margin:12px 0 0;">${bulletproofButton({
            href,
            label: block.ctaLabel,
            background: styles.buttonBackground,
            color: styles.buttonColor,
            fontFamily: styles.fontFamily,
            fontSize: 14,
            padX: 18,
            padY: 12,
            radius: styles.buttonRadius,
            fullWidth: false,
            align: block.align,
            borderWidth: 0,
            borderColor: "",
            contentWidth: styles.contentWidth,
          })}</div>`
        : "";
      return `<div style="${pad}${align}border:1px solid #E3E6E9;padding:16px;">${image}<h2 style="margin:0 0 8px;font-family:${styles.headingFontFamily};font-size:22px;line-height:1.25;color:${escapeAttr(styles.textColor)};">${escapeHtml(block.title)}</h2><div style="font-family:${styles.fontFamily};font-size:15px;line-height:1.5;color:${escapeAttr(styles.textColor)};">${emailRichHtml(block.bodyHtml, styles.linkColor)}</div>${cta}</div>`;
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
  return `<tr><td style="background:${escapeAttr(background)};padding:${section.paddingTop}px ${section.paddingRight}px ${section.paddingBottom}px ${section.paddingLeft}px;"><table ${PRESENTATION} width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;"><tr${rowAttr}>${cells}</tr></table></td></tr>`;
}

/** Hidden inbox snippet. Contact variables stay as {{tokens}} until send. */
function hiddenPreheader(previewText: string): string {
  const text = previewText.trim();
  if (!text) return "";
  const spacer = "&nbsp;&zwnj;".repeat(12);
  return `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(text)}${spacer}</div>`;
}

export function compileEmailDesign(
  design: EmailDesign,
  options?: CompileEmailOptions
): string {
  const footerLinks = options?.footerLinks ?? null;
  const styles = footerLinks
    ? {
        ...design.styles,
        showUnsubscribeLink: footerLinks.showUnsubscribe,
        showPreferencesLink: footerLinks.showPreferences,
        unsubscribeLabel: footerLinks.unsubscribeLabel,
        preferencesLabel: footerLinks.preferencesLabel,
      }
    : design.styles;
  const working: EmailDesign = safeDesignForCompile({ ...design, styles });
  const width = working.styles.contentWidth;
  const sections = working.sections
    .filter((section) => sectionVisibleForTopic(section, options?.topic))
    .map((section) => renderSection(section, working))
    .join("");
  const preheader = hiddenPreheader(options?.previewText ?? "");
  const html = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title></title>
<!--[if gte mso 9]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
<style>
  body { margin:0; padding:0; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width: 620px) {
    .em-container { width:100% !important; }
    .em-stack { display:block !important; width:100% !important; max-width:100% !important; padding-left:0 !important; direction:ltr !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${escapeAttr(working.styles.pageBackground)};">${preheader}
<table ${PRESENTATION} width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;background:${escapeAttr(working.styles.pageBackground)};">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]>
<table ${PRESENTATION} width="${width}" align="center" style="width:${width}px;border-collapse:collapse;"><tr><td>
<![endif]-->
<table ${PRESENTATION} class="em-container" width="${width}" align="center" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;width:${width}px;max-width:${width}px;background:${escapeAttr(working.styles.contentBackground)};">
${sections}
</table>
<!--[if mso]>
</td></tr></table>
<![endif]-->
</td></tr>
</table>
</body>
</html>`;
  const linkSettings = resolveFooterLinkSettings(styles, null, footerLinks);
  return ensureViewInBrowserLink(
    ensureUnsubscribeFooter(html, {
      showUnsubscribe: linkSettings.showUnsubscribe,
      showPreferences: linkSettings.showPreferences,
      unsubscribeLabel: linkSettings.unsubscribeLabel,
      preferencesLabel: linkSettings.preferencesLabel,
      linkColor: working.styles.linkColor,
    })
  );
}
