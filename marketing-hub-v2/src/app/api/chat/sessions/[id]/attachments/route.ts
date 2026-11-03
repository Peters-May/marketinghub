import { requireChatSiteKey } from "@/lib/chat/auth";
import { chatError, chatJson, chatOptions } from "@/lib/chat/http";
import { getChatSession, getChatSettings } from "@/lib/chat/data";
import { rateLimitPublic } from "@/lib/security/rate-limit";
import { createServiceClient, hasServiceRoleKey } from "@/lib/supabase/admin";

export async function OPTIONS(request: Request) {
  return chatOptions(request);
}

type Ctx = { params: { id: string } };

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_EXT = /\.(jpe?g|png|webp|pdf)$/i;

function safeName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function resolveType(name: string, type: string): string | null {
  const t = (type || "").toLowerCase();
  if (ALLOWED.has(t)) return t;
  const lower = name.toLowerCase();
  if (/\.jpe?g$/i.test(lower)) return "image/jpeg";
  if (/\.png$/i.test(lower)) return "image/png";
  if (/\.webp$/i.test(lower)) return "image/webp";
  if (/\.pdf$/i.test(lower)) return "application/pdf";
  return null;
}

/** Public: visitor uploads a yacht/cargo spec image or PDF. */
export async function POST(request: Request, ctx: Ctx) {
  const limited = rateLimitPublic(request, "chat-attachments-post", 30);
  if (!limited.ok) return limited.response;
  if (!requireChatSiteKey(request)) {
    return chatError(request, "Unauthorized", 401);
  }
  if (!hasServiceRoleKey()) {
    return chatError(request, "Chat is not configured", 503);
  }

  const settings = await getChatSettings();
  if (!settings.deployed) {
    return chatError(request, "Website chat is not deployed", 503);
  }

  const { id } = ctx.params;
  try {
    const session = await getChatSession(id);
    if (!session) return chatError(request, "Not found", 404);
    if (session.status === "closed") {
      return chatError(request, "This conversation is closed", 409);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return chatError(request, "Expected multipart form data", 400);
    }

    const file = form.get("file");
    if (!file || typeof file === "string") {
      return chatError(request, "No file uploaded", 400);
    }
    const blob = file as File;
    if (blob.size <= 0) return chatError(request, "Empty file", 400);
    if (blob.size > MAX_BYTES) {
      return chatError(request, "File too large (max 10MB)", 413);
    }

    const originalName = (blob.name || "file").slice(0, 200);
    if (!ALLOWED_EXT.test(originalName) && !ALLOWED.has(blob.type)) {
      return chatError(
        request,
        "Only JPEG, PNG, WebP or PDF files are allowed",
        400
      );
    }
    const contentType = resolveType(originalName, blob.type);
    if (!contentType) {
      return chatError(
        request,
        "Only JPEG, PNG, WebP or PDF files are allowed",
        400
      );
    }

    const bytes = Buffer.from(await blob.arrayBuffer());
    const filename = `${Date.now()}-${safeName(originalName)}`;
    const objectPath = `chat/${id}/${filename}`;
    const supabase = createServiceClient();
    const { error } = await supabase.storage
      .from("attachments")
      .upload(objectPath, bytes, { contentType, upsert: false });
    if (error) {
      return chatError(request, error.message || "Upload failed", 500);
    }
    const { data } = supabase.storage
      .from("attachments")
      .getPublicUrl(objectPath);
    const url = data.publicUrl || "";
    if (!url) {
      return chatError(request, "Upload failed", 500);
    }

    return chatJson(request, {
      ok: true,
      attachment: {
        url,
        name: originalName,
        content_type: contentType,
        size: blob.size,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return chatError(request, message, 500);
  }
}
