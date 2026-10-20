/** Visual email document. Compiled to table HTML for sending. */

export type EmailAlign = "left" | "center" | "right";

export type EmailDesignStyles = {
  pageBackground: string;
  contentBackground: string;
  contentWidth: number;
  fontFamily: string;
  headingFontFamily: string;
  textColor: string;
  linkColor: string;
  buttonBackground: string;
  buttonColor: string;
  buttonRadius: number;
  /** When true, sections marked locked cannot be edited or removed in the designer. */
  brandLocked?: boolean;
  /** Include an Unsubscribe link in footer blocks / auto footer. */
  showUnsubscribeLink?: boolean;
  /** Include a Manage preferences link (subscribe / adjust lists). */
  showPreferencesLink?: boolean;
  unsubscribeLabel?: string;
  preferencesLabel?: string;
};

export type BlockPadding = {
  id: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  align: EmailAlign;
};

export type HeadingLevel = 1 | 2 | 3;

export type HeadingBlock = BlockPadding & {
  type: "heading";
  text: string;
  color: string;
  fontSize: number;
  /** Semantic heading level in compiled HTML. Defaults to 1. */
  level: HeadingLevel;
};

export type TextBlock = BlockPadding & {
  type: "text";
  html: string;
  color: string;
  fontSize: number;
};

export type ImageBlock = BlockPadding & {
  type: "image";
  src: string;
  alt: string;
  href: string;
  widthPercent: number;
};

export type ButtonBlock = BlockPadding & {
  type: "button";
  label: string;
  href: string;
  background: string;
  color: string;
  radius: number;
  fullWidth: boolean;
  fontSize: number;
  paddingX: number;
  paddingY: number;
  borderColor: string;
  borderWidth: number;
};

export type DividerBlock = BlockPadding & {
  type: "divider";
  color: string;
  thickness: number;
};

export type SpacerBlock = BlockPadding & {
  type: "spacer";
  height: number;
};

export type SocialNetwork = "linkedin" | "instagram" | "youtube" | "facebook";

export type SocialLink = {
  network: SocialNetwork;
  url: string;
};

export type SocialBlock = BlockPadding & {
  type: "social";
  links: SocialLink[];
};

export type LogoBlock = BlockPadding & {
  type: "logo";
  src: string;
  alt: string;
  href: string;
  width: number;
};

export type HtmlBlock = BlockPadding & {
  type: "html";
  html: string;
};

export type FooterBlock = BlockPadding & {
  type: "footer";
  text: string;
  /** @deprecated Prefer design.styles.showPreferencesLink */
  showPreferences: boolean;
  /** Override email-level unsubscribe visibility when set. */
  showUnsubscribe?: boolean;
  unsubscribeLabel?: string;
  preferencesLabel?: string;
};

/** Clickable thumbnail that opens a video URL (YouTube / Vimeo / file). */
export type VideoBlock = BlockPadding & {
  type: "video";
  thumbnailSrc: string;
  alt: string;
  videoUrl: string;
  widthPercent: number;
};

export type QuoteBlock = BlockPadding & {
  type: "quote";
  text: string;
  attribution: string;
  accentColor: string;
  color: string;
  fontSize: number;
};

/** Title + image + body + CTA — optional hub content id for reference. */
export type ContentCardBlock = BlockPadding & {
  type: "content_card";
  title: string;
  imageSrc: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
  contentId: string;
};

export type EmailBlock =
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | SocialBlock
  | LogoBlock
  | HtmlBlock
  | FooterBlock
  | VideoBlock
  | QuoteBlock
  | ContentCardBlock;

export type EmailBlockType = EmailBlock["type"];

export type EmailColumn = {
  id: string;
  /** Share of the row, 1–100. Columns in a section should sum to 100. */
  width: number;
  blocks: EmailBlock[];
};

export type SectionVerticalAlign = "top" | "middle" | "bottom";
/** How columns stack on narrow viewports. */
export type SectionMobileStack = "default" | "reverse";

/**
 * Audience topic gate for a section. Empty / "all" = always included.
 * Matched against the campaign audience topic at send/compile time.
 */
export type SectionShowFor =
  | "all"
  | "general_marketing"
  | "sailing_schedules"
  | "freight_forwarding"
  | "commercial_marine";

export type EmailSection = {
  id: string;
  background: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  columnGap: number;
  verticalAlign: SectionVerticalAlign;
  mobileStack: SectionMobileStack;
  /** Brand-locked sections (header/footer) cannot be changed when styles.brandLocked. */
  locked?: boolean;
  showFor?: SectionShowFor;
  columns: EmailColumn[];
};

export type EmailDesign = {
  version: 1;
  styles: EmailDesignStyles;
  sections: EmailSection[];
};

export type SectionPreset =
  | "1"
  | "2"
  | "3"
  | "4"
  | "third-left"
  | "third-right"
  | "image-left"
  | "image-right";

export type StarterLayout = "blank" | "newsletter" | "announcement";
