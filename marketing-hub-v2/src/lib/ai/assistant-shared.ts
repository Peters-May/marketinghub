export const ASSISTANT_MODES = [
  "chat",
  "draft_email",
  "draft_social",
  "rewrite",
  "summarise",
] as const;

export type AssistantMode = (typeof ASSISTANT_MODES)[number];

export type AssistantAttachment = {
  name: string;
  url: string;
  mime: string;
};

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const HUB_COMMAND_FENCE = /:::hub-command\s*\n([\s\S]*?)\n:::/i;

/** Short replies that mean “save the action already proposed”. */
const RUN_CONFIRMATION =
  /^(?:(?:yes|yep|yeah|ok|okay)(?:\s+please)?|yes\s+(?:do it|do that|sounds good|go ahead)|do it|do that|sounds good|go ahead|confirm(?:ed)?|please do(?:\s+it)?|proceed|run it|save it|execute(?:\s+it)?)$/i;

export function isAssistantMode(value: unknown): value is AssistantMode {
  return (
    typeof value === "string" &&
    (ASSISTANT_MODES as readonly string[]).includes(value)
  );
}

/** Strip the hub-command fence for display; return the command text if present. */
export function extractHubCommand(reply: string): {
  displayText: string;
  commandText: string | null;
} {
  const match = reply.match(HUB_COMMAND_FENCE);
  if (!match) {
    return { displayText: reply.trim(), commandText: null };
  }
  const commandText = match[1].trim() || null;
  const displayText = reply.replace(HUB_COMMAND_FENCE, "").trim();
  return { displayText, commandText };
}

/** True when the admin is approving a proposal already on screen, not asking for a new one. */
export function isHubRunConfirmation(input: string): boolean {
  const text = input
    .trim()
    .replace(/[.!]+$/g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return RUN_CONFIRMATION.test(text);
}
