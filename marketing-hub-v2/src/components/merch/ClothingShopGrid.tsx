"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { isImageUrl } from "@/lib/social/platforms";
import { imageForColour } from "@/lib/merch/product-images";
import { ColourSwatches, SizeChips } from "@/components/merch/ColourSwatches";
import type { ClothingProductCardItem } from "@/components/merch/ClothingProductCards";

export type ShopSelection = {
  productId: string;
  colour: string;
  size: string;
};

function ShopCard({
  product,
  onOpen,
}: {
  product: ClothingProductCardItem;
  onOpen: (selection: ShopSelection) => void;
}) {
  const swatches = product.colourSwatches?.length
    ? product.colourSwatches
    : product.colours.map((name) => ({ name, hex: "" }));
  const sizes = product.sizes?.length ? product.sizes : [];
  const [colour, setColour] = useState(
    product.defaultColour || swatches[0]?.name || product.colours[0] || ""
  );
  const [size, setSize] = useState(sizes.includes("M") ? "M" : sizes[0] || "");

  const imageSrc = useMemo(() => {
    const gallery = product.images ?? [];
    return (
      imageForColour(gallery, colour, product.image_url) || product.image_url
    );
  }, [product.images, product.image_url, colour]);

  return (
    <article className="group flex flex-col">
      <button
        type="button"
        onClick={() =>
          onOpen({ productId: product.id, colour, size })
        }
        className="relative block w-full overflow-hidden bg-[#E8EAED] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B2545]"
      >
        {imageSrc && isImageUrl(imageSrc) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={product.label}
            className="aspect-[3/4] w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center bg-[#E3E6E9] text-xs uppercase tracking-wide text-muted">
            No photo
          </div>
        )}
      </button>

      <div className="mt-3 space-y-3 px-0.5">
        {sizes.length ? (
          <SizeChips sizes={sizes} value={size} onChange={setSize} />
        ) : null}
        {swatches.length ? (
          <ColourSwatches
            colours={swatches}
            value={colour}
            onChange={setColour}
          />
        ) : null}
        <button
          type="button"
          onClick={() => onOpen({ productId: product.id, colour, size })}
          className="text-left"
        >
          <h3 className="font-display text-base leading-snug text-[#0B2545]">
            {product.label}
            {colour ? (
              <span className="font-normal text-foreground/70">
                {" "}
                – {colour}
              </span>
            ) : null}
          </h3>
          {product.brand ? (
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">
              {product.brand}
            </p>
          ) : null}
        </button>
      </div>
    </article>
  );
}

export function ClothingShopGrid({
  products,
  onOpenProduct,
}: {
  products: ClothingProductCardItem[];
  onOpenProduct: (selection: ShopSelection) => void;
}) {
  const visible = products.filter((p) => !p.hidden);

  if (!visible.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-16 text-center">
        <p className="font-display text-lg text-brand">Catalogue is empty</p>
        <p className="mt-1 text-sm text-muted">
          Marketing can add clothing items under Catalogue.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-8 sm:gap-10",
        "grid-cols-1 md:grid-cols-2"
      )}
    >
      {visible.map((product) => (
        <ShopCard
          key={product.id}
          product={product}
          onOpen={onOpenProduct}
        />
      ))}
    </div>
  );
}
