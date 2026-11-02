import { uid } from "@/lib/utils";
import { sanitizeHtmlBlock, sanitizeRichEmailHtml, safeEmailUrl } from "@/lib/email/design/compile";
import { createBlock, createSection } from "@/lib/email/design/document";
import type {
  EmailAlign,
  EmailBlock,
  EmailColumn,
  EmailDesign,
  EmailSection,
  HeadingLevel,
} from "@/lib/email/design/types";

/** Element tree the importer walks. Tests can build this without a browser. */
export type ImportNode = {
  tag: string;
  attrs: Record<string, string>;
  children: ImportNode[];
  text: string;
};

export type HtmlImportResult = {
  sections: EmailSection[];
  /** Hidden preheader, when the paste includes one. */
  previewText: string;
  /** Document title, when the paste includes one. */
  title: string;
};

type Chunk =
  | { kind: "blocks"; blocks: EmailBlock[] }
  | { kind: "section"; section: EmailSection };

type WalkCtx = {
  align: EmailAlign;
  columnShare: number;
  notePreview: (text: string) => void;
};

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "wbr",
]);

const TEXT_TAGS = new Set(["p", "ul", "ol", "li", "blockquote", "h4", "h5", "h6"]);
const INLINE_TAGS = new Set(["span", "font", "small", "strong", "b", "em", "i", "u", "s", "label"]);
const WRAPPER_TAGS = new Set([
  "a",
  "article",
  "body",
  "center",
  "div",
  "figcaption",
  "figure",
  "font",
  "footer",
  "h4",
  "h5",
  "h6",
  "header",
  "html",
  "main",
  "p",
  "section",
  "span",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
]);
const STRUCTURAL_TAGS = new Set([
  "center",
  "div",
  "span",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
]);

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&pound;/gi, "£")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function plainText(node: ImportNode): string {
  if (node.tag === "#text") return node.text;
  if (node.tag === "br") return " ";
  return node.children.map(plainText).join("");
}

function isWhitespaceText(node: ImportNode): boolean {
  return node.tag === "#text" && collapse(node.text).length === 0;
}

function styleOf(node: ImportNode): string {
  return node.attrs.style || "";
}

function safeColour(value: string): string {
  const colour = value.trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(colour)) return colour;
  if (
    /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
      colour
    )
  ) {
    return colour;
  }
  return "";
}

function isNeutralBackground(value: string): boolean {
  const colour = value.trim().toLowerCase().replace(/\s+/g, "");
  return (
    colour === "transparent" ||
    colour === "none" ||
    colour === "inherit" ||
    colour === "white" ||
    colour === "#fff" ||
    colour === "#ffffff" ||
    colour === "rgb(255,255,255)" ||
    colour === "rgba(255,255,255,1)"
  );
}

/** Solid fill used for a button or a section band. White and transparent are ignored. */
function solidBackground(node: ImportNode): string {
  const style = styleOf(node);
  const fromStyle = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(`;${style}`);
  const raw = (fromStyle?.[1] || node.attrs.bgcolor || "").trim();
  if (!raw || /url\s*\(/i.test(raw)) return "";
  const colour = safeColour(raw.split(/\s+/)[0] || "");
  if (!colour || isNeutralBackground(colour)) return "";
  return colour;
}

function cssColour(style: string): string {
  const match = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(`;${style}`);
  return match ? safeColour(match[1].trim()) : "";
}

function fontSizeOf(style: string, fallback: number): number {
  const match = /font-size\s*:\s*(\d+(?:\.\d+)?)px/i.exec(style);
  if (!match) return fallback;
  const size = Math.round(Number(match[1]));
  if (!Number.isFinite(size)) return fallback;
  return Math.min(72, Math.max(10, size));
}

function alignOf(node: ImportNode, parent: EmailAlign): EmailAlign {
  const fromStyle = /text-align\s*:\s*(left|center|right)/i.exec(styleOf(node));
  if (fromStyle) return fromStyle[1].toLowerCase() as EmailAlign;
  const attr = (node.attrs.align || "").toLowerCase();
  if (attr === "left" || attr === "center" || attr === "right") return attr;
  return parent;
}

/** The page cell uses align="center" to centre the 600px card, not the copy inside it. */
function centresTheCard(node: ImportNode): boolean {
  if ((node.attrs.align || "").toLowerCase() !== "center") return false;
  const kids = node.children.filter((child) => !isWhitespaceText(child));
  return kids.length === 1 && kids[0].tag === "table";
}

/** CSS text-align is copy alignment. The card wrapper's align attribute is not. */
function textAlignContext(node: ImportNode, parent: EmailAlign): EmailAlign {
  const fromStyle = /text-align\s*:\s*(left|center|right)/i.exec(styleOf(node));
  if (fromStyle) return fromStyle[1].toLowerCase() as EmailAlign;
  if (!centresTheCard(node)) {
    const attr = (node.attrs.align || "").toLowerCase();
    if (attr === "left" || attr === "center" || attr === "right") return attr;
  }
  return parent;
}

type BoxPadding = { top: number; right: number; bottom: number; left: number };

function boxPadding(node: ImportNode): BoxPadding | null {
  const match = /(?:^|;)\s*padding\s*:\s*([^;]+)/i.exec(`;${styleOf(node)};`);
  if (!match) return null;
  const parts = match[1]
    .trim()
    .split(/\s+/)
    .map((part) => {
      const value = Number.parseFloat(part);
      return Number.isFinite(value) ? Math.max(0, Math.min(120, Math.round(value))) : null;
    });
  if (parts.some((part) => part === null) || parts.length === 0) return null;
  const [top, right = top, bottom = top, left = right] = parts as number[];
  if (parts.length === 1) return { top, right: top, bottom: top, left: top };
  if (parts.length === 2) return { top, right, bottom: top, left: right };
  if (parts.length === 3) return { top, right, bottom, left: right };
  return { top, right, bottom, left };
}

function paddingShorthand(style: string): { x: number; y: number } | null {
  const box = boxPadding({ tag: "", attrs: { style }, children: [], text: "" });
  if (!box) return null;
  return { x: box.left, y: box.top };
}

function zeroBlockPadding(block: EmailBlock): EmailBlock {
  return { ...block, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 };
}

function sectionHasCustomPadding(section: EmailSection): boolean {
  return (
    section.paddingTop !== 16 ||
    section.paddingRight !== 24 ||
    section.paddingBottom !== 16 ||
    section.paddingLeft !== 24
  );
}

function withPadding(section: EmailSection, padding: BoxPadding, add: boolean): EmailSection {
  return {
    ...section,
    paddingTop: add ? section.paddingTop + padding.top : padding.top,
    paddingRight: add ? section.paddingRight + padding.right : padding.right,
    paddingBottom: add ? section.paddingBottom + padding.bottom : padding.bottom,
    paddingLeft: add ? section.paddingLeft + padding.left : padding.left,
    columns: add
      ? section.columns
      : section.columns.map((column) => ({
          ...column,
          blocks: column.blocks.map(zeroBlockPadding),
        })),
  };
}

function isPixel(node: ImportNode): boolean {
  const width = Number.parseInt(node.attrs.width || "", 10);
  const height = Number.parseInt(node.attrs.height || "", 10);
  if ((width > 0 && width <= 1) || (height > 0 && height <= 1)) return true;
  const style = `;${styleOf(node)};`;
  return /(?:^|;)\s*(?:width|height)\s*:\s*(?:0|1)(?:\.0+)?(?:px)?\s*(?:;|$)/i.test(style);
}

function isHidden(node: ImportNode): boolean {
  const style = styleOf(node);
  return /display\s*:\s*none/i.test(style) || /mso-hide\s*:\s*all/i.test(style);
}

function isIgnorable(node: ImportNode, ctx: WalkCtx): boolean {
  if (
    node.tag === "script" ||
    node.tag === "style" ||
    node.tag === "noscript" ||
    node.tag === "template" ||
    node.tag === "head" ||
    node.tag === "meta" ||
    node.tag === "link" ||
    node.tag === "title"
  ) {
    return true;
  }
  if (node.tag === "img" && isPixel(node)) return true;
  if (isHidden(node)) {
    const text = collapse(plainText(node));
    if (text) ctx.notePreview(text);
    return true;
  }
  return false;
}

function imageOnly(node: ImportNode): ImportNode | null {
  const kids = node.children.filter((child) => !isWhitespaceText(child));
  if (kids.length === 1 && kids[0].tag === "img" && !isPixel(kids[0])) return kids[0];
  return null;
}

function isButtonAnchor(node: ImportNode): boolean {
  if (node.tag !== "a") return false;
  const style = styleOf(node);
  const background = solidBackground(node);
  const padded = /padding/i.test(style);
  const blocky = /display\s*:\s*(inline-)?block/i.test(style);
  return Boolean(background && (padded || blocky));
}

function onlyAnchor(node: ImportNode): ImportNode | null {
  if (node.tag === "a") return node;
  const kids = node.children.filter((child) => !isWhitespaceText(child) && child.tag !== "br");
  if (kids.length !== 1) return null;
  const only = kids[0];
  if (only.tag === "a") return only;
  if (STRUCTURAL_TAGS.has(only.tag)) return onlyAnchor(only);
  return null;
}

function isButtonWrapper(node: ImportNode): boolean {
  const anchor = node.tag === "a" ? node : onlyAnchor(node);
  if (!anchor || imageOnly(anchor) || imageOnly(node)) return false;
  if (isButtonAnchor(anchor)) return true;
  const background = solidBackground(node) || solidBackground(anchor);
  const label = collapse(plainText(anchor));
  return Boolean(background && label && label.length <= 80);
}

function hasModuleChild(node: ImportNode): boolean {
  for (const child of node.children) {
    if (isWhitespaceText(child)) continue;
    if (child.tag === "img" && !isPixel(child)) return true;
    if (
      child.tag === "table" ||
      child.tag === "hr" ||
      child.tag === "h1" ||
      child.tag === "h2" ||
      child.tag === "h3" ||
      child.tag === "ul" ||
      child.tag === "ol" ||
      child.tag === "blockquote" ||
      child.tag === "div" ||
      child.tag === "p"
    ) {
      return true;
    }
    if (hasModuleChild(child)) return true;
  }
  return false;
}

function isTextLike(node: ImportNode): boolean {
  if (node.tag === "#text") return collapse(node.text).length > 0;
  if (node.tag === "br") return true;
  if (node.tag === "a") {
    if (isButtonAnchor(node) || isButtonWrapper(node) || imageOnly(node)) return false;
    return !hasModuleChild(node) && collapse(plainText(node)).length > 0;
  }
  if (TEXT_TAGS.has(node.tag) || INLINE_TAGS.has(node.tag)) return !hasModuleChild(node);
  if (
    (node.tag === "div" || node.tag === "center" || node.tag === "section" || node.tag === "article") &&
    !hasModuleChild(node) &&
    collapse(plainText(node))
  ) {
    return true;
  }
  return false;
}

function isAccentBar(node: ImportNode): boolean {
  const height = /(?:^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(`;${styleOf(node)}`);
  if (!height || Number(height[1]) > 16) return false;
  if (!solidBackground(node)) return false;
  return node.children.every((child) => isWhitespaceText(child) || child.tag === "br");
}

function usableImageSrc(src: string): string {
  const trimmed = src.trim();
  if (!trimmed || /^(javascript|vbscript):/i.test(trimmed)) return "";
  if (/^data:(?!image\/(?:png|jpe?g|gif|webp);base64,)/i.test(trimmed)) return "";
  return trimmed;
}

function imageWidthPercent(node: ImportNode, columnShare: number): number {
  const style = styleOf(node);
  const fromStyle = /(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)%/i.exec(`;${style}`);
  if (fromStyle) return clampPercent(Number(fromStyle[1]));
  const attr = node.attrs.width || "";
  if (attr.endsWith("%")) return clampPercent(Number(attr.slice(0, -1)));
  const pixels = Number.parseInt(attr, 10) || pixelWidth(style);
  if (pixels > 1 && columnShare >= 80) {
    return clampPercent(Math.round((pixels / 600) * 100));
  }
  return 100;
}

function pixelWidth(style: string): number {
  const match = /(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(`;${style}`);
  return match ? Number(match[1]) : 0;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(8, Math.round(value)));
}

function imageBlock(node: ImportNode, href: string, ctx: WalkCtx): EmailBlock | null {
  const src = usableImageSrc(node.attrs.src || "");
  if (!src || isPixel(node)) return null;
  const link = safeEmailUrl(href);
  return createBlock("image", {
    src,
    alt: node.attrs.alt || "",
    ...(link ? { href: link } : {}),
    align: alignOf(node, ctx.align),
    widthPercent: imageWidthPercent(node, ctx.columnShare),
  });
}

function headingBlock(node: ImportNode, ctx: WalkCtx): EmailBlock | null {
  const text = collapse(plainText(node));
  if (!text) return null;
  const level: HeadingLevel = node.tag === "h1" ? 1 : node.tag === "h2" ? 2 : 3;
  const style = styleOf(node);
  const colour = cssColour(style);
  return createBlock("heading", {
    text,
    level,
    align: alignOf(node, ctx.align),
    fontSize: fontSizeOf(style, level === 1 ? 28 : level === 2 ? 22 : 18),
    ...(colour ? { color: colour } : {}),
  });
}

function buttonBlock(node: ImportNode, ctx: WalkCtx): EmailBlock | null {
  const anchor = node.tag === "a" ? node : onlyAnchor(node);
  if (!anchor) return null;
  const label = collapse(plainText(anchor));
  if (!label) return null;
  const href = safeEmailUrl(anchor.attrs.href || "");
  const background = solidBackground(node) || solidBackground(anchor);
  const colour = cssColour(styleOf(anchor)) || cssColour(styleOf(node));
  const radius = /border-radius\s*:\s*(\d+(?:\.\d+)?)px/i.exec(
    `${styleOf(node)};${styleOf(anchor)}`
  );
  const fontSize = fontSizeOf(`${styleOf(anchor)};${styleOf(node)}`, 16);
  const padding = paddingShorthand(styleOf(anchor)) || paddingShorthand(styleOf(node));
  return createBlock("button", {
    label,
    ...(href ? { href } : {}),
    align: alignOf(node, ctx.align),
    ...(background ? { background } : {}),
    ...(colour ? { color: colour } : {}),
    ...(radius ? { radius: Math.min(40, Math.max(0, Math.round(Number(radius[1])))) } : {}),
    fontSize,
    ...(padding ? { paddingX: padding.x, paddingY: padding.y } : {}),
  });
}

function dividerBlock(node: ImportNode): EmailBlock {
  const height = /(?:^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(`;${styleOf(node)}`);
  const thickness = height
    ? Math.min(8, Math.max(1, Math.round(Number(height[1]))))
    : 1;
  const colour = solidBackground(node);
  return createBlock("divider", {
    ...(colour ? { color: colour } : {}),
    thickness,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  });
}

function serialize(node: ImportNode): string {
  if (node.tag === "#text") return escapeText(node.text);
  if (node.tag === "br") return "<br>";
  const attrs = Object.entries(node.attrs)
    .filter(([name]) => !/^on/i.test(name) && name !== "srcdoc")
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join("");
  if (VOID.has(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${node.children.map(serialize).join("")}</${node.tag}>`;
}

function serializeTextPiece(node: ImportNode): string {
  if (node.tag === "#text") {
    const text = collapse(node.text);
    return text ? `<p>${escapeText(text)}</p>` : "";
  }
  if (node.tag === "br") return "<br>";
  if (
    node.tag === "div" ||
    node.tag === "center" ||
    node.tag === "span" ||
    node.tag === "font" ||
    node.tag === "section" ||
    node.tag === "article"
  ) {
    const inner = sanitizeRichEmailHtml(node.children.map(serialize).join(""));
    if (!collapse(inner.replace(/<[^>]+>/g, " "))) return "";
    if (/^<(p|ul|ol|blockquote|h[1-6])\b/i.test(inner)) return inner;
    return `<p>${inner}</p>`;
  }
  return serialize(node);
}

function textBlock(nodes: ImportNode[], ctx: WalkCtx): EmailBlock | null {
  const html = sanitizeRichEmailHtml(nodes.map(serializeTextPiece).join(""));
  if (!collapse(html.replace(/<[^>]+>/g, " "))) return null;
  return createBlock("text", {
    html,
    align: alignOf(nodes[0], ctx.align),
  });
}

function htmlChunk(node: ImportNode): Chunk[] {
  const html = sanitizeHtmlBlock(serialize(node)).trim();
  if (!html) return [];
  const text = collapse(html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " "));
  if (!text && !/<img\b/i.test(html)) return [];
  return [{ kind: "blocks", blocks: [createBlock("html", { html })] }];
}

function findRows(table: ImportNode): ImportNode[] {
  const rows: ImportNode[] = [];
  for (const child of table.children) {
    if (child.tag === "tr") rows.push(child);
    else if (child.tag === "tbody" || child.tag === "thead" || child.tag === "tfoot") {
      for (const row of child.children) {
        if (row.tag === "tr") rows.push(row);
      }
    }
  }
  return rows;
}

function cellsOf(row: ImportNode): ImportNode[] {
  return row.children.filter((child) => child.tag === "td" || child.tag === "th");
}

function hasRealContent(node: ImportNode, ctx: WalkCtx): boolean {
  if (isIgnorable(node, ctx) || isWhitespaceText(node)) return false;
  if (node.tag === "img") return !isPixel(node);
  if (node.tag === "#text") return collapse(node.text).length > 0;
  if (node.tag === "hr") return true;
  if (node.tag === "br") return false;
  return node.children.some((child) => hasRealContent(child, ctx));
}

function isDataTable(table: ImportNode): boolean {
  if (/rate-table|data-table/i.test(table.attrs.class || "")) return true;
  return findRows(table).some((row) => cellsOf(row).some((cell) => cell.tag === "th"));
}

function columnWidths(cells: ImportNode[]): number[] {
  const raw = cells.map((cell) => {
    const attr = cell.attrs.width || "";
    if (attr.endsWith("%")) return Number(attr.slice(0, -1));
    const match = /(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)%/i.exec(`;${styleOf(cell)}`);
    return match ? Number(match[1]) : 0;
  });
  if (raw.every((value) => value > 0)) {
    const sum = raw.reduce((total, value) => total + value, 0);
    const scaled = raw.map((value) => Math.round((value / sum) * 100));
    scaled[scaled.length - 1] += 100 - scaled.reduce((total, value) => total + value, 0);
    return scaled;
  }
  const base = Math.floor(100 / cells.length);
  const widths = cells.map(() => base);
  widths[widths.length - 1] += 100 - base * cells.length;
  return widths;
}

function paint(chunks: Chunk[], background: string, padding: BoxPadding | null = null): Chunk[] {
  if (!background && !padding) return chunks;
  const painted: Chunk[] = [];
  let blocks: EmailBlock[] = [];
  function flush() {
    if (blocks.length === 0) return;
    const section = createSection("1", {
      background,
      columns: [{ id: uid("col"), width: 100, blocks }],
    });
    painted.push({
      kind: "section",
      section: padding ? withPadding(section, padding, false) : section,
    });
    blocks = [];
  }
  for (const chunk of chunks) {
    if (chunk.kind === "blocks") {
      blocks.push(...chunk.blocks);
      continue;
    }
    flush();
    if (!chunk.section.background) chunk.section.background = background;
    painted.push({
      kind: "section",
      section: padding
        ? withPadding(chunk.section, padding, sectionHasCustomPadding(chunk.section))
        : chunk.section,
    });
  }
  flush();
  return painted;
}

function tablePaintBackground(table: ImportNode): string {
  const background = solidBackground(table);
  if (!background) return "";
  const width = table.attrs.width || "";
  const style = styleOf(table);
  const card =
    width === "100%" || width === "600" || /width\s*:\s*600px/i.test(style);
  if (card && !/border-left/i.test(style)) return "";
  return background;
}

function chunksFromNodes(nodes: ImportNode[], ctx: WalkCtx, depth: number): Chunk[] {
  const chunks: Chunk[] = [];
  const textRun: ImportNode[] = [];
  function flushText() {
    if (textRun.length === 0) return;
    const block = textBlock(textRun.splice(0, textRun.length), ctx);
    if (block) chunks.push({ kind: "blocks", blocks: [block] });
  }
  for (const node of nodes) {
    if (isWhitespaceText(node) || isIgnorable(node, ctx)) continue;
    if (isTextLike(node)) {
      textRun.push(node);
      continue;
    }
    flushText();
    chunks.push(...chunksFromNode(node, ctx, depth));
  }
  flushText();
  return chunks;
}

function chunksFromNode(node: ImportNode, ctx: WalkCtx, depth: number): Chunk[] {
  if (depth > 40) return htmlChunk(node);
  if (isIgnorable(node, ctx) || isWhitespaceText(node)) return [];
  const next: WalkCtx = { ...ctx, align: textAlignContext(node, ctx.align) };

  if (node.tag === "img") {
    const block = imageBlock(node, "", next);
    return block ? [{ kind: "blocks", blocks: [block] }] : [];
  }
  if (node.tag === "h1" || node.tag === "h2" || node.tag === "h3") {
    const block = headingBlock(node, next);
    return block ? [{ kind: "blocks", blocks: [block] }] : [];
  }
  if (node.tag === "hr" || isAccentBar(node)) {
    return [{ kind: "blocks", blocks: [dividerBlock(node)] }];
  }
  if (node.tag === "a" && imageOnly(node)) {
    const block = imageBlock(imageOnly(node) as ImportNode, node.attrs.href || "", next);
    return block ? [{ kind: "blocks", blocks: [block] }] : [];
  }
  if (isButtonWrapper(node)) {
    const block = buttonBlock(node, next);
    return block ? [{ kind: "blocks", blocks: [block] }] : [];
  }
  if (node.tag === "table") return tableChunks(node, next, depth + 1);
  if (WRAPPER_TAGS.has(node.tag)) {
    const inner = chunksFromNodes(node.children, next, depth + 1);
    if (node.tag === "td" || node.tag === "th") {
      return paint(inner, solidBackground(node), centresTheCard(node) ? null : boxPadding(node));
    }
    return inner;
  }
  if (isTextLike(node)) {
    const block = textBlock([node], next);
    return block ? [{ kind: "blocks", blocks: [block] }] : [];
  }
  return htmlChunk(node);
}

function tableChunks(table: ImportNode, ctx: WalkCtx, depth: number): Chunk[] {
  if (isButtonWrapper(table)) {
    const block = buttonBlock(table, ctx);
    return block ? [{ kind: "blocks", blocks: [block] }] : [];
  }
  if (isDataTable(table)) return htmlChunk(table);
  const rows = findRows(table);
  if (rows.length === 0) return htmlChunk(table);
  const chunks: Chunk[] = [];
  for (const row of rows) {
    if (isIgnorable(row, ctx)) continue;
    const cells = cellsOf(row).filter((cell) => hasRealContent(cell, ctx) || isAccentBar(cell));
    if (cells.length >= 2 && cells.length <= 4) {
      const widths = columnWidths(cells);
      const columns: EmailColumn[] = cells.map((cell, index) => ({
        id: uid("col"),
        width: widths[index],
        blocks: blocksOnly(
          chunksFromNode(
            cell,
            { ...ctx, align: textAlignContext(cell, ctx.align), columnShare: widths[index] },
            depth
          )
        ),
      }));
      const filled = columns.filter((column) => column.blocks.length > 0);
      if (filled.length >= 2) {
        const sum = filled.reduce((total, column) => total + column.width, 0) || 1;
        const normalized = filled.map((column) => ({
          ...column,
          width: Math.round((column.width / sum) * 100),
        }));
        normalized[normalized.length - 1].width +=
          100 - normalized.reduce((total, column) => total + column.width, 0);
        chunks.push({
          kind: "section",
          section: createSection("1", { columns: normalized }),
        });
        continue;
      }
    }
    for (const cell of cells) {
      chunks.push(
        ...chunksFromNode(cell, { ...ctx, align: textAlignContext(cell, ctx.align) }, depth)
      );
    }
  }
  return paint(chunks, tablePaintBackground(table));
}

function blocksOnly(chunks: Chunk[]): EmailBlock[] {
  const blocks: EmailBlock[] = [];
  for (const chunk of chunks) {
    if (chunk.kind === "blocks") blocks.push(...chunk.blocks);
    else {
      for (const column of chunk.section.columns) blocks.push(...column.blocks);
    }
  }
  return blocks;
}

function chunksToSections(chunks: Chunk[]): EmailSection[] {
  const sections: EmailSection[] = [];
  let blocks: EmailBlock[] = [];
  function flush() {
    if (blocks.length === 0) return;
    const accent = blocks.length === 1 && blocks[0].type === "divider";
    sections.push(
      createSection("1", {
        ...(accent
          ? { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 }
          : {}),
        columns: [{ id: uid("col"), width: 100, blocks }],
      })
    );
    blocks = [];
  }
  for (const chunk of chunks) {
    if (chunk.kind === "blocks") {
      blocks.push(...chunk.blocks);
      continue;
    }
    flush();
    if (chunk.section.columns.some((column) => column.blocks.length > 0)) {
      sections.push(chunk.section);
    }
  }
  flush();
  return sections;
}

function prepareHtml(html: string): { title: string; html: string } {
  const title = collapse(decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || ""));
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head>/gi, "");
  return { title, html: cleaned };
}

function nodesFromDom(html: string): ImportNode[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.childNodes)
    .map(nodeToImport)
    .filter((node): node is ImportNode => Boolean(node));
}

function nodeToImport(node: Node): ImportNode | null {
  if (node.nodeType === 3) {
    return { tag: "#text", attrs: {}, children: [], text: node.textContent || "" };
  }
  if (node.nodeType !== 1) return null;
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (tag === "script" || tag === "style" || tag === "noscript" || tag === "template") {
    return null;
  }
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(element.attributes)) {
    attrs[attr.name.toLowerCase()] = attr.value;
  }
  const children: ImportNode[] = [];
  for (const child of Array.from(element.childNodes)) {
    const imported = nodeToImport(child);
    if (imported) children.push(imported);
  }
  return { tag, attrs, children, text: "" };
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const name = match[1].toLowerCase();
    if (name === "/") continue;
    attrs[name] = decode(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/** Small markup parser used when the browser DOMParser is not available. */
export function parseImportMarkup(html: string): ImportNode[] {
  const prepared = prepareHtml(html).html;
  if (typeof DOMParser !== "undefined") return nodesFromDom(prepared);
  return nodesFromMarkup(prepared);
}

function nodesFromMarkup(html: string): ImportNode[] {
  const root: ImportNode = { tag: "root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const pattern =
    /<!--[\s\S]*?-->|<\/([a-zA-Z0-9:-]+)\s*>|<([a-zA-Z0-9:-]+)([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    if (match[0].startsWith("<!--")) continue;
    if (match[1]) {
      const tag = match[1].toLowerCase();
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack.length = index;
          break;
        }
      }
      continue;
    }
    if (match[2]) {
      const tag = match[2].toLowerCase();
      if (tag === "script" || tag === "style" || tag === "noscript" || tag === "template") {
        continue;
      }
      const node: ImportNode = {
        tag,
        attrs: parseAttrs(match[3] || ""),
        children: [],
        text: "",
      };
      stack[stack.length - 1].children.push(node);
      const selfClosing = /\/\s*$/.test(match[3] || "") || VOID.has(tag);
      if (!selfClosing) stack.push(node);
      continue;
    }
    if (match[4]) {
      const text = decode(match[4]);
      if (!text) continue;
      stack[stack.length - 1].children.push({
        tag: "#text",
        attrs: {},
        children: [],
        text,
      });
    }
  }
  const body = findTag(root, "body");
  return (body || root).children;
}

function findTag(node: ImportNode, tag: string): ImportNode | null {
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const found = findTag(child, tag);
    if (found) return found;
  }
  return null;
}

export function sectionsFromImportNodes(nodes: ImportNode[]): EmailSection[] {
  return walkNodes(nodes).sections;
}

function walkNodes(nodes: ImportNode[]): { sections: EmailSection[]; previewText: string } {
  let previewText = "";
  const ctx: WalkCtx = {
    align: "left",
    columnShare: 100,
    notePreview: (text) => {
      if (!previewText) previewText = text;
    },
  };
  return {
    sections: chunksToSections(chunksFromNodes(nodes, ctx, 0)),
    previewText,
  };
}

export function importEmailHtml(html: string): HtmlImportResult {
  const prepared = prepareHtml(html);
  const nodes =
    typeof DOMParser !== "undefined" ? nodesFromDom(prepared.html) : nodesFromMarkup(prepared.html);
  const walked = walkNodes(nodes);
  return {
    sections: walked.sections,
    previewText: walked.previewText,
    title: prepared.title,
  };
}

export function htmlToEmailSections(html: string): EmailSection[] {
  return importEmailHtml(html).sections;
}

export function designHasUnlockedContent(design: EmailDesign): boolean {
  return design.sections.some(
    (section) => !section.locked && section.columns.some((column) => column.blocks.length > 0)
  );
}

/** Swap unlocked sections for the import. Locked header and footer stay in place. */
export function replaceUnlockedSections(
  design: EmailDesign,
  imported: EmailSection[]
): EmailDesign {
  if (imported.length === 0) return design;
  const sections: EmailSection[] = [];
  let placed = false;
  for (const section of design.sections) {
    if (section.locked) {
      sections.push(section);
    } else if (!placed) {
      sections.push(...imported);
      placed = true;
    }
  }
  if (!placed) {
    if (sections.length === 0) return { ...design, sections: imported };
    sections.splice(sections.length - 1, 0, ...imported);
  }
  return { ...design, sections };
}
