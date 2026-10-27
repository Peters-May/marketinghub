import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import {
  isAllowedUpload,
  maxUploadBytesForRole,
} from "@/lib/upload/allowed-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

/**
 * Issue a short-lived Supabase signed upload URL.
 * Clients PUT the file directly to Storage — avoids Next.js ~1MB Route Handler body limit (413).
 */
export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error) return error;

  if (!hasServiceRoleKey()) {
    return jsonError(
      "Direct upload requires SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local.",
      503
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = z
    .object({
      action: z.literal("confirm").optional(),
      path: z.string().max(300).optional(),
      name: z.string().min(1).max(200).optional(),
      type: z.string().max(120).optional(),
      size: z.number().int().positive().optional(),
    })
    .safeParse(body);

  if (!parsed.success) return jsonError("Invalid upload request", 400);

  const maxBytes = maxUploadBytesForRole(user.role);

  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const supabase = createServiceClient();

    if (parsed.data.action === "confirm") {
      const path = parsed.data.path || "";
      if (!path.startsWith("hub-pending/") || path.includes("..")) {
        return jsonError("Invalid upload", 400);
      }
      let bytes = await storedObjectBytes(supabase, path);
      if (bytes == null) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        bytes = await storedObjectBytes(supabase, path);
      }
      if (bytes == null || bytes <= 0 || bytes > maxBytes) {
        await supabase.storage.from("attachments").remove([path]);
        return jsonError(
          `File too large (max ${Math.round(maxBytes / (1024 * 1024))}MB).`,
          413
        );
      }
      const finalPath = path.replace(/^hub-pending\//, "hub-content/");
      const { error: copyError } = await supabase.storage
        .from("attachments")
        .copy(path, finalPath);
      await supabase.storage.from("attachments").remove([path]);
      if (copyError) {
        console.error("[upload-url] copy failed", copyError);
        return jsonError("Could not store the file.", 500);
      }
      const { data: pub } = supabase.storage
        .from("attachments")
        .getPublicUrl(finalPath);
      return jsonOk({ publicUrl: pub.publicUrl, path: finalPath });
    }

    const name = parsed.data.name || "";
    const type = parsed.data.type || "application/octet-stream";
    const size = parsed.data.size;
    if (!name || typeof size !== "number") {
      return jsonError("Invalid upload request", 400);
    }
    if (size > maxBytes) {
      return jsonError(
        `File too large (max ${Math.round(maxBytes / (1024 * 1024))}MB): ${name}`,
        413
      );
    }
    if (!isAllowedUpload(name, type)) {
      return jsonError("File type not allowed", 400);
    }

    const objectPath = `hub-pending/${Date.now()}-${safeName(name)}`;
    const { data, error: signError } = await supabase.storage
      .from("attachments")
      .createSignedUploadUrl(objectPath);

    if (signError || !data?.signedUrl) {
      console.error("[upload-url] sign failed", signError);
      return jsonError("Could not start the upload.", 500);
    }

    return jsonOk({
      mode: "signed" as const,
      path: data.path || objectPath,
      token: data.token,
      signedUrl: data.signedUrl,
      name,
    });
  } catch (e) {
    console.error("[upload-url] failed", e);
    return jsonError("Could not start the upload.", 500);
  }
}

async function storedObjectBytes(
  supabase: {
    storage: {
      from: (bucket: string) => {
        list: (
          folder: string,
          options: { search: string; limit: number }
        ) => PromiseLike<{
          data: { name: string; metadata?: { size?: number } | null }[] | null;
          error: unknown;
        }>;
      };
    };
  },
  objectPath: string
): Promise<number | null> {
  const slash = objectPath.lastIndexOf("/");
  const folder = slash >= 0 ? objectPath.slice(0, slash) : "";
  const file = slash >= 0 ? objectPath.slice(slash + 1) : objectPath;
  const { data, error } = await supabase.storage.from("attachments").list(folder, {
    search: file,
    limit: 20,
  });
  if (error || !data) return null;
  const match = data.find((row) => row.name === file);
  const size = match?.metadata?.size;
  return typeof size === "number" ? size : null;
}
