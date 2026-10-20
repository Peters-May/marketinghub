import { requireChatSiteKey } from "@/lib/chat/auth";
import { chatError, chatJson, chatOptions } from "@/lib/chat/http";
import { getChatSession, updateChatSession } from "@/lib/chat/data";
import { syncClosedChatSessionToPortal } from "@/lib/chat/lead";
import { rateLimitPublic } from "@/lib/security/rate-limit";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export async function OPTIONS(request: Request) {
  return chatOptions(request);
}

type Ctx = { params: { id: string } };

/** Public: visitor closes the widget — mark session closed and sync Portal when email exists. */
export async function POST(request: Request, ctx: Ctx) {
  const limited = rateLimitPublic(request, "chat-close", 30);
  if (!limited.ok) return limited.response;
  if (!requireChatSiteKey(request)) {
    return chatError(request, "Unauthorized", 401);
  }
  if (!hasServiceRoleKey()) {
    return chatError(request, "Chat is not configured", 503);
  }

  const { id } = ctx.params;
  try {
    const session = await getChatSession(id);
    if (!session) return chatError(request, "Not found", 404);

    const updated =
      session.status === "closed"
        ? session
        : await updateChatSession(id, { status: "closed" });

    const portal_sync = await syncClosedChatSessionToPortal(id);

    return chatJson(request, {
      ok: true,
      session: updated,
      portal_sync,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Close failed";
    return chatError(request, message, 500);
  }
}
