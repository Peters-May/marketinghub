import { describe, expect, it } from "vitest";
import {
  assistantModeAllowedForRole,
  ensureNamedAttendanceCommand,
  extractHubCommand,
  isAssistantMode,
  isHubRunConfirmation,
  parseAddAttendeesRequest,
  stripConfirmPromptNoise,
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

  it("strips redundant confirm wording from display text", () => {
    const result = extractHubCommand(
      `I will update the travel details.\n\nHere's the command:\n\n:::hub-command\nUpdate event Boot Düsseldorf travel notes Flight cost\n:::\n\nPress Confirm, or type do it.`
    );
    expect(result.displayText).toBe("I will update the travel details.");
    expect(result.commandText).toBe(
      "Update event Boot Düsseldorf travel notes Flight cost"
    );
  });
});

describe("assistantModeAllowedForRole", () => {
  it("allows admins every mode and restricts members", () => {
    expect(assistantModeAllowedForRole("draft_email", "admin")).toBe(true);
    expect(assistantModeAllowedForRole("draft_social", "admin")).toBe(true);
    expect(assistantModeAllowedForRole("chat", "staff")).toBe(true);
    expect(assistantModeAllowedForRole("rewrite", "staff")).toBe(true);
    expect(assistantModeAllowedForRole("draft_email", "staff")).toBe(false);
    expect(assistantModeAllowedForRole("draft_social", "staff")).toBe(false);
  });
});

describe("stripConfirmPromptNoise", () => {
  it("removes here's the command lines", () => {
    expect(stripConfirmPromptNoise("Here's the command:\nReady.")).toBe(
      "Ready."
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

describe("named attendance requests", () => {
  it("reads people added with and", () => {
    expect(
      parseAddAttendeesRequest(
        "Add Ana Navarro and Giulia Fichera as attending Metstrade"
      )
    ).toEqual({
      event: "Metstrade",
      people: "Ana Navarro, Giulia Fichera",
    });
  });

  it("replaces a We are attending command with the named people", () => {
    const reply = ensureNamedAttendanceCommand(
      "add Ana Navarro, Giulia Fichera as attending metstrade",
      `We are attending was already checked.\n\n:::hub-command\nUpdate events with someone attending we are attending\n:::`
    );
    const extracted = extractHubCommand(reply);
    expect(extracted.commandText).toBe(
      "Update event metstrade attending Ana Navarro, Giulia Fichera"
    );
    expect(extracted.displayText).not.toMatch(/we are attending/i);
  });

  it("keeps a command that already adds those people", () => {
    const reply = `Add them to Metstrade.\n\n:::hub-command\nUpdate event Metstrade attending Ana Navarro, Giulia Fichera\n:::`;
    expect(
      ensureNamedAttendanceCommand(
        "Add Ana Navarro and Giulia Fichera as attending Metstrade",
        reply
      )
    ).toBe(reply);
  });

  it("reads a fence with two colons", () => {
    const result = extractHubCommand(
      "Add them.\n\n::hub-command\nUpdate event Metstrade attending Ana Navarro, Giulia Fichera\n::"
    );
    expect(result.commandText).toBe(
      "Update event Metstrade attending Ana Navarro, Giulia Fichera"
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
