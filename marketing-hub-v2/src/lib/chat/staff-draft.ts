import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { formatChatTranscript } from "@/lib/chat/lead";
import type { ChatMessage, ChatSession } from "@/lib/types";

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

/** Static chips for the Hub composer (editable before send). */
export const STAFF_REPLY_TEMPLATES: Array<{ id: string; label: string; body: string }> =
  [
    {
      id: "reviewing",
      label: "Reviewing details",
      body: "Thank you — I am reviewing the details you have shared and will come back to you shortly.",
    },
    {
      id: "need-details",
      label: "Need more details",
      body: "Thank you. Could you share a couple more details so we can point this to the right team? In particular, where you are based and where the yacht or cargo is now would help.",
    },
    {
      id: "out-of-hours",
      label: "Outside UK hours",
      body: "Thank you for your message. Our team typically replies during UK business hours — we will follow up by email as soon as we can.",
    },
    {
      id: "passing-on",
      label: "Passing to the team",
      body: "Thank you. I am passing this to the right Peters & May team now. They will review and reply by email, and will ask if anything further is needed.",
    },
  ];
