import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import { imagesFromMediaItems } from "@/lib/email/asset-images";
import { listMediaFromSupabase } from "@/lib/supabase/media-list";

export const dynamic = "force-dynamic";

const ASSET_CATEGORIES = ["Gallery", "Logos", "Images", "Design Assets"];

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    let images: ReturnType<typeof imagesFromMediaItems> = [];
    try {
      const scoped = await listMediaFromSupabase({
        scope: "all",
        includeAdmin: true,
        limit: 400,
        newestFirst: true,
        categories: ASSET_CATEGORIES,
      });
      images = imagesFromMediaItems(scoped.items);
    } catch {
      images = [];
    }

    if (images.length === 0) {
      const broad = await listMediaFromSupabase({
        scope: "all",
        includeAdmin: true,
        limit: 1000,
        newestFirst: true,
      });
      images = imagesFromMediaItems(broad.items);
    }

    return jsonOk({ images });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Could not load the asset gallery",
      500
    );
  }
}
