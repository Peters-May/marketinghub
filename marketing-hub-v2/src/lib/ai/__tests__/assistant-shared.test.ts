import { describe, expect, it } from "vitest";
import {
  ensureNamedAttendanceCommand,
  extractHubCommand,
  isAssistantMode,
  isHubRunConfirmation,
  parseAddAttendeesRequest,
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
