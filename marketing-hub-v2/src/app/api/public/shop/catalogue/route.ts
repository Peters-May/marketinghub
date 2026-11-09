import { jsonOk } from "@/lib/api";
import { listMerchCatalogue, listMerchInventory } from "@/lib/data/repos";
import { clothingProductsWithImages } from "@/lib/merch/product-images";

/** Public catalogue — visible products only, no auth. */
export async function GET() {
  const [catalogue, inventory] = await Promise.all([
    listMerchCatalogue(),
    listMerchInventory(),
  ]);
  const products = clothingProductsWithImages(catalogue, inventory, {
    includeHidden: false,
  }).map((p) => ({
    id: p.id,
    label: p.label,
    brand: p.brand,
    material: p.material,
    description: p.description,
    colours: p.colours,
    defaultColour: p.defaultColour,
    colourSwatches: p.colourSwatches,
    sizes: p.sizes,
    image_url: p.image_url,
    images: p.images,
    supplier_url: p.supplier_url,
  }));
  return jsonOk({ products });
}
