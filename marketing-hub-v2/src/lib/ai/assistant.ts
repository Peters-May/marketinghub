import { generateObject, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { getHubOpenAIModel } from "@/lib/ai/openai";
import {
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

When the user asks you to create or update a hub record (task, event, or social/content post), end your reply with exactly one block:

:::hub-command
Add a task to call the organiser, due Friday
:::

The command line must match hub natural-language commands, for example:
- Add a task to call the organiser, due Friday
- Add an event Monaco Yacht Show on 12 Oct 2026 in Monaco
- Add a LinkedIn post about autumn yacht moves, due next Tuesday
- Update task call the organiser status done

Do not invent commands for emails, budgets, media, or other modules.
Never claim you already saved the record — the admin must confirm in the hub.`;

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

export function streamAssistantChat(input: {
  messages: AssistantChatMessage[];
  attachments?: AssistantAttachment[];
}) {
  return streamText({
    model: getHubOpenAIModel(),
    system: HUB_ASSISTANT_SYSTEM,
    messages: buildChatMessages(input),
  });
}

export async function draftEmailAssist(input: {
  brief: string;
  attachments?: AssistantAttachment[];
}) {
  const { object } = await generateObject({
    model: getHubOpenAIModel(),
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
    model: getHubOpenAIModel(),
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
    model: getHubOpenAIModel(),
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
    model: getHubOpenAIModel(),
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
