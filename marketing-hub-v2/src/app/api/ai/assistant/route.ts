import { NextRequest } from "next/server";
import {
  draftEmailAssist,
  draftSocialAssist,
  friendlyAiError,
  generateAssistantChat,
  isAssistantMode,
  rewriteAssist,
  summariseAssist,
  type AssistantAttachment,
  type AssistantChatMessage,
  type AssistantMode,
} from "@/lib/ai/assistant";
import {
  AI_NOT_CONFIGURED_MESSAGE,
  isHubAiConfigured,
} from "@/lib/ai/openai";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import { assistantReadContext } from "@/lib/ai/read-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseAttachments(raw: unknown): AssistantAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantAttachment[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    const mime = typeof rec.mime === "string" ? rec.mime.trim() : "";
    if (!name || !url || !mime) continue;
    if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) continue;
    out.push({
      name: name.slice(0, 200),
      url: url.slice(0, 2000),
      mime: mime.slice(0, 120),
    });
  }
  return out;
}

function parseMessages(raw: unknown): AssistantChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantChatMessage[] = [];
  for (const item of raw.slice(-20)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const role =
      rec.role === "assistant"
        ? "assistant"
        : rec.role === "user"
          ? "user"
          : null;
    const content = typeof rec.content === "string" ? rec.content.trim() : "";
    if (!role || !content) continue;
    out.push({ role, content: content.slice(0, 12000) });
  }
  return out;
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  if (!(await isHubAiConfigured())) {
    return jsonError(AI_NOT_CONFIGURED_MESSAGE, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const mode: AssistantMode = isAssistantMode(body.mode) ? body.mode : "chat";
  const attachments = parseAttachments(body.attachments);
  const brief =
    typeof body.brief === "string"
      ? body.brief.trim().slice(0, 8000)
      : typeof body.text === "string"
        ? body.text.trim().slice(0, 8000)
        : "";

  try {
    if (mode === "chat") {
      const messages = parseMessages(body.messages);
      if (!messages.length) {
        return jsonError("Add a message for the assistant.", 400);
      }
      const reply = await generateAssistantChat({
        messages,
        attachments,
        readContext: await assistantReadContext(),
      });
      return jsonOk({ mode, reply });
    }

    if (mode === "draft_email") {
      if (!brief && !attachments.length) {
        return jsonError("Add a brief or attachment to draft an email.", 400);
      }
      const draft = await draftEmailAssist({ brief, attachments });
      return jsonOk({ mode, draft });
    }

    if (mode === "draft_social") {
      if (!brief && !attachments.length) {
        return jsonError("Add a brief or attachment to draft a social post.", 400);
      }
      const draft = await draftSocialAssist({ brief, attachments });
      return jsonOk({ mode, draft });
    }

    if (mode === "rewrite") {
      if (!brief) {
        return jsonError("Paste the copy to rewrite.", 400);
      }
      const text = await rewriteAssist({ text: brief, attachments });
      return jsonOk({ mode, draft: { text } });
    }

    if (mode === "summarise") {
      if (!brief && !attachments.length) {
        return jsonError("Add notes or an attachment to summarise.", 400);
      }
      const draft = await summariseAssist({ brief, attachments });
      return jsonOk({ mode, draft });
    }

    return jsonError("Unknown mode", 400);
  } catch (err) {
    const { message, status } = friendlyAiError(err);
    console.error("[api/ai/assistant]", err);
    return jsonError(message, status);
  }
}
