"use client";

import { useMemo, useState } from "react";
import { isImageUrl } from "@/lib/social/platforms";
import { cn } from "@/lib/utils";
import {
  CLOTHING_FITS,
  CLOTHING_LOGOS,
  DEFAULT_CLOTHING_LOGO,
  clothingLogoHint,
  type ClothingFit,
  type ClothingLogo,
} from "@/lib/merch/north-sails";
import { imageForColour } from "@/lib/merch/product-images";
import { ColourSwatches, SizeChips } from "@/components/merch/ColourSwatches";
import type { ClothingProductCardItem } from "@/components/merch/ClothingProductCards";
import type { ShopSelection } from "@/components/merch/ClothingShopGrid";

export type BagLineDraft = {
  productId: string;
  item: string;
  fit: ClothingFit;
  size: string;
  colour: string;
  logo: ClothingLogo;
  quantity: number;
  image_url: string;
};

export function ClothingProductDetail({
  product,
  initial,
  onClose,
  onAddToBag,
  standalone = false,
}: {
  product: ClothingProductCardItem;
  initial?: Partial<ShopSelection>;
  onClose: () => void;
  onAddToBag: (line: BagLineDraft) => void;
  /** Full-viewport overlay (public shop has no hub sidebar). */
  standalone?: boolean;
}) {
  const swatches = product.colourSwatches?.length
    ? product.colourSwatches
    : product.colours.map((name) => ({ name, hex: "" }));
  const sizes = product.sizes?.length ? product.sizes : [];

  const [colour, setColour] = useState(
    initial?.colour ||
      product.defaultColour ||
      swatches[0]?.name ||
      product.colours[0] ||
      ""
  );
  const [size, setSize] = useState(
    initial?.size || (sizes.includes("M") ? "M" : sizes[0] || "M")
  );
  const [fit, setFit] = useState<ClothingFit>("male");
  const [logo, setLogo] = useState<ClothingLogo>(DEFAULT_CLOTHING_LOGO);
  const [quantity, setQuantity] = useState(1);
  const [showDetails, setShowDetails] = useState(false);

  const gallery = useMemo(() => {
    const images = [...(product.images ?? [])].filter((img) =>
      img.url?.trim()
    );
    if (images.length) return images;
    if (product.image_url) return [{ url: product.image_url, sort: 0 }];
    return [];
  }, [product.images, product.image_url]);

  const activeImage = imageForColour(gallery, colour, product.image_url);
  const galleryForColour = useMemo(() => {
    const wanted = colour.trim().toLowerCase();
    const matched = gallery.filter(
      (img) =>
        !img.colour ||
        !wanted ||
        img.colour.trim().toLowerCase() === wanted
    );
    return matched.length ? matched : gallery;
  }, [gallery, colour]);

  function add() {
    onAddToBag({
      productId: product.id,
      item: product.label,
      fit,
      size,
      colour,
      logo,
      quantity: Math.max(1, quantity),
      image_url: activeImage || product.image_url,
    });
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        standalone ? "" : "md:left-sidebar"
      )}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close product"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-5xl flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-2 py-1 text-sm"
          >
            ← Back to shop
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.9fr]">
            <div className="bg-[#E8EAED] p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {(galleryForColour.length ? galleryForColour : [{ url: "" }]).map(
                  (img, i) => (
                    <div
                      key={`${img.url}-${i}`}
                      className={cn(
                        "overflow-hidden bg-[#E3E6E9]",
                        i === 0 && galleryForColour.length === 1
                          ? "col-span-2 aspect-[3/4]"
                          : "aspect-[3/4]"
                      )}
                    >
                      {img.url && isImageUrl(img.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img.url}
                          alt={`${product.label}${colour ? ` – ${colour}` : ""}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs uppercase tracking-wide text-muted">
                          No photo
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="sticky top-0 self-start space-y-5 p-5 sm:p-6">
              <div>
                <h2 className="font-display text-2xl leading-tight text-[#0B2545]">
                  {product.label}
                  {colour ? (
                    <span className="font-normal text-foreground/70">
                      {" "}
                      – {colour}
                    </span>
                  ) : null}
                </h2>
                {product.brand ? (
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted">
                    {product.brand}
                    {product.material ? ` · ${product.material}` : ""}
                  </p>
                ) : null}
              </div>

              {swatches.length ? (
                <div>
                  <p className="label mb-2">
                    Colour{colour ? `: ${colour}` : ""}
                  </p>
                  <ColourSwatches
                    colours={swatches}
                    value={colour}
                    onChange={setColour}
                  />
                </div>
              ) : null}

              {sizes.length ? (
                <div>
                  <p className="label mb-2">Size{size ? `: ${size}` : ""}</p>
                  <SizeChips sizes={sizes} value={size} onChange={setSize} />
                </div>
              ) : null}

              <div>
                <p className="label mb-2">Fit</p>
                <div className="flex flex-wrap gap-1.5">
                  {CLOTHING_FITS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFit(f.id)}
                      className={cn(
                        "border px-3 py-1.5 text-xs font-medium transition",
                        fit === f.id
                          ? "border-[#0B2545] bg-[#0B2545] text-white"
                          : "border-border bg-white hover:border-[#0B2545]/50"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="label mb-2">Logo</p>
                <select
                  className="field"
                  value={logo}
                  onChange={(e) => setLogo(e.target.value as ClothingLogo)}
                >
                  {CLOTHING_LOGOS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-muted">
                  {clothingLogoHint(logo)}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="inline-flex items-center rounded-full border border-border">
                  <button
                    type="button"
                    className="px-3 py-2 text-sm"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="min-w-[2rem] text-center text-sm font-medium">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    className="px-3 py-2 text-sm"
                    onClick={() => setQuantity((q) => q + 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={add}
                className="w-full bg-[#0B2545] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-[#071A2E]"
              >
                Add to bag
              </button>

              {(product.description ||
                product.material ||
                product.supplier_url) && (
                <div className="border-t border-border pt-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left text-sm font-medium text-foreground"
                    onClick={() => setShowDetails((v) => !v)}
                  >
                    Product details
                    <span className="text-muted">{showDetails ? "−" : "+"}</span>
                  </button>
                  {showDetails ? (
                    <div className="mt-3 space-y-2 text-sm text-muted">
                      {product.description ? (
                        <p className="text-foreground/80">{product.description}</p>
                      ) : null}
                      {product.material ? (
                        <p>Material: {product.material}</p>
                      ) : null}
                      {product.supplier_url ? (
                        <a
                          href={product.supplier_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand underline-offset-2 hover:underline"
                        >
                          View supplier product
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
