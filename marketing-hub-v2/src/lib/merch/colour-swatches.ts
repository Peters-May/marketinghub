import type { MerchCatalogueColour } from "@/lib/types";

/** Default hex for well-known clothing colour names. */
const COLOUR_HEX: Record<string, string> = {
  navy: "#0B2545",
  white: "#F5F5F5",
  yellow: "#E8C84A",
  sand: "#C4A574",
  olive: "#6B7A4A",
  black: "#1A1A1A",
  grey: "#8A8F98",
  gray: "#8A8F98",
  red: "#B33A3A",
  blue: "#007DC5",
  green: "#3D6B4F",
  "washed yellow": "#D4C06A",
};

export function hexForColourName(name: string): string {
  const key = name.trim().toLowerCase();
  return COLOUR_HEX[key] ?? "#94A3B8";
}

/** Build swatches from name list, preserving any known hex overrides. */
export function swatchesFromColourNames(
  names: string[],
  existing?: MerchCatalogueColour[] | null
): MerchCatalogueColour[] {
  const byName = new Map(
    (existing ?? []).map((c) => [c.name.trim().toLowerCase(), c])
  );
  return names
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name) => {
      const prev = byName.get(name.toLowerCase());
      return {
        name,
        hex: prev?.hex?.trim() || hexForColourName(name),
      };
    });
}

export function colourNamesFromSwatches(
  swatches: MerchCatalogueColour[] | undefined,
  fallbackNames: string[] = []
): string[] {
  if (swatches?.length) {
    return swatches.map((c) => c.name.trim()).filter(Boolean);
  }
  return fallbackNames.map((n) => n.trim()).filter(Boolean);
}
