export type AssetImageChoice = {
  id: string;
  name: string;
  url: string;
};

export type AssetImageSource = {
  id?: string;
  name?: string;
  display_name?: string;
  category?: string;
  document_url?: string;
  document_link?: string;
  cover_url?: string | null;
  files?: { url?: string; name?: string; type?: string }[];
};

const IMAGE_CATEGORIES = new Set(["gallery", "logos", "images", "design assets"]);

function isImageCategory(category: string | undefined) {
  return IMAGE_CATEGORIES.has((category ?? "").trim().toLowerCase());
}

function isRaster(name: string, type: string) {
  if (type === "image/svg+xml") return false;
  if (type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

function isDirectRaster(url: string) {
  const path = url.split("?")[0] ?? "";
  return /\.(png|jpe?g|gif|webp)$/i.test(path);
}

function driveThumb(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (!parsed.hostname.toLowerCase().includes("google.com")) return null;
    const pathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const id = pathMatch?.[1] || parsed.searchParams.get("id");
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w800` : null;
  } catch {
    return null;
  }
}

/** Raster images from the media library, including Drive-hosted gallery files. */
export function imagesFromMediaItems(
  items: AssetImageSource[],
  limit = 80
): AssetImageChoice[] {
  const images: AssetImageChoice[] = [];
  const seen = new Set<string>();
  const add = (id: string, name: string, url: string | null | undefined) => {
    const next = url?.trim() || "";
    if (!next || seen.has(next) || images.length >= limit) return;
    seen.add(next);
    images.push({ id, name: name || "Image", url: next });
  };

  items.forEach((item, index) => {
    const label = item.display_name?.trim() || item.name?.trim() || "Image";
    const itemId = item.id || `asset-${index}`;
    const allowDriveLink = isImageCategory(item.category);

    for (const file of item.files ?? []) {
      const name = file.name || label;
      const raw = file.url?.trim() || "";
      if (!raw || !isRaster(name, file.type || "")) continue;
      add(`${itemId}-${raw}`, name, driveThumb(raw) || raw);
    }

    for (const candidate of [item.document_link, item.document_url, item.cover_url]) {
      const raw = candidate?.trim() || "";
      if (!raw) continue;
      const thumb = driveThumb(raw);
      if (thumb && (allowDriveLink || isDirectRaster(raw) || isRaster(label, ""))) {
        add(`${itemId}-drive-${raw}`, label, thumb);
      }
    }

    const cover = item.cover_url?.trim() || "";
    if (cover && isDirectRaster(cover)) {
      add(`${itemId}-cover`, label, cover);
    }
  });

  return images;
}
