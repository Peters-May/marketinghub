import { describe, expect, it } from "vitest";
import { formatChatTranscript } from "@/lib/chat/lead";
import type { ChatMessage } from "@/lib/types";

function msg(
  role: ChatMessage["role"],
  body: string,
  id = "x"
): ChatMessage {
  return {
    id,
    session_id: "s1",
    role,
    body,
    author_name: "",
    sources: [],
    created_at: "2026-10-20T12:00:00.000Z",
  };
}

describe("formatChatTranscript", () => {
  it("formats roles in order and skips empty bodies", () => {
    const text = formatChatTranscript([
      msg("assistant", "How can we help?"),
      msg("visitor", "Need a quote for a yacht"),
      msg("staff", "  "),
      msg("system", "Visitor asked to speak to the team."),
      msg("staff", "We can help — please share LOA."),
    ]);
    expect(text).toBe(
      [
        "[Assistant] How can we help?",
        "[Visitor] Need a quote for a yacht",
        "[System] Visitor asked to speak to the team.",
        "[Staff] We can help — please share LOA.",
      ].join("\n\n")
    );
  });
});
