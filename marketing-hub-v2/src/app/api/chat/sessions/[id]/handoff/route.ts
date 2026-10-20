import { requireChatSiteKey } from "@/lib/chat/auth";
import { chatError, chatJson, chatOptions } from "@/lib/chat/http";
import {
  addChatMessage,
  getChatSession,
  getChatSettings,
  updateChatSession,
} from "@/lib/chat/data";
import { bridgeChatSessionToEnquiry } from "@/lib/chat/lead";
import { notifyChatStaff } from "@/lib/chat/notify";
import { rateLimitPublic } from "@/lib/security/rate-limit";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export async function OPTIONS(request: Request) {
  return chatOptions(request);
}

type Ctx = { params: { id: string } };

/** Public: Speak to the team. */
export async function POST(request: Request, ctx: Ctx) {
  const limited = rateLimitPublic(request, "chat-handoff", 20);
  if (!limited.ok) return limited.response;
  if (!requireChatSiteKey(request)) {
    return chatError(request, "Unauthorized", 401);
  }
  if (!hasServiceRoleKey()) {
    return chatError(request, "Chat is not configured", 503);
  }

  const { id } = ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    company?: string;
    message?: string;
  };

  try {
    const session = await getChatSession(id);
    if (!session) return chatError(request, "Not found", 404);

    const settings = await getChatSettings();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const company =
      typeof body.company === "string" ? body.company.trim() : "";

    await updateChatSession(id, {
      status: "waiting",
      visitor_name: name || session.visitor_name,
      visitor_email: email || session.visitor_email,
      visitor_company: company || session.visitor_company,
    });

    const note = [
      "A visitor asked to speak to the team.",
      settings.office_hours_note,
    ]
      .filter(Boolean)
      .join(" ");

    const systemMsg = await addChatMessage({
      session_id: id,
      role: "system",
      body: note,
    });

    const assistantMsg = await addChatMessage({
      session_id: id,
      role: "assistant",
      body: email
        ? `Thank you. We have your details and will follow up at ${email}. ${settings.office_hours_note}`
        : `Thank you. A colleague will pick this up shortly. ${settings.office_hours_note} You can leave a business email so we can reach you if you close this window.`,
    });

    const updated = await getChatSession(id);
    if (updated && email) {
      await bridgeChatSessionToEnquiry(updated, {
        name,
        email,
        company,
        message: body.message,
        notify: false,
      });
    }

    void notifyChatStaff({
      kind: "waiting",
      sessionId: id,
      visitorEmail: email || undefined,
    });

    return chatJson(request, {
      ok: true,
      session: updated,
      messages: [systemMsg, assistantMsg],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handoff failed";
    return chatError(request, message, 500);
  }
}
