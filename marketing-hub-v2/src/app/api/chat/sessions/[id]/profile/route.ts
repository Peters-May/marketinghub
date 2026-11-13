import { requireChatSiteKey } from "@/lib/chat/auth";
import { chatError, chatJson, chatOptions } from "@/lib/chat/http";
import { getChatSession, updateChatSession } from "@/lib/chat/data";
import { rateLimitPublic } from "@/lib/security/rate-limit";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export async function OPTIONS(request: Request) {
  return chatOptions(request);
}

type Ctx = { params: { id: string } };

/** Public: update light visitor profile fields (e.g. early location). */
export async function POST(request: Request, ctx: Ctx) {
  const limited = rateLimitPublic(request, "chat-profile", 40);
  if (!limited.ok) return limited.response;
  if (!requireChatSiteKey(request)) {
    return chatError(request, "Unauthorized", 401);
  }
  if (!hasServiceRoleKey()) {
    return chatError(request, "Chat is not configured", 503);
  }

  const { id } = ctx.params;
  const body = (await request.json().catch(() => null)) as {
    visitor_location?: string;
    name?: string;
    email?: string;
    company?: string;
  } | null;

  try {
    const session = await getChatSession(id);
    if (!session) return chatError(request, "Not found", 404);
    if (session.status === "closed") {
      return chatError(request, "This conversation is closed", 409);
    }

    const location =
      typeof body?.visitor_location === "string"
        ? body.visitor_location.trim().slice(0, 200)
        : "";
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    const email =
      typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
    const company =
      typeof body?.company === "string" ? body.company.trim().slice(0, 200) : "";

    if (!location && !name && !email && !company) {
      return chatError(request, "Nothing to update");
    }

    const updated = await updateChatSession(id, {
      ...(location ? { visitor_location: location } : {}),
      ...(name ? { visitor_name: name } : {}),
      ...(email ? { visitor_email: email } : {}),
      ...(company ? { visitor_company: company } : {}),
    });

    return chatJson(request, { ok: true, session: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return chatError(request, message, 500);
  }
}
