import { rateLimitPublic } from "@/lib/security/rate-limit";
import { requireChatSiteKey } from "@/lib/chat/auth";
import { chatError, chatJson, chatOptions } from "@/lib/chat/http";
import { createChatSession, getChatSettings } from "@/lib/chat/data";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export async function OPTIONS(request: Request) {
  return chatOptions(request);
}

/** Public: create a chat session (WordPress widget). */
export async function POST(request: Request) {
  const limited = rateLimitPublic(request, "chat-sessions", 40);
  if (!limited.ok) return limited.response;

  if (!requireChatSiteKey(request)) {
    return chatError(request, "Unauthorized", 401);
  }
  if (!hasServiceRoleKey()) {
    return chatError(request, "Chat is not configured", 503);
  }

  const settings = await getChatSettings();
  if (!settings.deployed) {
    return chatError(
      request,
      "Website chat is not deployed yet. Enable Deploy in Marketing Hub.",
      503
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  try {
    const utm =
      body?.utm && typeof body.utm === "object" && !Array.isArray(body.utm)
        ? (body.utm as Record<string, unknown>)
        : {};
    const { session, welcome } = await createChatSession({
      page_url: typeof body?.page_url === "string" ? body.page_url : "",
      page_title: typeof body?.page_title === "string" ? body.page_title : "",
      referrer: typeof body?.referrer === "string" ? body.referrer : "",
      utm,
      is_test: body?.is_test === true,
    });
    return chatJson(request, {
      session,
      message: welcome,
      office_hours_note: settings.office_hours_note,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start chat";
    return chatError(request, message, 500);
  }
}
