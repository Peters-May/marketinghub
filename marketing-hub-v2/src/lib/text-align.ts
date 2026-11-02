const TEXT_ALIGNS = ["left", "center", "right"] as const;

export type TextAlign = (typeof TEXT_ALIGNS)[number];

/** Read a safe text-align value out of a style attribute. */
export function textAlignFromStyle(style: string): TextAlign | null {
  const match = /text-align\s*:\s*(left|center|right)\b/i.exec(style);
  if (!match) return null;
  const align = match[1].toLowerCase();
  return align === "left" || align === "center" || align === "right" ? align : null;
}
