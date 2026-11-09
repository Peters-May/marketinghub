"use client";

import { cn } from "@/lib/utils";
import type { MerchCatalogueColour } from "@/lib/types";
import { hexForColourName } from "@/lib/merch/colour-swatches";

export function ColourSwatches({
  colours,
  value,
  onChange,
  size = "md",
}: {
  colours: MerchCatalogueColour[] | string[];
  value: string;
  onChange: (colour: string) => void;
  size?: "sm" | "md";
}) {
  const swatches: MerchCatalogueColour[] = colours.map((c) =>
    typeof c === "string"
      ? { name: c, hex: hexForColourName(c) }
      : { name: c.name, hex: c.hex || hexForColourName(c.name) }
  );

  const dim = size === "sm" ? "h-5 w-5" : "h-7 w-7";

  return (
    <div className="flex flex-wrap items-center gap-2" role="listbox" aria-label="Colour">
      {swatches.map((swatch) => {
        const selected =
          swatch.name.trim().toLowerCase() === value.trim().toLowerCase();
        const isLight =
          swatch.hex.toLowerCase() === "#ffffff" ||
          swatch.hex.toLowerCase() === "#f5f5f5" ||
          swatch.hex.toLowerCase() === "#fff";
        return (
          <button
            key={swatch.name}
            type="button"
            role="option"
            aria-selected={selected}
            title={swatch.name}
            onClick={(e) => {
              e.stopPropagation();
              onChange(swatch.name);
            }}
            className={cn(
              dim,
              "rounded-full transition",
              selected
                ? "ring-2 ring-[#0B2545] ring-offset-2"
                : "ring-1 ring-black/10 hover:ring-black/25",
              isLight ? "border border-black/15" : ""
            )}
            style={{ backgroundColor: swatch.hex }}
          />
        );
      })}
    </div>
  );
}

export function SizeChips({
  sizes,
  value,
  onChange,
}: {
  sizes: string[];
  value: string;
  onChange: (size: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Size">
      {sizes.map((size) => {
        const selected = size === value;
        return (
          <button
            key={size}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={(e) => {
              e.stopPropagation();
              onChange(size);
            }}
            className={cn(
              "min-w-[2.25rem] border px-2 py-1.5 text-xs font-medium tracking-wide transition",
              selected
                ? "border-[#0B2545] bg-[#0B2545] text-white"
                : "border-border bg-white text-foreground hover:border-[#0B2545]/50"
            )}
          >
            {size}
          </button>
        );
      })}
    </div>
  );
}
