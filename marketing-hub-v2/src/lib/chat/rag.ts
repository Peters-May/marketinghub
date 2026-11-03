import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { BRAND_AI_SUMMARY } from "@/lib/brand/ai-summary";
import { resolveChatGuidance } from "@/lib/chat/enquiry-guidance";
import { extractReplyChoices } from "@/lib/chat/reply-choices";
import { fetchRelevantSitePages } from "@/lib/chat/site-pages";
import type { ChatKbDocument, ChatMessage } from "@/lib/types";
import { searchKbDocuments, getChatSettings } from "@/lib/chat/data";

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

/** Force handoff only when they explicitly ask for a person — not for ordinary quote or costs asks. */
export function shouldForceHandoff(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(speak (to|with) (a |the )?human|talk to (a |the )?(person|someone|team|agent)|real person|live (chat|agent)|speak to the team)\b/i.test(
    t
  );
}

export async function streamAssistantReply(input: {
  visitorMessage: string;
  history: ChatMessage[];
  /** Playground only. Saved guidance is used when this is omitted. */
  guidanceOverride?: string;
}): Promise<{
  textStream: AsyncIterable<string>;
  sources: ChatMessage["sources"];
  forceHandoff: boolean;
}> {
  const [settings, docs, sitePages] = await Promise.all([
    getChatSettings(),
    searchKbDocuments(input.visitorMessage),
    fetchRelevantSitePages(input.visitorMessage),
  ]);
  const retrieved = retrieveKb(input.visitorMessage, docs);
  const sources: ChatMessage["sources"] = [
    ...retrieved.map((d) => ({
      title: d.title,
      ...(d.source_url ? { source_url: d.source_url } : {}),
    })),
    ...sitePages.map((p) => ({
      title: p.title,
      source_url: p.url,
    })),
  ];

  const forceHandoff = shouldForceHandoff(input.visitorMessage);

  const kbParts: string[] = [];
  retrieved.forEach((d, i) => {
    kbParts.push(
      `[KB ${i + 1}] ${d.title}${d.source_url ? ` (${d.source_url})` : ""}\n${d.body}`
    );
  });
  sitePages.forEach((p, i) => {
    kbParts.push(
      `[Website ${i + 1}] ${p.title} (${p.url})\n${p.body}`
    );
  });

  const kbBlock =
    kbParts.length === 0
      ? "(No knowledge base or website excerpts matched this message. Continue qualifying from Guidance. For factual extras such as careers URLs or referral contacts, say you will pass the enquiry to the team if unsure.)"
      : kbParts.join("\n\n");

  const guidance = resolveChatGuidance(
    input.guidanceOverride ?? settings.guidance
  );
  const hasSailingSchedule = sitePages.some((p) =>
    p.url.includes("/sailings")
  );
  const sailingRule = hasSailingSchedule
    ? `
Sailing schedule (this message only):
- A Sailing Schedules excerpt is below. Answer a sailing or departure question from that excerpt only.
- Do not say you cannot confirm sailing schedules, and do not refuse to look. Quote the matching published sailings.
- Mention the published loading or ETD dates that match the port or route they asked about. Do not recite the full list.
- Say these are scheduled sailings currently listed, not a confirmed space and not the only option.
- In the same reply, say other options are available, including liner services and bespoke routings, and the team can look at what suits them.
- Do not promise space, a guaranteed date, or that their yacht is booked on that vessel.
- If nothing in the excerpt matches, say you cannot see that route in the published list and the team can check other options.
- This overrides any Guidance line that says you cannot confirm schedules or must not mention a sailing date. It does not override the ban on inventing dates or promising a booking.`
    : "";

  const system = `${BRAND_AI_SUMMARY}

You are the Peters & May website enquiry assistant for anonymous visitors.

Guidance:
${guidance}

Hard rules:
- Follow Guidance for qualification flows, specialist replies (careers, personal effects, suppliers, existing bookings), and what never to promise.
- Use the knowledge base and website excerpts below for published facts (services, guides, FAQs, offices, people, ports, careers, contacts, news, and sailing schedules). Do not invent contacts, names, titles, sailing dates, or URLs not present in those excerpts.
- British English when the visitor writes in English. Short paragraphs. No emoji. No exclamation marks. No hype.
- If the visitor writes in another language, reply in that language, including sailing dates and the other-options caveat. Keep port names, dates, vessel names, reference codes, and email addresses as published. Do not refuse because of the language. This overrides any Guidance line that says British English only.
- Never invent rates, capacity, sailing dates, clients, case studies, leadership names, or company figures. Published facts are allowed only when present in the excerpts below (Train KB or fetched website pages). A published sailing date must be followed by the point that other options are available and the team can look further.${sailingRule}
- Sound human. Acknowledge what they already said. On a detailed multi-point message, mirror the important points (named contact, prior enquiry, route, specific questions) before handover — do not send a generic forward-only reply. Never re-ask a detail that appears earlier in the conversation (boat, marina/port, destination, name, email, dimensions, and so on). Only ask for gaps. If they already gave an email, do not ask them to confirm it or “use the one provided”.
- Ask conversationally. Prefer one or two questions at a time for ordinary follow-ups. Exception: the first reply to a costs or quote request may ask for several missing essentials in one message. Do not claim you are passing the enquiry to the team until contact details and the main yacht gaps are in, or they have asked for a call. When the message already has enough for a team review, confirm handover warmly and stop. Ask for a business email only if none is in the thread.
- Ask once where the visitor is based (country or city), as its own short question, so the team can direct the enquiry later. Skip this if they already said where they are based. Do not say this chooses an office. Still ask where the yacht or cargo is now only if that is missing, and do not use their base instead of that.
- When a question has 2 to 5 mutually exclusive answers, end the message with exactly one line: [[choices: First option | Second option | Third option]]. Use short labels so the website shows tappable buttons. Do this whenever you ask that kind of question — do not skip the choices line. Examples: yacht vs freight → [[choices: Yacht transport | Freight or cargo | Something else]]; how the yacht sits → [[choices: Trailer | In the water | Ashore in a yard]]; air/sea/road → [[choices: Air | Sea | Road | Not sure]]; yes/no → [[choices: Yes | No]]. Do not add that line for open questions such as name, email, port, dimensions, dates, or “what would you like to know?”. The visitor can still type their own answer.
- If the visitor has already chosen yacht or freight (or said “Freight or cargo” / “Yacht transport”), do not list quote fields in chat. One short acknowledgement only — the website form collects the details.
- If they ask for rates or a quote, stay warm: thank them, apologise if they mentioned a missed call, show you heard the boat and places they named, confirm the team can review options and costs, offer a call or ask for the missing details in one go (not name and email alone). Never invent numbers. Do not open with “I can’t provide costs”. Do not say you will pass it to the team until those gaps are covered.
- Route containers, yacht storage containers, and general cargo to the forwarding team. Commercial Marine is only for large workboats / commercial vessels. Never say “commercial transport team” or “Commercial Marine” for a container move.
- Do not invent VAT, TVA, duty, or customs rulings. If they ask, note the question and say the team will review it with customs colleagues as part of the enquiry. Do not reply with a stiff “I cannot advise” and then ask for information they already gave.
- If you cannot answer from the excerpts, say so briefly, optionally offer Speak to the team, then ask what else you can help with.

Knowledge base and website excerpts:
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
    model: await model(),
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
  guidanceOverride?: string;
}): Promise<{
  body: string;
  choices: string[];
  sources: ChatMessage["sources"];
  forceHandoff: boolean;
}> {
  const streamed = await streamAssistantReply(input);
  let body = "";
  for await (const chunk of streamed.textStream) {
    body += chunk;
  }
  if (streamed.forceHandoff && !/team|email|follow/i.test(body)) {
    body = `${body.trim()}\n\nFor a quote or personal help, use Speak to the team and leave your business email.`.trim();
  }
  const extracted = extractReplyChoices(
    body.trim() ||
      "I am not sure from our published information. Please speak to the team and we will follow up."
  );
  return {
    body: extracted.body,
    choices: streamed.forceHandoff ? [] : extracted.choices,
    sources: streamed.sources,
    forceHandoff: streamed.forceHandoff,
  };
}
