"use client";

import { cn } from "@/lib/utils";
import { isImageUrl } from "@/lib/social/platforms";
import type { ClothingProduct } from "@/lib/merch/north-sails";
import type {
  MerchCatalogueColour,
  MerchCatalogueImageAsset,
} from "@/lib/types";

export type ClothingProductCardItem = ClothingProduct & {
  image_url: string;
  hidden?: boolean;
  images?: MerchCatalogueImageAsset[];
  colourSwatches?: MerchCatalogueColour[];
  sizes?: string[];
  description?: string;
  supplier_url?: string;
  /** Admin-only unit cost in GBP. */
  unit_cost?: number | null;
  custom?: boolean;
};

function ProductThumb({
  src,
  label,
  size = "md",
}: {
  src: string;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "sm"
      ? "h-10 w-10 rounded-lg"
      : size === "lg"
        ? "aspect-[3/4] w-full"
        : "aspect-[4/5] w-full";
  if (src && isImageUrl(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        className={cn(
          box,
          "shrink-0 object-cover bg-sand/40",
          size === "sm" ? "rounded-lg border border-border" : ""
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        box,
        "flex shrink-0 items-center justify-center bg-sand/50 text-[10px] font-medium uppercase tracking-wide text-muted",
        size === "sm"
          ? "rounded-lg border border-dashed border-border"
          : "border-b border-border"
      )}
      aria-hidden
    >
      {size === "sm" ? "—" : "No photo"}
    </div>
  );
}

/** Product picker cards for clothing orders. */
export function ClothingProductCards({
  products,
  value,
  onChange,
}: {
  products: ClothingProductCardItem[];
  value: string;
  onChange: (itemLabel: string) => void;
}) {
  return (
    <div className="md:col-span-2">
      <label className="label">Choose item</label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => {
          const selected = product.label === value;
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onChange(product.label)}
              className={cn(
                "group flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                selected
                  ? "border-brand ring-1 ring-brand"
                  : "border-border hover:border-brand/40"
              )}
              aria-pressed={selected}
              title={product.label}
            >
              <ProductThumb src={product.image_url} label={product.label} />
              <span className="flex flex-1 flex-col gap-0.5 p-3">
                <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                  {product.label}
                </span>
                <span className="text-[11px] text-muted">
                  {product.brand}
                  {product.colours.length
                    ? ` · ${product.colours.join(", ")}`
                    : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ClothingThumb({
  src,
  label,
  className,
  size = "sm",
}: {
  src: string;
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={className}>
      <ProductThumb src={src} label={label ?? ""} size={size} />
    </div>
  );
}
