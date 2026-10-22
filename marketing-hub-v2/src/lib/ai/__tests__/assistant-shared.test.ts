import { describe, expect, it } from "vitest";
import {
  extractHubCommand,
  isAssistantMode,
  isHubRunConfirmation,
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

describe("isHubRunConfirmation", () => {
  it("accepts a short approval", () => {
    expect(isHubRunConfirmation("do it")).toBe(true);
    expect(isHubRunConfirmation("yes do it")).toBe(true);
    expect(isHubRunConfirmation("Yes, sounds good.")).toBe(true);
    expect(isHubRunConfirmation("yes sounds good")).toBe(true);
    expect(isHubRunConfirmation("go ahead")).toBe(true);
    expect(isHubRunConfirmation("add them")).toBe(true);
    expect(isHubRunConfirmation("please confirm to proceed")).toBe(true);
  });

  it("rejects a new request that merely starts with yes", () => {
    expect(isHubRunConfirmation("yes, but change the date to March")).toBe(
      false
    );
    expect(isHubRunConfirmation("Add an event Monaco in September")).toBe(
      false
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
