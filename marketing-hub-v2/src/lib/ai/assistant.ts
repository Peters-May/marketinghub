import { generateObject, generateText, type ModelMessage } from "ai";
import { z } from "zod";
import { getHubOpenAIModel } from "@/lib/ai/openai";
import {
  extractHubCommand,
  type AssistantAttachment,
  type AssistantChatMessage,
} from "@/lib/ai/assistant-shared";
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

You can help with drafting marketing copy, summarising uploads, and proposing hub record actions.

When the user asks you to create or update hub records (tasks, events, or social/content posts), including a proposed attendance list, end your reply with exactly one block. Put one command per line. Do not number the lines.

:::hub-command
Add an event Thailand Phuket on 14-17 Jan 2027 in Phuket attending Charles
Add an event Düsseldorf on 23-31 Jan 2027 in Düsseldorf attending Simon, Cass, Richard, maybe Racing
Add an event Dubai in February 2027 attending Jack
Add an event Newport Charter Show in June 2027 attending TBC
:::

Each line must match hub natural-language commands, for example:
- Add a task to call the organiser, due Friday
- Add an event Monaco Yacht Show on 12 Oct 2026 in Monaco attending Simon, Stefano
- Add an event Palma in April / May 2027 attending Elo, Inma, Richard
- Add an event Gothenburg on 01-Feb 2027 attending Jesper
- Add a LinkedIn post about autumn yacht moves, due next Tuesday
- Update task call the organiser status done
- Update event Monaco Yacht Show attending Stefano, Simon
- Link post "Monaco stand setup" to event "Monaco Yacht Show"

Write one Add an event line per show. Include the year on every date. Use the Today line: if the list runs from January through November and today is already past October, that cycle is the following year. Do not change an earlier year's show that has different dates.
Use on 14-17 Jan 2027 for a range in one month, on 01-Feb 2027 for a single day, in February 2027 when only the month is known, and in April / May 2027 when the show spans two months.
Put proposed people after attending, separated by commas. Keep maybe, + Team, and TBC as written. If nobody is named, omit attending.
When the user asks to link existing social posts or other content to an event, review the Content section and Content linked to events. Skip posts already linked to that event. If they name a specific post and a specific event, propose that link using those exact catalogue titles, not a different event that shares a word. Do not repeat the link lines in the reply. The confirm list shows them. If they ask you to find past posts for an event, propose only posts whose title or caption refers to that event. If more than one event could match, ask which one and do not emit a command. If no post refers to that event, say so and do not emit a command. Otherwise end with one hub-command block, one line per post. Do not create new posts for that request. The admin ticks each proposed link before it is saved, and can select all or remove all.
To check the company box on one show, write: Update event Valencia Boat Show we are attending
To check that box on every event that already has someone attending, in 2026 and 2027, write exactly one line: Update events with someone attending we are attending
Do not write to "we are attending", and do not update only the first few shows from the snapshot.
The sample lines above are wording examples. They are not live events. The hub catalogue in this chat lists every event, task, and post. Use that catalogue when comparing or reviewing. Match an update to the exact title in the catalogue. Do not say a listed record is missing.

Do not invent commands for emails, budgets, or media.
Linking an existing post to an event is allowed. If the user asks to update budget, media, or anything outside tasks, events, content, and those links, explain that clearly and do not invent a hub-command block.
Never claim you already saved the record. The admin saves it by pressing Confirm or typing “do it” or “add them”.
Do not ask them to confirm again, and do not say you are waiting for a review. After you emit the block, stop.
Uploads are available as context when the admin attaches files with Upload before sending.`;

export const MEMBER_ASSISTANT_SYSTEM = `${BRAND_AI_SUMMARY}

You are the Peters & May Marketing Hub assistant for a team member.
Output British English only. Be concise and practical.
Never invent clients, quotes, case studies, statistics, office counts, or certifications.
Leave factsheet placeholders if a figure would otherwise be needed.
Do not use emoji, exclamation marks, or hype words.

Answer questions about enquiry statistics, the library, scheduled and published content, events, and the member's own tasks.
Use only the figures and titles in the catalogue. If a figure is not listed, say you do not have it.
Do not quote enquiry messages, customer names, emails, or phone numbers.
Do not mention budget, logins, contacts, or unpublished drafts.
Do not emit a hub-command block. You cannot save or change records. Tell the member to use the page in the hub when they want to add or edit something.`;

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

/** Non-streaming chat so OpenAI billing/quota errors return as normal HTTP errors. */
export async function generateAssistantChat(input: {
  messages: AssistantChatMessage[];
  attachments?: AssistantAttachment[];
  readContext?: string;
  readOnly?: boolean;
}) {
  const snapshot = input.readContext?.trim();
  const today = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date());
  const { text } = await generateText({
    model: await getHubOpenAIModel(),
    system: [
      input.readOnly ? MEMBER_ASSISTANT_SYSTEM : HUB_ASSISTANT_SYSTEM,
      `Today is ${today}.`,
      snapshot
        ? input.readOnly
          ? `${snapshot}\n\nThis is a read-only catalogue. Answer from it. Do not say a record was saved, and do not propose a hub command.`
          : `${snapshot}\n\nThis catalogue is the live hub data for events, tasks, posts, partners, budget lines, resources, and which posts are already linked to events. Use it to extract, compare, choose the exact record to edit, and propose links from existing posts to an event. Writes still need a hub-command block and a confirmation in the hub. Do not say a record was saved.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    messages: buildChatMessages(input),
  });
  if (!input.readOnly) return text;
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
