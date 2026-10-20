import { COLORS } from "@/lib/brand/tokens";
import { uid } from "@/lib/utils";
import type {
  EmailBlock,
  EmailBlockType,
  EmailColumn,
  EmailDesign,
  EmailDesignStyles,
  EmailSection,
  SectionPreset,
  SectionShowFor,
  SocialNetwork,
  StarterLayout,
} from "@/lib/email/design/types";

export const EMAIL_FONT_BODY = "Archivo, Arial, sans-serif";
export const EMAIL_FONT_HEADING = "League Spartan, Arial, sans-serif";

/** Brand-safe stacks offered in the theme inspector. */
export const EMAIL_FONT_OPTIONS = [
  { id: EMAIL_FONT_BODY, label: "Archivo (body)" },
  { id: EMAIL_FONT_HEADING, label: "League Spartan (headings)" },
  { id: "Arial, Helvetica, sans-serif", label: "Arial" },
  { id: "Georgia, Times New Roman, serif", label: "Georgia" },
] as const;

/** Layout colours from the brand palette. Ensign Red is logo artwork only. */
export const EMAIL_COLOUR_SWATCHES = [
  COLORS.ensignNavy.hex,
  COLORS.deepNavy.hex,
  COLORS.slateNavy.hex,
  COLORS.pmBlue.hex,
  COLORS.white.hex,
  COLORS.mist.hex,
  COLORS.harbourGrey.hex,
] as const;

export const ENSIGN_RED = COLORS.ensignRed.hex;

export const OFFICE_FOOTER =
  "Peters & May\nUnit 9, Goodwood Road\nEastleigh, Hampshire SO50 4NT\nUnited Kingdom\n+44 (0)2380 480480";

const SOCIAL_NETWORKS: SocialNetwork[] = [
  "linkedin",
  "instagram",
  "youtube",
  "facebook",
];

export function defaultEmailStyles(): EmailDesignStyles {
  return {
    pageBackground: COLORS.mist.hex,
    contentBackground: COLORS.white.hex,
    contentWidth: 600,
    fontFamily: EMAIL_FONT_BODY,
    headingFontFamily: EMAIL_FONT_HEADING,
    textColor: COLORS.ensignNavy.hex,
    linkColor: COLORS.pmBlue.hex,
    buttonBackground: COLORS.ensignNavy.hex,
    buttonColor: COLORS.white.hex,
    buttonRadius: 4,
    brandLocked: false,
    showUnsubscribeLink: true,
    showPreferencesLink: true,
    unsubscribeLabel: "Unsubscribe",
    preferencesLabel: "Manage preferences",
  };
}

function pad(partial?: Partial<EmailBlock>): Pick<
  EmailBlock,
  "id" | "paddingTop" | "paddingRight" | "paddingBottom" | "paddingLeft" | "align"
> {
  return {
    id: partial?.id || uid("blk"),
    paddingTop: partial?.paddingTop ?? 8,
    paddingRight: partial?.paddingRight ?? 0,
    paddingBottom: partial?.paddingBottom ?? 8,
    paddingLeft: partial?.paddingLeft ?? 0,
    align: partial?.align ?? "left",
  };
}

export function createBlock(
  type: EmailBlockType,
  partial?: Partial<EmailBlock>
): EmailBlock {
  const styles = defaultEmailStyles();
  const base = pad(partial);
  switch (type) {
    case "heading":
      return {
        ...base,
        type: "heading",
        text: "Heading",
        color: styles.textColor,
        fontSize: 28,
        level: 1,
        align: "left",
        ...pick(partial, ["text", "color", "fontSize", "level", "align", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]),
      };
    case "text":
      return {
        ...base,
        type: "text",
        html: "<p>Write your message here.</p>",
        color: styles.textColor,
        fontSize: 16,
        ...pick(partial, ["html", "color", "fontSize", "align", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]),
      };
    case "image":
      return {
        ...base,
        type: "image",
        src: "",
        alt: "",
        href: "",
        widthPercent: 100,
        align: "center",
        ...pick(partial, ["src", "alt", "href", "widthPercent", "align", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]),
      };
    case "button":
      return {
        ...base,
        type: "button",
        label: "Read more",
        href: "https://www.petersandmay.com",
        background: styles.buttonBackground,
        color: styles.buttonColor,
        radius: styles.buttonRadius,
        fullWidth: false,
        fontSize: 16,
        paddingX: 22,
        paddingY: 14,
        borderColor: "",
        borderWidth: 0,
        align: "left",
        ...pick(partial, [
          "label",
          "href",
          "background",
          "color",
          "radius",
          "fullWidth",
          "fontSize",
          "paddingX",
          "paddingY",
          "borderColor",
          "borderWidth",
          "align",
          "paddingTop",
          "paddingRight",
          "paddingBottom",
          "paddingLeft",
        ]),
      };
    case "divider":
      return {
        ...base,
        type: "divider",
        color: COLORS.mist.hex,
        thickness: 1,
        ...pick(partial, ["color", "thickness", "align", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]),
      };
    case "spacer":
      return {
        ...base,
        type: "spacer",
        height: 24,
        paddingTop: 0,
        paddingBottom: 0,
        ...pick(partial, ["height", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]),
      };
    case "social":
      return {
        ...base,
        type: "social",
        align: "center",
        links: SOCIAL_NETWORKS.map((network) => ({ network, url: "" })),
        ...pick(partial, ["links", "align", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]),
      };
    case "logo":
      return {
        ...base,
        type: "logo",
        src: "",
        alt: "Peters & May",
        href: "https://www.petersandmay.com",
        width: 180,
        align: "left",
        ...pick(partial, ["src", "alt", "href", "width", "align", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]),
      };
    case "html":
      return {
        ...base,
        type: "html",
        html: "",
        paddingTop: 0,
        paddingBottom: 0,
        ...pick(partial, ["html", "align", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]),
      };
    case "footer":
      return {
        ...base,
        type: "footer",
        text: OFFICE_FOOTER,
        showPreferences: true,
        align: "center",
        ...pick(partial, [
          "text",
          "showPreferences",
          "align",
          "paddingTop",
          "paddingRight",
          "paddingBottom",
          "paddingLeft",
        ]),
      };
    case "video":
      return {
        ...base,
        type: "video",
        thumbnailSrc: "",
        alt: "Watch video",
        videoUrl: "",
        widthPercent: 100,
        align: "center",
        ...pick(partial, [
          "thumbnailSrc",
          "alt",
          "videoUrl",
          "widthPercent",
          "align",
          "paddingTop",
          "paddingRight",
          "paddingBottom",
          "paddingLeft",
        ]),
      };
    case "quote":
      return {
        ...base,
        type: "quote",
        text: "A short pull quote.",
        attribution: "",
        accentColor: COLORS.pmBlue.hex,
        color: styles.textColor,
        fontSize: 20,
        align: "left",
        ...pick(partial, [
          "text",
          "attribution",
          "accentColor",
          "color",
          "fontSize",
          "align",
          "paddingTop",
          "paddingRight",
          "paddingBottom",
          "paddingLeft",
        ]),
      };
    case "content_card":
      return {
        ...base,
        type: "content_card",
        title: "Article title",
        imageSrc: "",
        bodyHtml: "<p>Short summary.</p>",
        ctaLabel: "Read more",
        ctaHref: "https://www.petersandmay.com",
        contentId: "",
        align: "left",
        ...pick(partial, [
          "title",
          "imageSrc",
          "bodyHtml",
          "ctaLabel",
          "ctaHref",
          "contentId",
          "align",
          "paddingTop",
          "paddingRight",
          "paddingBottom",
          "paddingLeft",
        ]),
      };
    default:
      return {
        ...base,
        type: "text",
        html: "<p></p>",
        color: styles.textColor,
        fontSize: 16,
      };
  }
}

function pick(
  source: Partial<EmailBlock> | undefined,
  keys: string[]
): Record<string, unknown> {
  if (!source) return {};
  const record = source as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  return out;
}

export function columnWidths(preset: SectionPreset): number[] {
  switch (preset) {
    case "2":
      return [50, 50];
    case "3":
      return [34, 33, 33];
    case "4":
      return [25, 25, 25, 25];
    case "third-left":
      return [33, 67];
    case "third-right":
      return [67, 33];
    case "image-left":
      return [40, 60];
    case "image-right":
      return [60, 40];
    default:
      return [100];
  }
}

function equalWidths(count: number): number[] {
  if (count <= 1) return [100];
  const base = Math.floor(100 / count);
  const widths = Array.from({ length: count }, () => base);
  widths[widths.length - 1] += 100 - base * count;
  return widths;
}

function column(width: number, blocks: EmailBlock[] = []): EmailColumn {
  return { id: uid("col"), width, blocks };
}

export function createSection(
  preset: SectionPreset = "1",
  partial?: Partial<EmailSection>
): EmailSection {
  const widths = columnWidths(preset);
  let columns = widths.map((width) => column(width));
  if (preset === "image-left") {
    columns = [
      column(40, [createBlock("image", { alt: "Image" })]),
      column(60, [createBlock("text")]),
    ];
  } else if (preset === "image-right") {
    columns = [
      column(60, [createBlock("text")]),
      column(40, [createBlock("image", { alt: "Image" })]),
    ];
  }
  return {
    id: partial?.id || uid("sec"),
    background: partial?.background ?? "",
    paddingTop: partial?.paddingTop ?? 16,
    paddingRight: partial?.paddingRight ?? 24,
    paddingBottom: partial?.paddingBottom ?? 16,
    paddingLeft: partial?.paddingLeft ?? 24,
    columnGap: partial?.columnGap ?? 16,
    verticalAlign: partial?.verticalAlign ?? "top",
    mobileStack: partial?.mobileStack ?? "default",
    locked: partial?.locked ?? false,
    showFor: partial?.showFor ?? "all",
    columns: partial?.columns ?? columns,
  };
}

export function footerSection(): EmailSection {
  return createSection("1", {
    paddingTop: 8,
    paddingBottom: 24,
    locked: true,
    columns: [column(100, [createBlock("footer")])],
  });
}

export function blankDesign(): EmailDesign {
  return {
    version: 1,
    styles: defaultEmailStyles(),
    sections: [
      createSection("1", {
        columns: [
          column(100, [
            createBlock("text", {
              html: "<p>Hello {{name}},</p><p>Your message here.</p>",
            }),
          ]),
        ],
      }),
      footerSection(),
    ],
  };
}

export function newsletterDesign(): EmailDesign {
  return {
    version: 1,
    styles: defaultEmailStyles(),
    sections: [
      createSection("1", {
        paddingBottom: 8,
        locked: true,
        columns: [column(100, [createBlock("logo")])],
      }),
      createSection("1", {
        paddingTop: 8,
        columns: [
          column(100, [
            createBlock("heading", { text: "News from Peters & May" }),
            createBlock("text", {
              html: "<p>Hello {{name}},</p><p>Here is the latest from Peters & May.</p>",
            }),
            createBlock("button", { label: "Read the update" }),
          ]),
        ],
      }),
      createSection("1", {
        columns: [column(100, [createBlock("social")])],
      }),
      footerSection(),
    ],
  };
}

export function announcementDesign(): EmailDesign {
  return {
    version: 1,
    styles: defaultEmailStyles(),
    sections: [
      createSection("1", {
        columns: [
          column(100, [
            createBlock("logo"),
            createBlock("heading", { text: "An update for you", align: "center" }),
            createBlock("image"),
            createBlock("text", {
              html: "<p>Hello {{name}},</p><p>A short note from Peters & May.</p>",
              align: "center",
            }),
            createBlock("button", { label: "Find out more", align: "center" }),
          ]),
        ],
      }),
      footerSection(),
    ],
  };
}

export function starterDesign(layout: StarterLayout): EmailDesign {
  if (layout === "newsletter") return newsletterDesign();
  if (layout === "announcement") return announcementDesign();
  return blankDesign();
}

export function extractEmailBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (match ? match[1] : html).trim();
}

/** Existing hand-written HTML opens as a single HTML block. */
export function designFromLegacyHtml(html: string): EmailDesign {
  const fragment = extractEmailBody(html);
  return {
    version: 1,
    styles: defaultEmailStyles(),
    sections: [
      createSection("1", {
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        columns: [
          column(100, [
            createBlock("html", {
              html: fragment,
              paddingTop: 0,
              paddingBottom: 0,
            }),
          ]),
        ],
      }),
    ],
  };
}

export function resolveEmailDesign(
  design: EmailDesign | null | undefined,
  htmlBody: string
): EmailDesign {
  const normalized = normalizeEmailDesign(design);
  if (normalized) return normalized;
  if (htmlBody.trim()) return designFromLegacyHtml(htmlBody);
  return blankDesign();
}

function num(value: unknown, fallback: number, min = 0, max = 600): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function align(value: unknown): "left" | "center" | "right" {
  return value === "center" || value === "right" ? value : "left";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeEmailDesign(raw: unknown): EmailDesign | null {
  let value = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.sections)) {
    return null;
  }
  const defaults = defaultEmailStyles();
  const stylesRaw = isRecord(value.styles) ? value.styles : {};
  const styles: EmailDesignStyles = {
    pageBackground: str(stylesRaw.pageBackground, defaults.pageBackground),
    contentBackground: str(stylesRaw.contentBackground, defaults.contentBackground),
    contentWidth: num(stylesRaw.contentWidth, defaults.contentWidth, 320, 800),
    fontFamily: str(stylesRaw.fontFamily, defaults.fontFamily),
    headingFontFamily: str(stylesRaw.headingFontFamily, defaults.headingFontFamily),
    textColor: str(stylesRaw.textColor, defaults.textColor),
    linkColor: str(stylesRaw.linkColor, defaults.linkColor),
    buttonBackground: str(stylesRaw.buttonBackground, defaults.buttonBackground),
    buttonColor: str(stylesRaw.buttonColor, defaults.buttonColor),
    buttonRadius: num(stylesRaw.buttonRadius, defaults.buttonRadius, 0, 40),
    brandLocked: stylesRaw.brandLocked === true,
    showUnsubscribeLink: stylesRaw.showUnsubscribeLink !== false,
    showPreferencesLink: stylesRaw.showPreferencesLink !== false,
    unsubscribeLabel: str(
      stylesRaw.unsubscribeLabel,
      defaults.unsubscribeLabel || "Unsubscribe"
    ),
    preferencesLabel: str(
      stylesRaw.preferencesLabel,
      defaults.preferencesLabel || "Manage preferences"
    ),
  };

  const sections: EmailSection[] = [];
  for (const sectionRaw of value.sections) {
    if (!isRecord(sectionRaw) || !Array.isArray(sectionRaw.columns)) continue;
    const columns: EmailColumn[] = [];
    for (const columnRaw of sectionRaw.columns) {
      if (!isRecord(columnRaw)) continue;
      const blocks: EmailBlock[] = [];
      if (Array.isArray(columnRaw.blocks)) {
        for (const blockRaw of columnRaw.blocks) {
          const block = normalizeBlock(blockRaw);
          if (block) blocks.push(block);
        }
      }
      columns.push({
        id: str(columnRaw.id, uid("col")),
        width: num(columnRaw.width, 100, 1, 100),
        blocks,
      });
    }
    if (columns.length === 0) continue;
    const verticalAlign =
      sectionRaw.verticalAlign === "middle" || sectionRaw.verticalAlign === "bottom"
        ? sectionRaw.verticalAlign
        : "top";
    const mobileStack =
      sectionRaw.mobileStack === "reverse" ? "reverse" : "default";
    const showFor = normalizeShowFor(sectionRaw.showFor);
    sections.push({
      id: str(sectionRaw.id, uid("sec")),
      background: str(sectionRaw.background, ""),
      paddingTop: num(sectionRaw.paddingTop, 16, 0, 120),
      paddingRight: num(sectionRaw.paddingRight, 24, 0, 120),
      paddingBottom: num(sectionRaw.paddingBottom, 16, 0, 120),
      paddingLeft: num(sectionRaw.paddingLeft, 24, 0, 120),
      columnGap: num(sectionRaw.columnGap, 16, 0, 80),
      verticalAlign,
      mobileStack,
      locked: sectionRaw.locked === true,
      showFor,
      columns,
    });
  }
  if (sections.length === 0) return null;
  return { version: 1, styles, sections };
}

function normalizeBlock(raw: unknown): EmailBlock | null {
  if (!isRecord(raw) || typeof raw.type !== "string") return null;
  const type = raw.type as EmailBlockType;
  const known: EmailBlockType[] = [
    "heading",
    "text",
    "image",
    "button",
    "divider",
    "spacer",
    "social",
    "logo",
    "html",
    "footer",
    "video",
    "quote",
    "content_card",
  ];
  if (!known.includes(type)) return null;
  const created = createBlock(type);
  const merged = {
    ...created,
    ...raw,
    id: str(raw.id, created.id),
    type,
    align: align(raw.align ?? created.align),
    paddingTop: num(raw.paddingTop, created.paddingTop, 0, 120),
    paddingRight: num(raw.paddingRight, created.paddingRight, 0, 120),
    paddingBottom: num(raw.paddingBottom, created.paddingBottom, 0, 120),
    paddingLeft: num(raw.paddingLeft, created.paddingLeft, 0, 120),
  };
  if (type === "social") {
    const links = Array.isArray(raw.links)
      ? raw.links
          .filter(isRecord)
          .map((link) => ({
            network: SOCIAL_NETWORKS.includes(link.network as SocialNetwork)
              ? (link.network as SocialNetwork)
              : null,
            url: str(link.url, ""),
          }))
          .filter((link): link is { network: SocialNetwork; url: string } =>
            Boolean(link.network)
          )
      : created.type === "social"
        ? created.links
        : [];
    return { ...(merged as EmailBlock), type: "social", links };
  }
  if (type === "button") {
    return {
      ...(merged as EmailBlock),
      type: "button",
      fullWidth: Boolean(raw.fullWidth),
      radius: num(raw.radius, 4, 0, 40),
      fontSize: num(raw.fontSize, 16, 12, 28),
      paddingX: num(raw.paddingX, 22, 8, 48),
      paddingY: num(raw.paddingY, 14, 6, 40),
      borderColor: str(raw.borderColor, ""),
      borderWidth: num(raw.borderWidth, 0, 0, 8),
    } as EmailBlock;
  }
  if (type === "image") {
    return {
      ...(merged as EmailBlock),
      type: "image",
      widthPercent: num(raw.widthPercent, 100, 10, 100),
    } as EmailBlock;
  }
  if (type === "spacer") {
    return { ...(merged as EmailBlock), type: "spacer", height: num(raw.height, 24, 4, 200) } as EmailBlock;
  }
  if (type === "heading") {
    const levelRaw = num(raw.level, 1, 1, 3);
    const level = (levelRaw === 2 || levelRaw === 3 ? levelRaw : 1) as 1 | 2 | 3;
    return {
      ...(merged as EmailBlock),
      type: "heading",
      fontSize: num(raw.fontSize, 28, 14, 48),
      level,
    } as EmailBlock;
  }
  if (type === "text") {
    return { ...(merged as EmailBlock), type: "text", fontSize: num(raw.fontSize, 16, 12, 28) } as EmailBlock;
  }
  if (type === "footer") {
    const text = str(raw.text, OFFICE_FOOTER).trim();
    const footer: EmailBlock = {
      ...(merged as EmailBlock),
      type: "footer",
      text: text === "Peters & May" || text === "" ? OFFICE_FOOTER : str(raw.text, OFFICE_FOOTER),
      showPreferences: raw.showPreferences !== false,
    };
    if (raw.showUnsubscribe !== undefined) {
      (footer as { showUnsubscribe?: boolean }).showUnsubscribe =
        Boolean(raw.showUnsubscribe);
    }
    const unsubLabel = str(raw.unsubscribeLabel, "").trim();
    const prefsLabel = str(raw.preferencesLabel, "").trim();
    if (unsubLabel) {
      (footer as { unsubscribeLabel?: string }).unsubscribeLabel = unsubLabel;
    }
    if (prefsLabel) {
      (footer as { preferencesLabel?: string }).preferencesLabel = prefsLabel;
    }
    return footer;
  }
  if (type === "video") {
    return {
      ...(merged as EmailBlock),
      type: "video",
      widthPercent: num(raw.widthPercent, 100, 10, 100),
      thumbnailSrc: str(raw.thumbnailSrc, ""),
      alt: str(raw.alt, "Watch video"),
      videoUrl: str(raw.videoUrl, ""),
    } as EmailBlock;
  }
  if (type === "quote") {
    return {
      ...(merged as EmailBlock),
      type: "quote",
      text: str(raw.text, "A short pull quote."),
      attribution: str(raw.attribution, ""),
      accentColor: str(raw.accentColor, COLORS.pmBlue.hex),
      color: str(raw.color, COLORS.ensignNavy.hex),
      fontSize: num(raw.fontSize, 20, 14, 36),
    } as EmailBlock;
  }
  if (type === "content_card") {
    return {
      ...(merged as EmailBlock),
      type: "content_card",
      title: str(raw.title, "Article title"),
      imageSrc: str(raw.imageSrc, ""),
      bodyHtml: str(raw.bodyHtml, "<p>Short summary.</p>"),
      ctaLabel: str(raw.ctaLabel, "Read more"),
      ctaHref: str(raw.ctaHref, "https://www.petersandmay.com"),
      contentId: str(raw.contentId, ""),
    } as EmailBlock;
  }
  return merged as EmailBlock;
}

function normalizeShowFor(value: unknown): SectionShowFor {
  if (
    value === "general_marketing" ||
    value === "sailing_schedules" ||
    value === "freight_forwarding" ||
    value === "commercial_marine"
  ) {
    return value;
  }
  return "all";
}

export function findBlock(
  design: EmailDesign,
  blockId: string
): { sectionId: string; columnId: string; block: EmailBlock } | null {
  for (const section of design.sections) {
    for (const col of section.columns) {
      const block = col.blocks.find((item) => item.id === blockId);
      if (block) return { sectionId: section.id, columnId: col.id, block };
    }
  }
  return null;
}

function mapColumns(
  design: EmailDesign,
  sectionId: string,
  columnId: string,
  mapBlocks: (blocks: EmailBlock[]) => EmailBlock[]
): EmailDesign {
  return {
    ...design,
    sections: design.sections.map((section) => {
      if (section.id !== sectionId) return section;
      return {
        ...section,
        columns: section.columns.map((col) =>
          col.id === columnId ? { ...col, blocks: mapBlocks(col.blocks) } : col
        ),
      };
    }),
  };
}

export function updateBlock(
  design: EmailDesign,
  blockId: string,
  patch: Partial<EmailBlock>
): EmailDesign {
  const found = findBlock(design, blockId);
  if (!found) return design;
  return mapColumns(design, found.sectionId, found.columnId, (blocks) =>
    blocks.map((block) =>
      block.id === blockId ? ({ ...block, ...patch, id: block.id, type: block.type } as EmailBlock) : block
    )
  );
}

export function removeBlock(design: EmailDesign, blockId: string): EmailDesign {
  const found = findBlock(design, blockId);
  if (!found) return design;
  return mapColumns(design, found.sectionId, found.columnId, (blocks) =>
    blocks.filter((block) => block.id !== blockId)
  );
}

export function duplicateBlock(design: EmailDesign, blockId: string): EmailDesign {
  const found = findBlock(design, blockId);
  if (!found) return design;
  const copy = JSON.parse(JSON.stringify(found.block)) as EmailBlock;
  copy.id = uid("blk");
  return mapColumns(design, found.sectionId, found.columnId, (blocks) => {
    const index = blocks.findIndex((block) => block.id === blockId);
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    return next;
  });
}

export function insertBlock(
  design: EmailDesign,
  sectionId: string,
  columnId: string,
  block: EmailBlock,
  beforeBlockId: string | null
): EmailDesign {
  return mapColumns(design, sectionId, columnId, (blocks) => {
    const next = [...blocks];
    const index = beforeBlockId
      ? next.findIndex((item) => item.id === beforeBlockId)
      : -1;
    if (index < 0) next.push(block);
    else next.splice(index, 0, block);
    return next;
  });
}

export function moveBlock(
  design: EmailDesign,
  blockId: string,
  to: { sectionId: string; columnId: string; beforeBlockId: string | null }
): EmailDesign {
  const found = findBlock(design, blockId);
  if (!found) return design;
  const without = removeBlock(design, blockId);
  return insertBlock(without, to.sectionId, to.columnId, found.block, to.beforeBlockId);
}

export function moveBlockBy(design: EmailDesign, blockId: string, direction: -1 | 1): EmailDesign {
  const found = findBlock(design, blockId);
  if (!found) return design;
  const section = design.sections.find((item) => item.id === found.sectionId);
  const col = section?.columns.find((item) => item.id === found.columnId);
  if (!col) return design;
  const index = col.blocks.findIndex((block) => block.id === blockId);
  const target = index + direction;
  if (target < 0 || target >= col.blocks.length) return design;
  const blocks = [...col.blocks];
  const [item] = blocks.splice(index, 1);
  blocks.splice(target, 0, item);
  return mapColumns(design, found.sectionId, found.columnId, () => blocks);
}

export function updateSection(
  design: EmailDesign,
  sectionId: string,
  patch: Partial<EmailSection>
): EmailDesign {
  return {
    ...design,
    sections: design.sections.map((section) =>
      section.id === sectionId ? { ...section, ...patch, id: section.id } : section
    ),
  };
}

export function setSectionPreset(
  design: EmailDesign,
  sectionId: string,
  preset: SectionPreset
): EmailDesign {
  return {
    ...design,
    sections: design.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const widths = columnWidths(preset);
      const columns: EmailColumn[] = widths.map((width, index) => ({
        id: section.columns[index]?.id || uid("col"),
        width,
        blocks: section.columns[index]?.blocks ?? [],
      }));
      if (section.columns.length > columns.length) {
        const extra = section.columns.slice(columns.length).flatMap((col) => col.blocks);
        columns[columns.length - 1] = {
          ...columns[columns.length - 1],
          blocks: [...columns[columns.length - 1].blocks, ...extra],
        };
      }
      return { ...section, columns };
    }),
  };
}

export function insertSection(
  design: EmailDesign,
  section: EmailSection,
  beforeSectionId: string | null
): EmailDesign {
  const sections = [...design.sections];
  const index = beforeSectionId
    ? sections.findIndex((item) => item.id === beforeSectionId)
    : -1;
  if (index < 0) sections.push(section);
  else sections.splice(index, 0, section);
  return { ...design, sections };
}

export function removeSection(design: EmailDesign, sectionId: string): EmailDesign {
  if (design.sections.length <= 1) return design;
  return {
    ...design,
    sections: design.sections.filter((section) => section.id !== sectionId),
  };
}

export function duplicateSection(design: EmailDesign, sectionId: string): EmailDesign {
  const section = design.sections.find((item) => item.id === sectionId);
  if (!section) return design;
  const copy = JSON.parse(JSON.stringify(section)) as EmailSection;
  copy.id = uid("sec");
  copy.columns = copy.columns.map((col) => ({
    ...col,
    id: uid("col"),
    blocks: col.blocks.map((block) => ({ ...block, id: uid("blk") })),
  }));
  const sections = [...design.sections];
  const index = sections.findIndex((item) => item.id === sectionId);
  sections.splice(index + 1, 0, copy);
  return { ...design, sections };
}

export function moveSection(
  design: EmailDesign,
  sectionId: string,
  direction: -1 | 1
): EmailDesign {
  const index = design.sections.findIndex((section) => section.id === sectionId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= design.sections.length) return design;
  const sections = [...design.sections];
  const [item] = sections.splice(index, 1);
  sections.splice(target, 0, item);
  return { ...design, sections };
}

export function addColumn(
  design: EmailDesign,
  sectionId: string
): EmailDesign {
  return {
    ...design,
    sections: design.sections.map((section) => {
      if (section.id !== sectionId) return section;
      if (section.columns.length >= 4) return section;
      const columns = [...section.columns, column(1)];
      const widths = equalWidths(columns.length);
      return {
        ...section,
        columns: columns.map((col, index) => ({
          ...col,
          width: widths[index] ?? col.width,
        })),
      };
    }),
  };
}

export function removeColumn(
  design: EmailDesign,
  sectionId: string,
  columnId: string
): EmailDesign {
  return {
    ...design,
    sections: design.sections.map((section) => {
      if (section.id !== sectionId) return section;
      if (section.columns.length <= 1) return section;
      const removed = section.columns.find((col) => col.id === columnId);
      const remaining = section.columns.filter((col) => col.id !== columnId);
      if (!removed || remaining.length === 0) return section;
      const widths = equalWidths(remaining.length);
      const merged = remaining.map((col, index) => ({
        ...col,
        width: widths[index] ?? col.width,
        blocks:
          index === remaining.length - 1
            ? [...col.blocks, ...removed.blocks]
            : col.blocks,
      }));
      return { ...section, columns: merged };
    }),
  };
}

/** Set explicit column widths (percent). Values are normalised to sum 100. */
export function setColumnWidths(
  design: EmailDesign,
  sectionId: string,
  widths: number[]
): EmailDesign {
  return {
    ...design,
    sections: design.sections.map((section) => {
      if (section.id !== sectionId) return section;
      if (widths.length !== section.columns.length) return section;
      const cleaned = widths.map((width) =>
        Math.max(5, Math.min(95, Math.round(width)))
      );
      const total = cleaned.reduce((sum, width) => sum + width, 0) || 100;
      const normalised = cleaned.map((width) =>
        Math.max(5, Math.round((width / total) * 100))
      );
      const drift =
        100 - normalised.reduce((sum, width) => sum + width, 0);
      normalised[normalised.length - 1] += drift;
      return {
        ...section,
        columns: section.columns.map((col, index) => ({
          ...col,
          width: normalised[index] ?? col.width,
        })),
      };
    }),
  };
}
