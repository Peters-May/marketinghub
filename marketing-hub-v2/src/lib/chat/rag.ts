import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { BRAND_AI_SUMMARY } from "@/lib/brand/ai-summary";
import { resolveChatGuidance } from "@/lib/chat/enquiry-guidance";
import type { ChatKbDocument, ChatMessage } from "@/lib/types";
import { listKbDocuments, getChatSettings } from "@/lib/chat/data";

function scoreDoc(query: string, doc: ChatKbDocument): number {
  const q = query.toLowerCase();
  const words = q.split(/\W+/).filter((w) => w.length > 2);
  const hay = `${doc.title}\n${doc.body}`.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (hay.includes(w)) score += 1;
  }
  if (doc.title.toLowerCase().split(/\W+/).some((t) => q.includes(t) && t.length > 3)) {
    score += 2;
  }
  return score;
}

export function retrieveKb(
  query: string,
  docs: ChatKbDocument[],
  limit = 4
): ChatKbDocument[] {
  const scored = docs
    .map((d) => ({ d, score: scoreDoc(query, d) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) {
    return docs.slice(0, Math.min(2, docs.length));
  }
  return scored.slice(0, limit).map((x) => x.d);
}

function model() {
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI is not configured. Set OPENAI_API_KEY or AI_GATEWAY_API_KEY."
    );
  }
  const openai = createOpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return openai(process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini");
}

/** Force handoff for explicit human request or hard quote pressure mid-flow. */
export function shouldForceHandoff(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(speak (to|with) (a |the )?human|talk to (a |the )?(person|someone|team|agent)|real person|live (chat|agent))\b/i.test(
      t
    ) ||
    /\b(give me (a |the )?(price|quote|rate)|exact (price|cost|rate)|how much (will|would) it cost)\b/i.test(
      t
    )
  );
}

export async function streamAssistantReply(input: {
  visitorMessage: string;
  history: ChatMessage[];
}): Promise<{
  textStream: AsyncIterable<string>;
  sources: ChatMessage["sources"];
  forceHandoff: boolean;
}> {
  const [settings, docs] = await Promise.all([
    getChatSettings(),
    listKbDocuments({ activeOnly: true }),
  ]);
  const retrieved = retrieveKb(input.visitorMessage, docs);
  const sources = retrieved.map((d) => ({
    title: d.title,
    ...(d.source_url ? { source_url: d.source_url } : {}),
  }));

  const forceHandoff = shouldForceHandoff(input.visitorMessage);

  const kbBlock =
    retrieved.length === 0
      ? "(No knowledge base excerpts matched this message. Continue qualifying from Guidance. For factual extras such as careers URLs or referral contacts, say you will pass the enquiry to the team if unsure.)"
      : retrieved
          .map(
            (d, i) =>
              `[${i + 1}] ${d.title}${d.source_url ? ` (${d.source_url})` : ""}\n${d.body}`
          )
          .join("\n\n");

  const guidance = resolveChatGuidance(settings.guidance);

  const system = `${BRAND_AI_SUMMARY}

You are the Peters & May website enquiry assistant for anonymous visitors.

Guidance:
${guidance}

Hard rules:
- Follow Guidance for qualification flows, specialist replies (careers, personal effects, suppliers, existing bookings), and what never to promise.
- Use knowledge base excerpts below for factual extras (contacts, careers URL, haulier names, office notes). Do not invent contacts or URLs not present in Guidance or the knowledge base.
- British English. Short paragraphs. No emoji. No exclamation marks. No hype.
- Never invent rates, capacity, sailing dates, clients, case studies, leadership names, or company figures. Published facts are allowed only when present in the knowledge base excerpts.
- Ask conversationally. Prefer one or two questions at a time. Stop when enough exists for a team review, then confirm handover and ask for a business email if missing.
- If they insist on rates/quotes or a person, invite Speak to the team / email capture without inventing numbers.
- If you cannot answer from the knowledge base, say so briefly, optionally offer Speak to the team, then ask what else you can help with.

Knowledge base:
${kbBlock}`;

  const historyMessages = input.history
    .filter((m) => m.role === "visitor" || m.role === "assistant" || m.role === "staff")
    .slice(-12)
    .map((m) => ({
      role:
        m.role === "visitor"
          ? ("user" as const)
          : ("assistant" as const),
      content: m.body,
    }));

  const result = streamText({
    model: model(),
    system,
    messages: [
      ...historyMessages,
      { role: "user", content: input.visitorMessage },
    ],
  });

  return {
    textStream: result.textStream,
    sources,
    forceHandoff,
  };
}

/** Non-streaming reply for Hub playground / fallback. */
export async function generateAssistantReply(input: {
  visitorMessage: string;
  history: ChatMessage[];
}): Promise<{ body: string; sources: ChatMessage["sources"]; forceHandoff: boolean }> {
  const streamed = await streamAssistantReply(input);
  let body = "";
  for await (const chunk of streamed.textStream) {
    body += chunk;
  }
  if (streamed.forceHandoff && !/team|email|follow/i.test(body)) {
    body = `${body.trim()}\n\nFor a quote or personal help, use Speak to the team and leave your business email.`.trim();
  }
  return {
    body: body.trim() || "I am not sure from our published information. Please speak to the team and we will follow up.",
    sources: streamed.sources,
    forceHandoff: streamed.forceHandoff,
  };
}
