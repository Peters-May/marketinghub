import type {
  MerchCatalogueColour,
  MerchCatalogueImage,
  MerchCatalogueImageAsset,
  MerchInventoryItem,
} from "@/lib/types";
import {
  colourNamesFromSwatches,
  swatchesFromColourNames,
} from "@/lib/merch/colour-swatches";
import {
  CLOTHING_PRODUCTS,
  CLOTHING_SIZES,
  clothingProductByLabel,
  type ClothingBrand,
  type ClothingProduct,
} from "@/lib/merch/north-sails";

export type ShopClothingProduct = ClothingProduct & {
  image_url: string;
  images: MerchCatalogueImageAsset[];
  colourSwatches: MerchCatalogueColour[];
  sizes: string[];
  description?: string;
  supplier_url?: string;
  /** Unit cost in GBP — only returned to admins. */
  unit_cost?: number | null;
  hidden?: boolean;
  custom?: boolean;
};

/** Map product id → catalogue row. */
export function catalogueByProductId(
  catalogue: MerchCatalogueImage[]
): Record<string, MerchCatalogueImage> {
  const map: Record<string, MerchCatalogueImage> = {};
  for (const row of catalogue) {
    if (row.product_id) map[row.product_id] = row;
  }
  return map;
}

/** Primary image url from a catalogue row (images[] or legacy image_url). */
export function primaryCatalogueImageUrl(
  row?: MerchCatalogueImage | null
): string {
  if (!row) return "";
  const fromGallery = [...(row.images ?? [])]
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .find((img) => img.url?.trim())?.url;
  return (fromGallery || row.image_url || "").trim();
}

/** Map product id → primary catalogue image url. */
export function catalogueImageMap(
  catalogue: MerchCatalogueImage[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of catalogue) {
    const url = primaryCatalogueImageUrl(row);
    if (row.product_id && url) map[row.product_id] = url;
  }
  return map;
}

function normalizeGallery(
  row?: MerchCatalogueImage | null
): MerchCatalogueImageAsset[] {
  if (!row) return [];
  const fromImages = [...(row.images ?? [])]
    .filter((img) => img.url?.trim())
    .map((img, i) => ({
      url: img.url.trim(),
      colour: img.colour?.trim() || undefined,
      sort: img.sort ?? i,
    }))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  if (fromImages.length) return fromImages;
  const legacy = row.image_url?.trim();
  return legacy ? [{ url: legacy, sort: 0 }] : [];
}

/** Apply stored catalogue overrides onto a built-in product. */
export function applyCatalogueOverrides(
  product: ClothingProduct,
  row?: MerchCatalogueImage | null
): ClothingProduct {
  if (!row) return product;
  const label = row.label?.trim();
  const brand = row.brand?.trim();
  const material = row.material?.trim();
  const description = row.description?.trim();
  const colours = colourNamesFromSwatches(
    row.colour_swatches,
    row.colours ?? []
  );
  const defaultColour = row.default_colour?.trim();
  const supplier =
    row.supplier_url?.trim() ||
    product.links?.male ||
    product.links?.female ||
    product.supplier_url;
  return {
    ...product,
    ...(label ? { label } : {}),
    ...(brand ? { brand: brand as ClothingBrand } : {}),
    ...(material ? { material } : {}),
    ...(description ? { description } : {}),
    ...(colours.length ? { colours } : {}),
    ...(defaultColour ? { defaultColour } : {}),
    ...(row.sizes?.length ? { sizes: row.sizes } : {}),
    ...(supplier ? { supplier_url: supplier } : {}),
  };
}

function productFromCatalogueRow(row: MerchCatalogueImage): ClothingProduct {
  const colours = colourNamesFromSwatches(
    row.colour_swatches,
    row.colours ?? []
  );
  const defaultColour =
    row.default_colour?.trim() || colours[0] || "Navy";
  return {
    id: row.product_id,
    label: row.label?.trim() || row.product_id,
    brand: (row.brand?.trim() || "Other") as ClothingBrand,
    material: row.material?.trim() || undefined,
    description: row.description?.trim() || undefined,
    colours: colours.length ? colours : ["Navy"],
    defaultColour,
    sizes: row.sizes?.length ? row.sizes : [...CLOTHING_SIZES],
    supplier_url: row.supplier_url?.trim() || undefined,
  };
}

function isCustomCatalogueRow(row: MerchCatalogueImage): boolean {
  if (row.custom) return true;
  return !CLOTHING_PRODUCTS.some((p) => p.id === row.product_id);
}

/**
 * Built-in products with catalogue overrides, plus any admin-created products.
 */
export function resolvedClothingProducts(
  catalogue: MerchCatalogueImage[],
  options?: { includeHidden?: boolean }
): ClothingProduct[] {
  const byId = catalogueByProductId(catalogue);
  const builtIn = CLOTHING_PRODUCTS.flatMap((p) => {
    const row = byId[p.id] ?? null;
    if (!options?.includeHidden && row?.hidden) return [];
    return [applyCatalogueOverrides(p, row)];
  });
  const custom = catalogue.flatMap((row) => {
    if (!isCustomCatalogueRow(row)) return [];
    if (!options?.includeHidden && row.hidden) return [];
    if (!row.label?.trim() && !row.image_url?.trim() && !(row.images?.length)) {
      return [];
    }
    return [productFromCatalogueRow(row)];
  });
  return [...builtIn, ...custom];
}

/** Effective display label for a product id (override, custom, or built-in). */
export function effectiveProductLabel(
  productId: string,
  catalogue: MerchCatalogueImage[]
): string | undefined {
  const row = catalogueByProductId(catalogue)[productId];
  if (row?.label?.trim()) return row.label.trim();
  const base = CLOTHING_PRODUCTS.find((p) => p.id === productId);
  if (base) return applyCatalogueOverrides(base, row ?? null).label;
  return row ? productFromCatalogueRow(row).label : undefined;
}

/** First inventory photo found per item label. */
export function inventoryImageByItemLabel(
  inventory: MerchInventoryItem[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of inventory) {
    const label = row.item.trim();
    const url = row.image_url?.trim();
    if (!label || !url || map[label]) continue;
    map[label] = url;
  }
  return map;
}

/**
 * Prefer catalogue product photo, then any inventory photo for that item.
 */
export function resolveClothingProductImage(
  product: ClothingProduct,
  catalogueById: Record<string, string>,
  inventoryByLabel: Record<string, string>
): string {
  return (
    catalogueById[product.id]?.trim() ||
    inventoryByLabel[product.label]?.trim() ||
    ""
  );
}

export function clothingProductImageForLabel(
  label: string,
  catalogue: MerchCatalogueImage[],
  inventory: MerchInventoryItem[]
): string {
  const products = resolvedClothingProducts(catalogue, { includeHidden: true });
  const product = clothingProductByLabel(label, products);
  if (!product) {
    return inventoryImageByItemLabel(inventory)[label.trim()] ?? "";
  }
  return resolveClothingProductImage(
    product,
    catalogueImageMap(catalogue),
    inventoryImageByItemLabel(inventory)
  );
}

export function imageForColour(
  images: MerchCatalogueImageAsset[],
  colour: string,
  fallback = ""
): string {
  const wanted = colour.trim().toLowerCase();
  if (wanted) {
    const match = images.find(
      (img) => img.colour?.trim().toLowerCase() === wanted && img.url?.trim()
    );
    if (match?.url) return match.url.trim();
  }
  const first = images.find((img) => img.url?.trim());
  return first?.url?.trim() || fallback;
}

export function clothingProductsWithImages(
  catalogue: MerchCatalogueImage[],
  inventory: MerchInventoryItem[],
  options?: { includeHidden?: boolean }
): ShopClothingProduct[] {
  const byId = catalogueImageMap(catalogue);
  const byLabel = inventoryImageByItemLabel(inventory);
  const rows = catalogueByProductId(catalogue);
  return resolvedClothingProducts(catalogue, options).map((p) => {
    const row = rows[p.id];
    const gallery = normalizeGallery(row);
    const inventoryUrl = byLabel[p.label]?.trim() || "";
    const primary =
      resolveClothingProductImage(p, byId, byLabel) ||
      imageForColour(gallery, p.defaultColour, inventoryUrl);
    const colours = p.colours.length ? p.colours : ["Navy"];
    const colourSwatches = swatchesFromColourNames(
      colours,
      row?.colour_swatches
    );
    const sizes = (row?.sizes?.length
      ? row.sizes
      : p.sizes?.length
        ? [...p.sizes]
        : [...CLOTHING_SIZES]
    ).map((s) => String(s));
    const images =
      gallery.length > 0
        ? gallery
        : primary
          ? [{ url: primary, sort: 0 }]
          : [];
    const unitCost =
      typeof row?.unit_cost === "number" && Number.isFinite(row.unit_cost)
        ? row.unit_cost
        : null;
    return {
      ...p,
      image_url: primary,
      images,
      colourSwatches,
      sizes,
      description: p.description || row?.description?.trim() || undefined,
      supplier_url:
        p.supplier_url ||
        row?.supplier_url?.trim() ||
        p.links?.male ||
        p.links?.female ||
        undefined,
      unit_cost: unitCost,
      hidden: Boolean(row?.hidden),
      custom: row ? isCustomCatalogueRow(row) : false,
    };
  });
}

/** Strip admin-only cost fields before sending catalogue to non-admins / public. */
export function withoutUnitCost<T extends { unit_cost?: number | null }>(
  product: T
): Omit<T, "unit_cost"> {
  const rest = { ...product };
  delete rest.unit_cost;
  return rest;
}

/** Stable slug for a new custom catalogue product. */
export function slugifyProductId(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return base || `product_${Date.now().toString(36)}`;
}
