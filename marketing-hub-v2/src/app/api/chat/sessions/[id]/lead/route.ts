import { requireChatSiteKey } from "@/lib/chat/auth";
import { chatError, chatJson, chatOptions } from "@/lib/chat/http";
import {
  addChatMessage,
  closeAbandonedChatSessions,
  getChatSession,
  updateChatSession,
} from "@/lib/chat/data";
import { bridgeChatSessionToEnquiry } from "@/lib/chat/lead";
import { rateLimitPublic } from "@/lib/security/rate-limit";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export async function OPTIONS(request: Request) {
  return chatOptions(request);
}

type Ctx = { params: { id: string } };

/** Public: capture lead contact → web_enquiries. */
export async function POST(request: Request, ctx: Ctx) {
  const limited = rateLimitPublic(request, "chat-lead", 20);
  if (!limited.ok) return limited.response;
  if (!requireChatSiteKey(request)) {
    return chatError(request, "Unauthorized", 401);
  }
  if (!hasServiceRoleKey()) {
    return chatError(request, "Chat is not configured", 503);
  }

  const { id } = ctx.params;
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    company?: string;
    message?: string;
    visitor_location?: string;
  } | null;

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return chatError(request, "A valid business email is required");
  }

  try {
    const session = await getChatSession(id);
    if (!session) return chatError(request, "Not found", 404);

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const company =
      typeof body?.company === "string" ? body.company.trim() : "";
    const fromMessage =
      typeof body?.message === "string"
        ? body.message.match(
            /Where are you based\?\s*\(country or city\):\s*(.+)/i
          )
        : null;
    const location = (
      (typeof body?.visitor_location === "string"
        ? body.visitor_location
        : "") ||
      (fromMessage?.[1] ?? "") ||
      session.visitor_location
    )
      .trim()
      .slice(0, 200);

    await updateChatSession(id, {
      visitor_name: name || session.visitor_name,
      visitor_email: email,
      visitor_company: company || session.visitor_company,
      ...(location ? { visitor_location: location } : {}),
    });

    const refreshed = (await getChatSession(id))!;
    const { enquiryId, submissionId } = await bridgeChatSessionToEnquiry(
      refreshed,
      {
        name,
        email,
        company,
        message: body?.message,
      }
    );

    // Avoid duplicate open threads when the visitor refreshed / reopened chat.
    try {
      await closeAbandonedChatSessions({
        keepSessionId: id,
        visitorEmail: email,
      });
    } catch (err) {
      console.warn("[chat-lead] closeAbandonedChatSessions", err);
    }

    const msg = await addChatMessage({
      session_id: id,
      role: "assistant",
      body: `Thank you. We have noted ${email} and will follow up.`,
    });

    return chatJson(request, {
      ok: true,
      enquiry_id: enquiryId,
      submission_id: submissionId,
      message: msg,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lead failed";
    return chatError(request, message, 500);
  }
}
