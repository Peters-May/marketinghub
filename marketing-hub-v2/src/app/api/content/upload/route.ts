import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { getDataDir } from "@/lib/store/paths";
import {
  isAllowedUpload,
  maxUploadBytesForRole,
  uploadContentType,
} from "@/lib/upload/allowed-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_ROOT = path.join(getDataDir(), "uploads", "content");

function safeName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
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
    const objectPath = `hub-content/${Date.now()}-${filename}`;
    const { error } = await supabase.storage
      .from("attachments")
      .upload(objectPath, bytes, { contentType, upsert: false });
    if (error) return null;
    const { data } = supabase.storage
      .from("attachments")
      .getPublicUrl(objectPath);
    return data.publicUrl || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error) return error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Expected multipart form data", 400);
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return jsonError("No file uploaded", 400);
  }

  const blob = file as File;
  if (blob.size <= 0) return jsonError("Empty file", 400);
  const maxBytes = maxUploadBytesForRole(user.role);
  if (blob.size > maxBytes) {
    return jsonError(
      `File too large (max ${Math.round(maxBytes / (1024 * 1024))}MB): ${blob.name || "file"}`,
      413
    );
  }

  const type = blob.type || "application/octet-stream";
  const nameOk = z.string().min(1).max(200).safeParse(blob.name || "asset");
  if (!nameOk.success) return jsonError("Invalid file name", 400);

  if (!isAllowedUpload(blob.name, type)) {
    return jsonError("File type not allowed", 400);
  }

  const bytes = Buffer.from(await blob.arrayBuffer());
  const filename = `${Date.now()}-${safeName(blob.name || "asset")}`;

  const remoteUrl = await uploadToSupabase(
    bytes,
    filename,
    uploadContentType(blob.name, type)
  );
  if (remoteUrl) {
    return jsonOk({ url: remoteUrl, name: blob.name, storage: "supabase" });
  }

  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_ROOT, filename), bytes);
  const url = `/api/uploads/content/${encodeURIComponent(filename)}`;
  return jsonOk({ url, name: blob.name, storage: "local" }, { status: 201 });
}
