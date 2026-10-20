import { createOpenAI } from "@ai-sdk/openai";

export const AI_NOT_CONFIGURED_MESSAGE =
  "AI is not configured. Set OPENAI_API_KEY or AI_GATEWAY_API_KEY.";

export function getHubOpenAIApiKey(): string | null {
  return (
    process.env.OPENAI_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_AI_GATEWAY_API_KEY ||
    null
  );
}

export function isHubAiConfigured(): boolean {
  return Boolean(getHubOpenAIApiKey());
}

/** Shared OpenAI model used by email assist and the hub assistant. */
export function getHubOpenAIModel() {
  const apiKey = getHubOpenAIApiKey();
  if (!apiKey) {
    throw new Error(AI_NOT_CONFIGURED_MESSAGE);
  }
  const openai = createOpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return openai(process.env.OPENAI_MODEL || "gpt-4o-mini");
}
