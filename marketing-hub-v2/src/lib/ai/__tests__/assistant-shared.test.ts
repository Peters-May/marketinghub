import { describe, expect, it } from "vitest";
import {
  extractHubCommand,
  isAssistantMode,
} from "@/lib/ai/assistant-shared";

describe("extractHubCommand", () => {
  it("returns plain reply when no fence", () => {
    const result = extractHubCommand("Here is a draft caption.");
    expect(result.displayText).toBe("Here is a draft caption.");
    expect(result.commandText).toBeNull();
  });

  it("extracts hub-command fence", () => {
    const result = extractHubCommand(
      `I can add that for you.\n\n:::hub-command\nAdd a task to call the organiser, due Friday\n:::`
    );
    expect(result.displayText).toBe("I can add that for you.");
    expect(result.commandText).toBe(
      "Add a task to call the organiser, due Friday"
    );
  });
});

describe("isAssistantMode", () => {
  it("accepts known modes", () => {
    expect(isAssistantMode("chat")).toBe(true);
    expect(isAssistantMode("draft_email")).toBe(true);
    expect(isAssistantMode("nope")).toBe(false);
  });
});
