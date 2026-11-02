export type TextAlign = "left" | "center" | "right";

/** Read a safe text-align value out of a style attribute. */
export function textAlignFromStyle(style: string): TextAlign | null {
  const match = /text-align\s*:\s*(left|center|right)\b/i.exec(style);
  if (!match) return null;
  return match[1].toLowerCase() as TextAlign;
}
