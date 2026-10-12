import path from "path";
import { getDataDir } from "@/lib/store/paths";

/** Email images stay small enough to load in an inbox. */
export const EMAIL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export function emailGalleryDir(): string {
  return path.join(getDataDir(), "uploads", "email");
}

export function emailImageExtension(filename: string, mime: string): string | null {
  const fromMime = EXT_BY_MIME[mime];
  if (fromMime) return fromMime;
  const ext = path.extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ? ext : null;
}

export function emailImageMime(filename: string): string | null {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? null;
}

export function safeGalleryFilename(name: string): string | null {
  const filename = path.basename(name);
  if (!filename || filename !== name) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(filename)) return null;
  if (!emailImageMime(filename)) return null;
  return filename;
}

export function galleryFilePath(filename: string): string | null {
  const safe = safeGalleryFilename(filename);
  if (!safe) return null;
  const root = path.resolve(emailGalleryDir());
  const filePath = path.resolve(root, safe);
  if (!filePath.startsWith(root + path.sep)) return null;
  return filePath;
}
