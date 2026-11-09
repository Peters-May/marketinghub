import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin, requireStaff } from "@/lib/api";
import {
  listMerchCatalogue,
  listMerchInventory,
  upsertMerchCatalogue,
  type MerchCataloguePatch,
} from "@/lib/data/repos";
import { clothingProductById } from "@/lib/merch/north-sails";
import {
  clothingProductsWithImages,
  slugifyProductId,
  withoutUnitCost,
} from "@/lib/merch/product-images";
import { swatchesFromColourNames } from "@/lib/merch/colour-swatches";
import { isMerchAdmin } from "@/lib/merch/access";
import type {
  MerchCatalogueColour,
  MerchCatalogueImage,
  MerchCatalogueImageAsset,
} from "@/lib/types";

function parseColourList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((c) => (typeof c === "string" ? c.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return undefined;
}

function parseColourSwatches(
  value: unknown
): MerchCatalogueColour[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const parsed = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as { name?: unknown; hex?: unknown };
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const hex = typeof row.hex === "string" ? row.hex.trim() : "";
      if (!name) return null;
      return { name, hex: hex || "#94A3B8" };
    })
    .filter((c): c is MerchCatalogueColour => Boolean(c));
  return parsed;
}

function parseImages(value: unknown): MerchCatalogueImageAsset[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const images: MerchCatalogueImageAsset[] = [];
  value.forEach((entry, i) => {
    if (typeof entry === "string") {
      const url = entry.trim();
      if (url) images.push({ url, sort: i });
      return;
    }
    if (!entry || typeof entry !== "object") return;
    const row = entry as { url?: unknown; colour?: unknown; sort?: unknown };
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url) return;
    const colour =
      typeof row.colour === "string" ? row.colour.trim() : "";
    images.push({
      url,
      ...(colour ? { colour } : {}),
      sort:
        typeof row.sort === "number" && Number.isFinite(row.sort)
          ? row.sort
          : i,
    });
  });
  return images;
}

function parseSizes(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
}

function parseUnitCost(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.round(n * 100) / 100;
}

function stripCatalogueCosts(
  catalogue: MerchCatalogueImage[]
): MerchCatalogueImage[] {
  return catalogue.map((row) => {
    const { unit_cost: _cost, ...rest } = row;
    return rest;
  });
}

export async function GET(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error) return error;
  const admin = isMerchAdmin(user);
  const includeHidden =
    request.nextUrl.searchParams.get("include_hidden") === "1";
  const [catalogue, inventory] = await Promise.all([
    listMerchCatalogue(),
    listMerchInventory(),
  ]);
  const products = clothingProductsWithImages(catalogue, inventory, {
    includeHidden: admin ? includeHidden : false,
  });
  return jsonOk({
    catalogue: admin ? catalogue : stripCatalogueCosts(catalogue),
    products: admin ? products : products.map(withoutUnitCost),
  });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await request.json();

  let productId =
    typeof body.product_id === "string" ? body.product_id.trim() : "";
  const label =
    typeof body.label === "string" ? body.label.trim() : undefined;
  const creating = body.create === true || !productId;

  if (creating) {
    if (!label) {
      return jsonError("Item name is required for a new product", 400);
    }
    const existing = await listMerchCatalogue();
    let candidate = slugifyProductId(label);
    if (
      clothingProductById(candidate) ||
      existing.some((row) => row.product_id === candidate)
    ) {
      candidate = `${candidate}_${Date.now().toString(36).slice(-4)}`;
    }
    productId = candidate;
  }

  if (!productId) {
    return jsonError("product_id is required", 400);
  }

  if (label !== undefined && !label) {
    return jsonError("Item name cannot be empty", 400);
  }

  const colourSwatches = parseColourSwatches(body.colour_swatches);
  const colourNames =
    colourSwatches?.map((c) => c.name) ?? parseColourList(body.colours);
  const swatches =
    colourSwatches ??
    (colourNames ? swatchesFromColourNames(colourNames) : undefined);

  const images = parseImages(body.images);
  const imageUrl =
    typeof body.image_url === "string" ? body.image_url : undefined;

  const patch: MerchCataloguePatch = {
    image_url: imageUrl,
    images,
    label,
    brand: typeof body.brand === "string" ? body.brand : undefined,
    material: typeof body.material === "string" ? body.material : undefined,
    description:
      typeof body.description === "string" ? body.description : undefined,
    colours: colourNames,
    colour_swatches: swatches,
    default_colour:
      typeof body.default_colour === "string"
        ? body.default_colour
        : undefined,
    sizes: parseSizes(body.sizes),
    supplier_url:
      typeof body.supplier_url === "string" ? body.supplier_url : undefined,
    unit_cost: parseUnitCost(body.unit_cost),
    hidden: typeof body.hidden === "boolean" ? body.hidden : undefined,
    custom: creating || body.custom === true ? true : undefined,
  };

  const item = await upsertMerchCatalogue(productId, patch);
  if (!item && creating) {
    return jsonError("Could not create clothing product", 400);
  }

  const [catalogue, inventory] = await Promise.all([
    listMerchCatalogue(),
    listMerchInventory(),
  ]);
  return jsonOk({
    item,
    catalogue,
    products: clothingProductsWithImages(catalogue, inventory, {
      includeHidden: true,
    }),
  });
}
