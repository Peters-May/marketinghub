import { generateObject } from "ai";
import { z } from "zod";
import { getHubOpenAIModel } from "@/lib/ai/openai";
import { BRAND_AI_SUMMARY } from "@/lib/brand/ai-summary";

const SYSTEM = `${BRAND_AI_SUMMARY}

You help draft Peters & May marketing email copy. Output British English only.
Never invent clients, quotes, case studies, statistics, office counts, or certifications.
Leave factsheet placeholders if a figure would otherwise be needed.
Do not use emoji, exclamation marks, or hype words.`;

function model() {
  return getHubOpenAIModel();
}

export async function suggestSubjects(input: {
  brief: string;
  excerpt: string;
}) {
  const { object } = await generateObject({
    model: model(),
    system: SYSTEM,
    prompt: `Suggest 4 subject lines and matching preview text for a marketing email.

Brief: ${input.brief || "(none)"}
Body excerpt: ${input.excerpt || "(none)"}

Subjects should be specific and under 60 characters. Preview text under 90 characters.`,
    schema: z.object({
      options: z
        .array(
          z.object({
            subject: z.string(),
            preview: z.string(),
          })
        )
        .min(3)
        .max(5),
    }),
  });
  return object.options;
}

export async function improvePreview(input: {
  subject: string;
  excerpt: string;
}) {
  const { object } = await generateObject({
    model: model(),
    system: SYSTEM,
    prompt: `Write 2 inbox preview lines for this email. Each under 90 characters.

Subject: ${input.subject || "(none)"}
Body excerpt: ${input.excerpt || "(none)"}`,
    schema: z.object({
      options: z.array(z.string()).min(1).max(3),
    }),
  });
  return object.options;
}

export async function rewriteCopy(input: {
  text: string;
  html?: boolean;
  tone: "clearer" | "shorter" | "more_formal";
}) {
  const toneLabel =
    input.tone === "shorter"
      ? "shorter"
      : input.tone === "more_formal"
        ? "more formal"
        : "clearer";
  const { object } = await generateObject({
    model: model(),
    system: SYSTEM,
    prompt: `Rewrite the following email ${input.html ? "HTML" : "text"} to be ${toneLabel}. Keep personalisation tokens like {{name}} unchanged. ${
      input.html
        ? "Return valid simple HTML using only p, br, strong, em, a, ul, ol, li."
        : "Return plain text only."
    }

Original:
${input.text}`,
    schema: z.object({
      text: z.string(),
    }),
  });
  return object.text;
}

export async function draftFromBrief(input: {
  brief: string;
  audience?: string;
}) {
  const { object } = await generateObject({
    model: model(),
    system: SYSTEM,
    prompt: `Draft a short marketing email from this brief.

Brief: ${input.brief || "(none)"}
Audience: ${input.audience || "(general)"}

Provide a heading, 1–2 short HTML paragraphs (use <p>), and a button label.`,
    schema: z.object({
      heading: z.string(),
      html: z.string(),
      buttonLabel: z.string(),
    }),
  });
  return object;
}

export { excerptFromDesign } from "@/lib/email/design-excerpt";
