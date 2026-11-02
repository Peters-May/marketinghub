import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { EMAIL_IMAGE_MAX_BYTES, emailGalleryDir } from "@/lib/email/gallery";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

const DATA_IMAGE =
  /data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\r\n]+/gi;

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function appOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3001";
}

/** Outlook does not show images stored inside the message. Publish them and swap the src. */
export async function hostInlineEmailImages(
  html: string,
  upload: (dataUri: string) => Promise<string | null> = uploadInlineImage
): Promise<string> {
  const found = html.match(DATA_IMAGE);
  if (!found) return html;
  const unique = [...new Set(found.map((value) => value.replace(/\s+/g, "")))];
  let next = html;
  for (const dataUri of unique) {
    const url = await upload(dataUri);
    if (!url) continue;
    next = next.split(dataUri).join(url);
  }
  return next;
}

async function uploadInlineImage(dataUri: string): Promise<string | null> {
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,([a-z0-9+/=]+)$/i.exec(dataUri);
  if (!match) return null;
  const kind = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  const mime = MIME[kind];
  if (!mime) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > EMAIL_IMAGE_MAX_BYTES) return null;
  const ext = kind === "jpeg" ? "jpg" : kind;
  const filename = `${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}.${ext}`;
  const remote = await uploadToSupabase(bytes, filename, mime);
  if (remote) return remote;
  try {
    const dir = emailGalleryDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), bytes);
    return `${appOrigin()}/api/email/gallery/file/${encodeURIComponent(filename)}`;
  } catch {
    return null;
  }
}

async function uploadToSupabase(
  bytes: Buffer,
  filename: string,
  contentType: string
): Promise<string | null> {
  if (!hasServiceRoleKey()) return null;
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const supabase = createServiceClient();
    const objectPath = `email-gallery/${filename}`;
    const { error } = await supabase.storage
      .from("attachments")
      .upload(objectPath, bytes, { contentType, upsert: true });
    if (error && !/already exists/i.test(error.message)) return null;
    const { data } = supabase.storage.from("attachments").getPublicUrl(objectPath);
    return data.publicUrl || null;
  } catch {
    return null;
  }
}
