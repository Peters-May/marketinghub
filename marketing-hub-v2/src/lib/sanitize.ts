/**
 * XSS-safe HTML sanitization for rich text fields (server / editor save path).
 */

import DOMPurify from "isomorphic-dompurify";
import { isRichTextEmpty, plainTextFromHtml } from "@/lib/plain-text";
import { textAlignFromStyle } from "@/lib/text-align";

const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "span",
    "h1",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "a",
    "blockquote",
    "pre",
    "code",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class", "title", "data-align"],
};

/**
 * DOMPurify drops style attributes. Park a checked text-align on data-align
 * so it can be written back as a single safe declaration.
 */
function encodeTextAlign(html: string): string {
  return html.replace(
    /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (_match, doubleQuoted: string | undefined, singleQuoted: string | undefined) => {
      const align = textAlignFromStyle(doubleQuoted ?? singleQuoted ?? "");
      return align ? ` data-align="${align}"` : "";
    }
  );
}

function decodeTextAlign(html: string): string {
  return html.replace(
    /\sdata-align="(left|center|right)"/gi,
    (_match, align: string) => ` style="text-align:${align.toLowerCase()}"`
  );
}

/** Sanitize TipTap / rich-text HTML before storage or render. */
export function sanitizeRichText(html: string): string {
  if (typeof html !== "string" || !html.trim()) return "";
  const cleaned = DOMPurify.sanitize(encodeTextAlign(html), RICH_TEXT_CONFIG) as string;
  return decodeTextAlign(cleaned);
}

/** Empty TipTap document (or blank) → treat as empty string for storage. */
export function normalizeRichTextStorage(html: string): string {
  const cleaned = sanitizeRichText(html);
  if (!cleaned) return "";
  const plain = plainTextFromHtml(cleaned);
  return plain ? cleaned : "";
}

export { plainTextFromHtml, isRichTextEmpty };
