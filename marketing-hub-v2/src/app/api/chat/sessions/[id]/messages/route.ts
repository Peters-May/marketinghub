import { applyChatCors, requireChatSiteKey } from "@/lib/chat/auth";
import { chatError, chatJson, chatOptions } from "@/lib/chat/http";
import {
  addChatMessage,
  getChatSession,
  getChatSettings,
  listChatMessages,
  updateChatSession,
} from "@/lib/chat/data";
import { streamAssistantReply } from "@/lib/chat/rag";
import { notifyChatStaff } from "@/lib/chat/notify";
import { rateLimitPublic } from "@/lib/security/rate-limit";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export async function OPTIONS(request: Request) {
  return chatOptions(request);
}

type Ctx = { params: { id: string } };

/** Public: poll new messages (staff replies). */
export async function GET(request: Request, ctx: Ctx) {
  const limited = rateLimitPublic(request, "chat-messages-get", 120);
  if (!limited.ok) return limited.response;
  if (!requireChatSiteKey(request)) {
    return chatError(request, "Unauthorized", 401);
  }
  if (!hasServiceRoleKey()) {
    return chatError(request, "Chat is not configured", 503);
  }

  const { id } = ctx.params;
  const url = new URL(request.url);
  const after = url.searchParams.get("after")?.trim() || undefined;

  try {
    const session = await getChatSession(id);
    if (!session) return chatError(request, "Not found", 404);
    const messages = await listChatMessages(id, { after });
    return chatJson(request, { session, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return chatError(request, message, 500);
  }
}

/** Public: visitor sends a message; streams AI reply when in ai mode. */
export async function POST(request: Request, ctx: Ctx) {
  const limited = rateLimitPublic(request, "chat-messages-post", 40);
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
  const body = (await request.json().catch(() => null)) as {
    body?: string;
    stream?: boolean;
  } | null;
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text || text.length > 4000) {
    return chatError(request, "Message required (max 4000 characters)");
  }

  try {
    const session = await getChatSession(id);
    if (!session) return chatError(request, "Not found", 404);
    if (session.status === "closed") {
      return chatError(request, "This conversation is closed", 409);
    }

    await addChatMessage({
      session_id: id,
      role: "visitor",
      body: text,
    });

    // Human / waiting: store only; staff replies from Hub.
    if (session.status === "waiting" || session.status === "human") {
      return chatJson(request, {
        mode: "human",
        message:
          "Thanks — the team has your message and will reply here shortly.",
      });
    }

    const history = await listChatMessages(id);
    const useStream = body?.stream !== false;

    if (!useStream) {
      const { generateAssistantReply } = await import("@/lib/chat/rag");
      const reply = await generateAssistantReply({
        visitorMessage: text,
        history: history.slice(0, -1),
      });
      const saved = await addChatMessage({
        session_id: id,
        role: "assistant",
        body: reply.body,
        sources: reply.sources,
      });
      if (reply.forceHandoff) {
        await updateChatSession(id, { status: "waiting" });
        void notifyChatStaff({ kind: "waiting", sessionId: id });
      }
      return chatJson(request, {
        mode: "ai",
        message: saved,
        handoff: reply.forceHandoff,
      });
    }

    const streamed = await streamAssistantReply({
      visitorMessage: text,
      history: history.slice(0, -1),
    });

    const encoder = new TextEncoder();
    let full = "";
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of streamed.textStream) {
            full += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
          if (streamed.forceHandoff && !/team|email|follow/i.test(full)) {
            const extra =
              "\n\nFor a quote or personal help, use Speak to the team and leave your business email.";
            full += extra;
            controller.enqueue(encoder.encode(extra));
          }
          if (!full.trim()) {
            full =
              "I am not sure from our published information. Please speak to the team and we will follow up.";
            controller.enqueue(encoder.encode(full));
          }
          await addChatMessage({
            session_id: id,
            role: "assistant",
            body: full.trim(),
            sources: streamed.sources,
          });
          if (streamed.forceHandoff) {
            await updateChatSession(id, { status: "waiting" });
            void notifyChatStaff({ kind: "waiting", sessionId: id });
          }
          controller.close();
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Assistant failed";
          controller.enqueue(
            encoder.encode(
              `\n\nSorry — something went wrong (${msg}). Please speak to the team.`
            )
          );
          controller.close();
        }
      },
    });

    const res = new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Chat-Sources": encodeURIComponent(
          JSON.stringify(streamed.sources)
        ),
        "X-Chat-Handoff": streamed.forceHandoff ? "1" : "0",
      },
    });
    return applyChatCors(request, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return chatError(request, message, 500);
  }
}
