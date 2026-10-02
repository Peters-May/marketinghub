import { describe, expect, it } from "vitest";
import { parseHubCommand } from "@/lib/command/parse";

const now = new Date(2026, 9, 1, 12, 0, 0);

function command(text: string) {
  const result = parseHubCommand(text, now);
  if (!result.ok) throw new Error(result.message);
  return result.command;
}

describe("parseHubCommand", () => {
  it("adds a task with a weekday due date", () => {
    const parsed = command("Add a task to call the organiser, due Friday");
    expect(parsed.kind).toBe("create_task");
    if (parsed.kind !== "create_task") return;
    expect(parsed.title).toBe("call the organiser");
    expect(parsed.due_date).toBe("2026-10-02");
    expect(parsed.status).toBe("todo");
    expect(parsed.summary).toContain("due 2 Oct 2026");
  });

  it("adds an event with a date and location", () => {
    const parsed = command(
      "Add an event Monaco Yacht Show on 12 Oct 2026 in Monaco"
    );
    expect(parsed.kind).toBe("create_event");
    if (parsed.kind !== "create_event") return;
    expect(parsed.title).toBe("Monaco Yacht Show");
    expect(parsed.starts_at).toBe("2026-10-12");
    expect(parsed.location).toBe("Monaco");
  });

  it("adds a social post for next Friday by name", () => {
    const friday = new Date(2026, 9, 2, 12, 0, 0);
    const parsed = parseHubCommand(
      "Add a new social media post for next Friday called test hub",
      friday
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "create_content") return;
    expect(parsed.command.title).toBe("test hub");
    expect(parsed.command.due_date).toBe("2026-10-09");
    expect(parsed.command.channel).toEqual(["LinkedIn"]);
  });

  it("adds a LinkedIn post", () => {
    const parsed = command(
      "Add a LinkedIn post about autumn yacht moves, due next Tuesday"
    );
    expect(parsed.kind).toBe("create_content");
    if (parsed.kind !== "create_content") return;
    expect(parsed.title).toBe("autumn yacht moves");
    expect(parsed.channel).toEqual(["LinkedIn"]);
    expect(parsed.due_date).toBe("2026-10-06");
    expect(parsed.status).toBe("idea");
  });

  it("updates a task status", () => {
    const parsed = command("Update task call the organiser status done");
    expect(parsed.kind).toBe("update_task");
    if (parsed.kind !== "update_task") return;
    expect(parsed.query).toBe("call the organiser");
    expect(parsed.patch.status).toBe("done");
  });

  it("updates an event location", () => {
    const parsed = command(
      "Update event Monaco Yacht Show location Port Hercules"
    );
    expect(parsed.kind).toBe("update_event");
    if (parsed.kind !== "update_event") return;
    expect(parsed.query).toBe("Monaco Yacht Show");
    expect(parsed.patch.location).toBe("Port Hercules");
  });

  it("marks a task done", () => {
    const parsed = command("Mark the organiser task as done");
    expect(parsed.kind).toBe("update_task");
    if (parsed.kind !== "update_task") return;
    expect(parsed.query).toBe("organiser");
    expect(parsed.patch.status).toBe("done");
  });

  it("accepts a status after to", () => {
    const parsed = command("Update task call the organiser to done");
    expect(parsed.kind).toBe("update_task");
    if (parsed.kind !== "update_task") return;
    expect(parsed.patch.status).toBe("done");
  });

  it("reads a UK date", () => {
    const parsed = command("Add an event Boat show on 12/10/2026 in Southampton");
    expect(parsed.kind).toBe("create_event");
    if (parsed.kind !== "create_event") return;
    expect(parsed.starts_at).toBe("2026-10-12");
    expect(parsed.location).toBe("Southampton");
  });

  it("refuses publishing from the hub", () => {
    const result = parseHubCommand("Update post autumn moves status published", now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/Planable/);
  });

  it("asks for a clearer instruction", () => {
    const result = parseHubCommand("hello there", now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.examples.length).toBeGreaterThan(0);
  });
});
