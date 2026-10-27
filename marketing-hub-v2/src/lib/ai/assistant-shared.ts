import { splitProposedAttendance } from "@/lib/command/attendance";
import { parseHubCommands } from "@/lib/command/parse";

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

const HUB_COMMAND_FENCE = /:{2,3}hub-command\s*\n([\s\S]*?)\n:{2,3}/i;

/** Short replies that mean “save the action already proposed”. */
const RUN_CONFIRMATION =
  /^(?:(?:yes|yep|yeah|ok|okay)(?:\s+please)?|yes\s+(?:do it|do that|sounds good|go ahead)|do it|do that|add them|sounds good|go ahead|confirm(?:ed)?(?:\s+to\s+proceed)?|please do(?:\s+it)?|please confirm(?:\s+to\s+proceed)?|proceed|run it|save it|execute(?:\s+it)?)$/i;

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

/** "Add Ana Navarro and Giulia Fichera as attending Metstrade". */
export function parseAddAttendeesRequest(
  input: string
): { event: string; people: string } | null {
  const text = input.trim().replace(/[.]+$/g, "").trim();
  const match = text.match(
    /^(?:please\s+)?add\s+(.+?)\s+as\s+attending\s+(?:the\s+)?(?:event\s+)?(.+)$/i
  );
  if (!match) return null;
  const event = match[2].trim().replace(/^["“”']+|["“”']+$/g, "").trim();
  const names = splitProposedAttendance(match[1]).people.map(
    (person) => person.name
  );
  if (!event || event.length > 80 || names.length === 0) return null;
  return { event, people: names.join(", ") };
}

function attendanceCommandMatches(
  commandText: string,
  request: { event: string; people: string }
): boolean {
  const parsed = parseHubCommands(commandText);
  if (!parsed.ok || parsed.commands.length !== 1) return false;
  const update = parsed.commands[0];
  if (update.kind !== "update_event") return false;
  if (update.query.trim().toLowerCase() !== request.event.trim().toLowerCase()) {
    return false;
  }
  const got = new Set(
    splitProposedAttendance(update.attending).people.map((person) =>
      person.name.toLowerCase()
    )
  );
  const wanted = splitProposedAttendance(request.people).people.map((person) =>
    person.name.toLowerCase()
  );
  return wanted.length > 0 && wanted.every((name) => got.has(name));
}

/**
 * A request to add named people must become an event update.
 * The company "We are attending" line does not add those people.
 */
export function ensureNamedAttendanceCommand(
  userText: string,
  reply: string
): string {
  const request = parseAddAttendeesRequest(userText);
  if (!request) return reply;
  const extracted = extractHubCommand(reply);
  if (
    extracted.commandText &&
    attendanceCommandMatches(extracted.commandText, request)
  ) {
    return reply;
  }
  const line = `Update event ${request.event} attending ${request.people}`;
  const display = extracted.displayText
    .replace(HUB_COMMAND_FENCE, "")
    .trim();
  const intro =
    !display || /we are attending/i.test(display)
      ? `Add ${request.people} as attending ${request.event}.`
      : display;
  return `${intro}\n\n:::hub-command\n${line}\n:::`;
}
