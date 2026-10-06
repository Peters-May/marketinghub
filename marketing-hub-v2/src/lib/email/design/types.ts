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
};

export type BlockPadding = {
  id: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  align: EmailAlign;
};

export type HeadingBlock = BlockPadding & {
  type: "heading";
  text: string;
  color: string;
  fontSize: number;
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
  | FooterBlock;

export type EmailBlockType = EmailBlock["type"];

export type EmailColumn = {
  id: string;
  /** Share of the row, 1–100. Columns in a section should sum to 100. */
  width: number;
  blocks: EmailBlock[];
};

export type EmailSection = {
  id: string;
  background: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  columnGap: number;
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
  | "image-left"
  | "image-right";

export type StarterLayout = "blank" | "newsletter" | "announcement";
