import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import { addEmailGalleryImage, listEmailGallery } from "@/lib/data/repos";
import {
  EMAIL_IMAGE_MAX_BYTES,
  emailGalleryDir,
  emailImageExtension,
} from "@/lib/email/gallery";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeStem(name: string) {
  const stem = name.replace(/\.[^.]+$/, "");
  const cleaned = stem
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return cleaned || "image";
}

function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return "http://localhost:3001";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
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
      .upload(objectPath, bytes, { contentType, upsert: false });
    if (error) return null;
    const { data } = supabase.storage.from("attachments").getPublicUrl(objectPath);
    return data.publicUrl || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const images = await listEmailGallery();
  return jsonOk({ images });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Expected an image upload", 400);
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return jsonError("Choose an image to upload", 400);
  }

  const blob = file as File;
  if (blob.size <= 0) return jsonError("That image is empty", 400);
  if (blob.size > EMAIL_IMAGE_MAX_BYTES) {
    return jsonError("Image is too large (max 5MB)", 413);
  }

  const ext = emailImageExtension(blob.name || "image", blob.type || "");
  if (!ext) {
    return jsonError("Use a PNG, JPEG, GIF, or WebP image", 400);
  }

  const bytes = Buffer.from(await blob.arrayBuffer());
  const filename = `${Date.now()}-${safeStem(blob.name || "image")}${ext}`;
  const contentType = blob.type && blob.type.startsWith("image/") ? blob.type : `image/${ext === ".jpg" ? "jpeg" : ext.slice(1)}`;

  const remoteUrl = await uploadToSupabase(bytes, filename, contentType);
  let url = remoteUrl;
  if (!url) {
    const dir = emailGalleryDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), bytes);
    url = `${requestOrigin(request)}/api/email/gallery/file/${encodeURIComponent(filename)}`;
  }

  const item = await addEmailGalleryImage({
    name: (blob.name || "Image").slice(0, 200),
    url,
  });
  return jsonOk({ item }, { status: 201 });
}
