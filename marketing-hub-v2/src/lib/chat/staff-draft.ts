import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { formatChatTranscript } from "@/lib/chat/lead";
import type { ChatMessage, ChatSession } from "@/lib/types";

export { STAFF_REPLY_TEMPLATES } from "@/lib/chat/staff-templates";

async function model() {
  const { getHubOpenAIApiKey, AI_NOT_CONFIGURED_MESSAGE } = await import(
    "@/lib/ai/openai"
  );
  const apiKey = await getHubOpenAIApiKey();
  if (!apiKey) {
    throw new Error(AI_NOT_CONFIGURED_MESSAGE);
  }
  const openai = createOpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return openai(
    process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini"
  );
}

/** Short British-English staff reply draft for the Hub inbox composer. Never auto-sent. */
export async function draftStaffReply(input: {
  session: ChatSession;
  messages: ChatMessage[];
}): Promise<string> {
  const who = [
    input.session.visitor_name,
    input.session.visitor_email,
    input.session.visitor_company,
    input.session.visitor_location,
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" · ");

  const transcript = formatChatTranscript(input.messages).slice(0, 6000);
  const { text } = await generateText({
    model: await model(),
    temperature: 0.4,
    maxTokens: 280,
    system: `You draft website-chat replies for Peters & May staff to edit and send.
British English. Warm, consultative, unhurried. Short paragraphs. No emoji. No exclamation marks. No hype.
Write as a human colleague (not “the assistant”). Do not invent rates, sailings, capacity, or promises.
One short reply only — typically 2 to 4 sentences. Do not include internal notes or suggested office names.
If useful, ask for at most one missing detail. If enough is present, confirm what happens next (team review / reply by email).`,
    prompt: `Visitor: ${who || "details not yet given"}
Page: ${input.session.page_title || input.session.page_url || "website"}

Transcript:
${transcript || "(empty)"}

Draft the staff reply now.`,
  });

  return String(text || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}
