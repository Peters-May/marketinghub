import type { MediaListItem } from "@/lib/supabase/media-list";

export type ShareAction = {
  id: string;
  url: string;
  name: string;
  itemName: string;
  kind: "file" | "link";
};

export type ShareHeroImage = {
  id: string;
  url: string;
  name: string;
  itemName: string;
};

export type SharePresentation = {
  /** Attached non-image files ready to download. */
  files: ShareAction[];
  /** External / document links. */
  links: ShareAction[];
  /** Preview / cover screenshots that dress the summary page (not downloads). */
  heroImages: ShareHeroImage[];
  /** Standalone images that are the shared content (photo galleries). */
  galleryImages: ShareHeroImage[];
};

export function isShareImageFile(file: {
  type?: string;
  name?: string;
  url?: string;
}): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  const name = (file.name || file.url || "").toLowerCase();
  return /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|$)/i.test(name);
}

function linkLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

/**
 * Classify shared media into downloadable files/links vs decorative preview images.
 * Preview screenshots ride along with a file or link; standalone images stay as gallery content.
 */
export function classifySharePresentation(
  items: MediaListItem[]
): SharePresentation {
  const files: ShareAction[] = [];
  const links: ShareAction[] = [];
  const heroImages: ShareHeroImage[] = [];
  const galleryImages: ShareHeroImage[] = [];

  for (const item of items) {
    const itemName = item.display_name || item.public_title || item.name;
    const images = item.files.filter((file) => file.url && isShareImageFile(file));
    const docs = item.files.filter((file) => file.url && !isShareImageFile(file));
    const link = item.document_link?.trim() || "";
    const hasCompanion = docs.length > 0 || Boolean(link);

    for (const file of docs) {
      files.push({
        id: `${item.id}__${file.url}`,
        url: file.url,
        name: file.name || itemName,
        itemName,
        kind: "file",
      });
    }

    if (link) {
      links.push({
        id: `${item.id}__link`,
        url: link,
        name: linkLabel(link),
        itemName,
        kind: "link",
      });
    }

    for (const file of images) {
      const image: ShareHeroImage = {
        id: `${item.id}__${file.url}`,
        url: file.url,
        name: file.name || "Image",
        itemName,
      };
      if (hasCompanion) {
        heroImages.push(image);
      } else {
        galleryImages.push(image);
      }
    }

    if (
      hasCompanion &&
      item.cover_url &&
      isShareImageFile({ url: item.cover_url }) &&
      !images.some((file) => file.url === item.cover_url)
    ) {
      heroImages.push({
        id: `${item.id}__cover`,
        url: item.cover_url,
        name: "Preview",
        itemName,
      });
    }
  }

  return { files, links, heroImages, galleryImages };
}

/** Single attached file (or single standalone image) with no other options → download immediately. */
export function shouldDirectDownloadShare(
  presentation: SharePresentation
): ShareAction | null {
  if (presentation.links.length > 0) return null;

  if (presentation.files.length === 1 && presentation.galleryImages.length === 0) {
    return presentation.files[0] ?? null;
  }

  if (presentation.files.length === 0 && presentation.galleryImages.length === 1) {
    const image = presentation.galleryImages[0];
    if (!image) return null;
    return {
      id: image.id,
      url: image.url,
      name: image.name,
      itemName: image.itemName,
      kind: "file",
    };
  }

  return null;
}

/** Only one external link and no preview imagery → open the link directly. */
export function shouldDirectOpenShareLink(
  presentation: SharePresentation
): ShareAction | null {
  if (presentation.files.length > 0) return null;
  if (presentation.galleryImages.length > 0) return null;
  if (presentation.heroImages.length > 0) return null;
  if (presentation.links.length !== 1) return null;
  return presentation.links[0] ?? null;
}

export function mediaDownloadPath(input: {
  url: string;
  filename: string;
  token: string;
}): string {
  const params = new URLSearchParams({
    url: input.url,
    filename: input.filename,
    token: input.token,
  });
  return `/api/media/download?${params.toString()}`;
}
