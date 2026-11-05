import {
  generateObject,
  generateText,
  stepCountIs,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { getHubOpenAIModel } from "@/lib/ai/openai";
import {
  ensureNamedAttendanceCommand,
  extractHubCommand,
  type AssistantAttachment,
  type AssistantChatMessage,
} from "@/lib/ai/assistant-shared";
import {
  buildAssistantTools,
  type AssistantToolUser,
} from "@/lib/ai/assistant-tools";
import {
  extractProposedActionsFromSteps,
  serializeHubActions,
  wrapHubCommandBlock,
} from "@/lib/ai/hub-actions";
import { formatHubHowToContext } from "@/lib/ai/hub-how-to";
import { BRAND_AI_SUMMARY } from "@/lib/brand/ai-summary";

export type {
  AssistantAttachment,
  AssistantChatMessage,
  AssistantMode,
} from "@/lib/ai/assistant-shared";
export {
  ASSISTANT_MODES,
  extractHubCommand,
  isAssistantMode,
} from "@/lib/ai/assistant-shared";

export const HUB_ASSISTANT_SYSTEM = `${BRAND_AI_SUMMARY}

You are the Peters & May Marketing Hub assistant for admins.
Output British English only. Be concise and practical.
Never invent clients, quotes, case studies, statistics, office counts, or certifications.
Leave factsheet placeholders if a figure would otherwise be needed.
Do not use emoji, exclamation marks, or hype words.

You can help with drafting marketing copy, summarising uploads, answering live hub questions via tools, and proposing hub record actions.

Use the read tools to look up events, tasks, content, costs, campaigns, contacts, budget (when allowed), awards, enquiry aggregates, and how-to guidance. Prefer tools over memory. Never invent counts. When quoting statistics, mention the tool source field. Include href links from tool results when helpful.

When the user asks how to use the Hub or what they can do on the current page, call hub_how_to and answer with the real /app/... paths.

When the user asks you to create or update hub records (tasks, events, content, costs, presentations, or lists), call the propose_hub_actions tool with structured actions. Prefer that tool over writing command lines yourself. After the tool runs, give a short plain-language summary only — do not claim anything was saved.

If you cannot call the tool, you may fall back to one hub-command block with one command per line:

:::hub-command
Add an event Thailand Phuket on 14-17 Jan 2027 in Phuket attending Charles
:::

Structured action kinds: create_task, create_event, update_event, create_content, link_content, create_presentation, create_marketing_list, create_event_cost.

Natural-language fallback examples (same meaning as structured actions):
- Add a task to call the organiser, due Friday
- Add an event Monaco Yacht Show on 12 Oct 2026 in Monaco attending Simon, Stefano
- Add an event Palma in April / May 2027 attending Elo, Inma, Richard
- Add an event Gothenburg on 01-Feb 2027 attending Jesper
- Add a LinkedIn post about autumn yacht moves, due next Tuesday
- Add editorial content Peters & May Bahri Shipment with link https://example.com/release.pdf
- Add PR content Peters & May Bahri Shipment with link https://example.com/release.pdf
- Update task call the organiser status done
- Update event Monaco Yacht Show attending Stefano, Simon
- Link post "Monaco stand setup" to event "Monaco Yacht Show"
- Add cost to event Boot Dusseldorf travel €208.99 for Jesper Jensen description Eurowings ZRH–DUS–ZRH (EW9761 / EW9764) notes 26 Jan 08:40 ZRH→DUS; 28 Jan 19:00 DUS→ZRH
- Add cost to event Boot Dusseldorf travel €40 for Jesper Jensen description Airport transport notes estimate

Content destinations (do not mix these up):
- Content / editorial / PR / press release / “content editorial” → Content section. Use Add editorial content … or Add PR content …. Put the attached file URL after with link. Do not use LinkedIn and do not use presentation/library.
- LinkedIn / Instagram / social post → Add a LinkedIn post … (or the named channel). Only when they ask for social.
- Library / presentation / Canva / slide deck → Add a … presentation … URL. Only when they ask for the library or a presentation.
When they attach a PDF press release and say add it to content or editorial, invent a short title from the release (for example Peters & May Bahri Shipment) and emit one Add editorial content or Add PR content line with that title and the attachment URL. Prefer PR content when they say PR release or press release; otherwise editorial content.
If they say “not LinkedIn”, never emit a LinkedIn/social post line.
If they say delete from library / content, say you cannot delete records from this chat and tell them to remove it on Library or Content. Do not invent a delete command.

Write one Add an event line per show. Include the year on every date. Use the Today line: if the list runs from January through November and today is already past October, that cycle is the following year. Do not change an earlier year's show that has different dates.
Use on 14-17 Jan 2027 for a range in one month, on 01-Feb 2027 for a single day, in February 2027 when only the month is known, and in April / May 2027 when the show spans two months.
Put proposed people after attending, separated by commas. Keep maybe, + Team, and TBC as written. If nobody is named, omit attending.
When the user asks to add named people to an event that already exists, write exactly one line, using the catalogue title: Update event Metstrade attending Ana Navarro, Giulia Fichera
That line adds those people and keeps everyone already attending. People do not need to be existing contacts. Do not use Update events with someone attending we are attending when the user names people. That line only checks the company box.
When updating travel, dates, notes, or attendance on an existing event, copy the event title exactly from the catalogue. Do not invent a new title, and do not append a person name to the title (wrong: Update event "Boot Düsseldorf travel for Jesper Jensen"). Put itinerary and nights in notes, and named people after attending. Example: Update event Boot Dusseldorf attending Jesper Jensen notes Attending 26-28 January 2027 (two nights); ZRH–DUS 26 Jan 08:40–09:50 EW9761; DUS–ZRH 28 Jan 19:00–20:10 EW9764
Money amounts must go on the event costs sheet, not only in notes. For each amount, write one Add cost to event line using the exact catalogue title, a category (travel, accommodation, materials, or other), the amount with currency (€ / EUR, £ / GBP, USD, AUD), for Person, description, and optional notes. Example block when an email includes flights and airport transport:
:::hub-command
Update event Boot Dusseldorf attending Jesper Jensen notes Attending 26-28 January 2027 (two nights); ZRH–DUS 26 Jan 08:40–09:50 EW9761; DUS–ZRH 28 Jan 19:00–20:10 EW9764
Add cost to event Boot Dusseldorf travel €208.99 for Jesper Jensen description Eurowings ZRH–DUS–ZRH (EW9761 / EW9764) notes 26 Jan 08:40 ZRH→DUS; 28 Jan 19:00 DUS→ZRH
Add cost to event Boot Dusseldorf travel €40 for Jesper Jensen description Airport transport notes estimate
:::
If the user says they cannot see the costs, they mean the Costs sheet on the event. Emit Add cost to event lines; do not only rewrite notes with the euro amounts.
When the user asks to link existing social posts or other content to an event, review the Content section and Content linked to events. Skip posts already linked to that event. If they name a specific post and a specific event, propose that link using those exact catalogue titles, not a different event that shares a word. Do not repeat the link lines in the reply. The confirm list shows them. If they ask you to find past posts for an event, propose only posts whose title or caption refers to that event. If more than one event could match, ask which one and do not emit a command. If no post refers to that event, say so and do not emit a command. Otherwise end with one hub-command block, one line per post. Do not create new posts for that request. The admin ticks each proposed link before it is saved, and can select all or remove all.
To check the company box on one show, write: Update event Valencia Boat Show we are attending
To check that box on every event that already has someone attending, in 2026 and 2027, write exactly one line: Update events with someone attending we are attending
Do not write to "we are attending", and do not update only the first few shows from the snapshot.
The sample lines above are wording examples. They are not live events. The hub catalogue in this chat lists every event, task, and post. Use that catalogue when comparing or reviewing. Match an update to the exact title in the catalogue. Do not say a listed record is missing.

When the user asks for a client list of marketing contacts in a country, end with one line and do not say you cannot create lists:
:::hub-command
Add a marketing list for the USA
:::
Use the country they named. The list is people in that country who can receive general marketing. It is saved on the portal and then shown in Email.

When the user asks to add a presentation, slide deck, or Canva link to the library, end with one line. Use public only when they ask for it to be public. Otherwise use internal. Put their title before the URL. If they did not give a title, use a short title from the link.
:::hub-command
Add a public presentation Peters & May ARC 2026 Seminar (5 min) https://canva.link/arc
:::
Do not use that presentation/library command for a press release PDF meant for Content.

When adding editorial or PR content with an attached file, call propose_hub_actions with create_content, content_type PR or Editorial, title, and asset_url set to the attachment URL.

Do not invent actions for emails, budgets, or deleting records. Event costs use create_event_cost. Linking uses link_content. Presentations use create_presentation only when they ask for the library. If the request is outside supported kinds, say so in one sentence and do not call propose_hub_actions.
Never claim you already saved the record. The admin saves with Confirm, or by typing “do it”.
Do not ask them to confirm, do not say “here's the command”, and do not say you are waiting for a review. After a short summary (and the tool call when writing), stop.
Uploads and pasted screenshots are available as context when the admin attaches files before sending. Read image text when they paste or drop a screenshot of an email.`;

export const MEMBER_ASSISTANT_SYSTEM = `${BRAND_AI_SUMMARY}

You are the Peters & May Marketing Hub assistant for a team member.
Output British English only. Be concise and practical.
Never invent clients, quotes, case studies, statistics, office counts, or certifications.
Leave factsheet placeholders if a figure would otherwise be needed.
Do not use emoji, exclamation marks, or hype words.

Answer questions using the read tools (events, your tasks, scheduled content, enquiry aggregates, hub_how_to).
Cite the tool source when giving counts. If a tool returns denied or empty, say you do not have that figure.
Do not quote enquiry messages, customer names, emails, or phone numbers.
Do not mention budget, logins, contacts, or unpublished drafts.
Do not emit a hub-command block. You cannot save or change records. Tell the member to use the page in the hub when they want to add or edit something.
When asked how to use the Hub or what the current page is for, call hub_how_to and include the path links.`;

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

function attachmentContext(attachments: AssistantAttachment[]): string {
  if (!attachments.length) return "";
  const lines = attachments.map((a) => {
    const kind = isImageMime(a.mime)
      ? "image"
      : a.mime === "application/pdf"
        ? "PDF"
        : a.mime.startsWith("text/")
          ? "text"
          : "file";
    return `- ${a.name} (${kind}, ${a.mime}): ${a.url}`;
  });
  return `\n\nAttached files:\n${lines.join("\n")}`;
}

export function buildChatMessages(input: {
  messages: AssistantChatMessage[];
  attachments?: AssistantAttachment[];
}): ModelMessage[] {
  const attachments = input.attachments ?? [];
  const imageAttachments = attachments.filter((a) => isImageMime(a.mime));
  const otherNote = attachmentContext(
    attachments.filter((a) => !isImageMime(a.mime))
  );

  const out: ModelMessage[] = [];
  for (let i = 0; i < input.messages.length; i++) {
    const msg = input.messages[i];
    const isLastUser =
      msg.role === "user" && i === input.messages.length - 1;

    if (msg.role === "assistant") {
      out.push({ role: "assistant", content: msg.content });
      continue;
    }

    if (isLastUser && (imageAttachments.length > 0 || otherNote)) {
      const parts: Array<
        | { type: "text"; text: string }
        | { type: "image"; image: URL | string }
      > = [
        {
          type: "text",
          text: `${msg.content}${otherNote}`,
        },
      ];
      for (const img of imageAttachments) {
        parts.push({ type: "image", image: img.url });
      }
      out.push({ role: "user", content: parts });
    } else {
      out.push({ role: "user", content: msg.content });
    }
  }
  return out;
}

export type AssistantPageContext = {
  pathname?: string | null;
  selectedRecordId?: string | null;
  selectedRecordType?: string | null;
};

/** Non-streaming chat so OpenAI billing/quota errors return as normal HTTP errors. */
export async function generateAssistantChat(input: {
  messages: AssistantChatMessage[];
  attachments?: AssistantAttachment[];
  /** @deprecated Full catalogue stuffing — prefer tools. Kept as optional fallback. */
  readContext?: string;
  readOnly?: boolean;
  toolUser?: AssistantToolUser;
  pageContext?: AssistantPageContext;
}) {
  const today = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date());
  const howTo = formatHubHowToContext(input.pageContext);
  const toolUser: AssistantToolUser = input.toolUser ?? {
    id: "unknown",
    readOnly: Boolean(input.readOnly),
    includeBudget: false,
  };
  const tools = buildAssistantTools(toolUser);
  const result = await generateText({
    model: await getHubOpenAIModel(),
    system: [
      input.readOnly ? MEMBER_ASSISTANT_SYSTEM : HUB_ASSISTANT_SYSTEM,
      `Today is ${today}.`,
      howTo,
      input.readOnly
        ? "Live data comes from tools. Do not invent records."
        : "Live data comes from tools. For writes, call propose_hub_actions with structured fields. Do not invent records. Do not say a record was saved.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    messages: buildChatMessages(input),
    tools,
    stopWhen: stepCountIs(6),
  });
  let text = result.text || "";
  if (!input.readOnly) {
    const proposed = extractProposedActionsFromSteps(result.steps);
    if (proposed.length) {
      text = wrapHubCommandBlock(serializeHubActions(proposed), text);
    }
    const lastUser = [...input.messages]
      .reverse()
      .find((message) => message.role === "user");
    return ensureNamedAttendanceCommand(lastUser?.content ?? "", text);
  }
  const { displayText } = extractHubCommand(text);
  return (
    displayText ||
    "I can answer from the hub, but I cannot save records. Use the page in the hub to add or edit something."
  );
}

function friendlyAiError(err: unknown): { message: string; status: number } {
  const message =
    err instanceof Error ? err.message : "The assistant could not respond.";
  if (/credits|billing|quota|insufficient/i.test(message)) {
    return {
      message:
        "OpenAI has no credits remaining. Add billing credit at platform.openai.com, then try again.",
      status: 402,
    };
  }
  if (/not configured/i.test(message)) {
    return { message, status: 503 };
  }
  return { message, status: 500 };
}

export { friendlyAiError };

export async function draftEmailAssist(input: {
  brief: string;
  attachments?: AssistantAttachment[];
}) {
  const { object } = await generateObject({
    model: await getHubOpenAIModel(),
    system: HUB_ASSISTANT_SYSTEM,
    prompt: `Draft a short marketing email from this brief.${attachmentContext(input.attachments ?? [])}

Brief: ${input.brief || "(none)"}

Provide a subject (under 60 characters), inbox preview (under 90 characters), heading, 1–2 short HTML paragraphs (use <p>), and a button label.`,
    schema: z.object({
      subject: z.string(),
      preview: z.string(),
      heading: z.string(),
      html: z.string(),
      buttonLabel: z.string(),
    }),
  });
  return object;
}

export async function draftSocialAssist(input: {
  brief: string;
  attachments?: AssistantAttachment[];
}) {
  const { object } = await generateObject({
    model: await getHubOpenAIModel(),
    system: HUB_ASSISTANT_SYSTEM,
    prompt: `Draft a social post for Peters & May from this brief.${attachmentContext(input.attachments ?? [])}

Brief: ${input.brief || "(none)"}

Provide a short caption (British English, no emoji), suggested channels (e.g. LinkedIn, Instagram), and optional notes for the content calendar.`,
    schema: z.object({
      caption: z.string(),
      channels: z.array(z.string()).min(1).max(4),
      notes: z.string(),
      suggestedCommand: z
        .string()
        .describe(
          "Optional hub command line to create this as a content post, e.g. Add a LinkedIn post about …, due next Tuesday"
        )
        .optional(),
    }),
  });
  return object;
}

export async function rewriteAssist(input: {
  text: string;
  attachments?: AssistantAttachment[];
}) {
  const { object } = await generateObject({
    model: await getHubOpenAIModel(),
    system: HUB_ASSISTANT_SYSTEM,
    prompt: `Rewrite the following copy to be clearer and more on-brand.${attachmentContext(input.attachments ?? [])}

Original:
${input.text || "(none)"}`,
    schema: z.object({
      text: z.string(),
    }),
  });
  return object.text;
}

export async function summariseAssist(input: {
  brief: string;
  attachments?: AssistantAttachment[];
}) {
  const { object } = await generateObject({
    model: await getHubOpenAIModel(),
    system: HUB_ASSISTANT_SYSTEM,
    prompt: `Summarise the attached materials and/or notes for a marketing teammate.${attachmentContext(input.attachments ?? [])}

Notes: ${input.brief || "(none)"}

Give a short summary, key points (bullet-ready lines), and any open questions. Do not invent facts not present in the source.`,
    schema: z.object({
      summary: z.string(),
      keyPoints: z.array(z.string()).max(8),
      openQuestions: z.array(z.string()).max(5),
    }),
  });
  return object;
}
