import { createOpenAI } from "@ai-sdk/openai";
import { resolveHubOpenAIApiKey } from "@/lib/ai/ai-key";

export const AI_NOT_CONFIGURED_MESSAGE =
  "AI is not configured. Add the OpenAI key under Admin → AI key.";

export async function getHubOpenAIApiKey(): Promise<string | null> {
  return (await resolveHubOpenAIApiKey()).key;
}

export async function isHubAiConfigured(): Promise<boolean> {
  return Boolean(await getHubOpenAIApiKey());
}

/** Shared OpenAI model used by email assist, chat, and the hub assistant. */
export async function getHubOpenAIModel() {
  const apiKey = await getHubOpenAIApiKey();
  if (!apiKey) {
    throw new Error(AI_NOT_CONFIGURED_MESSAGE);
  }
  const openai = createOpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return openai(process.env.OPENAI_MODEL || "gpt-4o-mini");
}
