import { describe, expect, it } from "vitest";
import {
  clothingProductsWithImages,
  resolvedClothingProducts,
} from "@/lib/merch/product-images";
import type { MerchCatalogueImage } from "@/lib/types";

function row(
  partial: Partial<MerchCatalogueImage> & { product_id: string }
): MerchCatalogueImage {
  return {
    image_url: "",
    updated_at: "2026-11-09T13:18:07.443Z",
    ...partial,
  };
}

describe("catalogue hidden products", () => {
  it("excludes built-ins marked hidden from the shop list", () => {
    const catalogue = [
      row({ product_id: "high_vis", hidden: true }),
      row({
        product_id: "men_s_breeze_gilet",
        label: "Breeze Gilet",
        custom: true,
        image_url: "https://example.com/gilet.webp",
      }),
    ];

    const products = clothingProductsWithImages(catalogue, [], {
      includeHidden: false,
    });

    expect(products.map((p) => p.id)).toEqual(["men_s_breeze_gilet"]);
  });

  it("does not resurrect uncatalogued built-ins once catalogue rows exist", () => {
    const catalogue = [
      row({
        product_id: "men_s_breeze_gilet",
        label: "Breeze Gilet",
        custom: true,
        image_url: "https://example.com/gilet.webp",
      }),
    ];

    const ids = resolvedClothingProducts(catalogue, {
      includeHidden: false,
    }).map((p) => p.id);

    expect(ids).toEqual(["men_s_breeze_gilet"]);
    expect(ids).not.toContain("high_vis");
    expect(ids).not.toContain("backpack");
  });

  it("still lists hidden built-ins for admin catalogue management", () => {
    const catalogue = [row({ product_id: "high_vis", hidden: true })];
    const ids = resolvedClothingProducts(catalogue, {
      includeHidden: true,
    }).map((p) => p.id);

    expect(ids).toContain("high_vis");
  });
});
