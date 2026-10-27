import { describe, expect, it } from "vitest";
import {
  mergeAttendanceLabel,
  splitProposedAttendance,
} from "@/lib/command/attendance";
import { parseHubCommand, parseHubCommands } from "@/lib/command/parse";

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

  it("adds an event when the type comes at the end", () => {
    const parsed = parseHubCommand(
      "Add Yacht Chandlers Party 30th October as an event",
      new Date(2026, 9, 13, 12, 0, 0)
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "create_event") return;
    expect(parsed.command.title).toBe("Yacht Chandlers Party");
    expect(parsed.command.starts_at).toBe("2026-10-30");
    expect(parsed.command.summary).toContain("30 Oct 2026");
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

  it("adds a social post on a day of the month", () => {
    const parsed = parseHubCommand(
      "Add a social post for the 31st called test",
      new Date(2026, 9, 12, 12, 0, 0)
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "create_content") return;
    expect(parsed.command.title).toBe("test");
    expect(parsed.command.due_date).toBe("2026-10-31");
    expect(parsed.command.summary).toContain("due 31 Oct 2026");
  });

  it("rolls a bare day forward when that day has passed", () => {
    const parsed = parseHubCommand(
      "Add a task for the 5th called follow up",
      new Date(2026, 9, 12, 12, 0, 0)
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "create_task") return;
    expect(parsed.command.due_date).toBe("2026-11-05");
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

  it("links a post to an event by exact title", () => {
    const parsed = command(
      'Link post "Monaco stand setup" to event "Monaco Yacht Show"'
    );
    expect(parsed.kind).toBe("link_content");
    if (parsed.kind !== "link_content") return;
    expect(parsed.content_query).toBe("Monaco stand setup");
    expect(parsed.event_query).toBe("Monaco Yacht Show");
    expect(parsed.summary).toContain("Monaco stand setup");
    expect(parsed.source).toContain("Link post");
  });

  it("keeps each link line when several posts are proposed", () => {
    const result = parseHubCommands(
      [
        'Link post "Stand photo" to event "Monaco Yacht Show"',
        'Link the social media post "Arrival day" to the event "Monaco Yacht Show"',
        "Add a task to call the organiser, due Friday",
      ].join("\n"),
      now
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.commands.map((item) => item.kind)).toEqual([
      "link_content",
      "link_content",
      "create_task",
    ]);
    expect(result.skipped).toEqual([]);
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

  it("reads each line of a block and skips lines it cannot run", () => {
    const result = parseHubCommands(
      `1. Add an event Monaco Yacht Show on 24 Sep 2026 in Monaco
2. Update attendance for Düsseldorf with Simon
3. Add an event Genoa Boat Show on 18 Sep 2026 in Genoa`,
      now
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0].kind).toBe("create_event");
    expect(result.commands[1].kind).toBe("create_event");
    expect(result.skipped).toEqual([
      "Update attendance for Düsseldorf with Simon",
    ]);
  });

  it("reads a country marketing list", () => {
    const parsed = command("Add a marketing list for the USA");
    expect(parsed.kind).toBe("create_marketing_list");
    if (parsed.kind !== "create_marketing_list") return;
    expect(parsed.country).toBe("USA");
    expect(parsed.name).toBe("USA marketing contacts");
    const named = command(
      'Create a client list for all marketing contacts based in France called "French yards"'
    );
    expect(named.kind).toBe("create_marketing_list");
    if (named.kind !== "create_marketing_list") return;
    expect(named.country).toBe("France");
    expect(named.name).toBe("French yards");
  });

  it("asks for a clearer instruction", () => {
    const result = parseHubCommand("hello there", now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.examples.length).toBeGreaterThan(0);
  });

  it("adds an event with a date range and proposed attendance", () => {
    const parsed = command(
      "Add an event Düsseldorf on 23 - 31 Jan in Düsseldorf attending Simon, Cass, maybe Racing"
    );
    expect(parsed.kind).toBe("create_event");
    if (parsed.kind !== "create_event") return;
    expect(parsed.title).toBe("Düsseldorf");
    expect(parsed.starts_at).toBe("2027-01-23");
    expect(parsed.ends_at).toBe("2027-01-31");
    expect(parsed.date_status).toBe("confirmed");
    expect(parsed.location).toBe("Düsseldorf");
    expect(parsed.attending).toBe("Simon, Cass, maybe Racing");
    expect(parsed.summary).toContain("23–31 Jan 2027");
    expect(parsed.summary).toContain("attending Simon, Cass, maybe Racing");
  });

  it("reads a day written as 01-Feb and a month-only date", () => {
    const day = command("Add an event Gothenburg on 01-Feb attending Jesper");
    expect(day.kind).toBe("create_event");
    if (day.kind !== "create_event") return;
    expect(day.starts_at).toBe("2027-02-01");
    expect(day.ends_at).toBeNull();
    expect(day.attending).toBe("Jesper");

    const month = command("Add an event Dubai in February attending Jack");
    expect(month.kind).toBe("create_event");
    if (month.kind !== "create_event") return;
    expect(month.title).toBe("Dubai");
    expect(month.starts_at).toBe("2027-02-01");
    expect(month.ends_at).toBe("2027-02-28");
    expect(month.date_status).toBe("provisional");
    expect(month.location).toBe("");
    expect(month.attending).toBe("Jack");
  });

  it("reads a two-month span and keeps on inside the title", () => {
    const span = command(
      "Add an event Palma in April / May attending Elo, Inma, Richard"
    );
    expect(span.kind).toBe("create_event");
    if (span.kind !== "create_event") return;
    expect(span.starts_at).toBe("2027-04-01");
    expect(span.ends_at).toBe("2027-05-31");
    expect(span.date_status).toBe("provisional");
    expect(span.attending).toBe("Elo, Inma, Richard");

    const titled = command(
      "Add an event Istanbul on land (Bosphorus BS) on 21-28 Feb attending Caner + Team, Stefano"
    );
    expect(titled.kind).toBe("create_event");
    if (titled.kind !== "create_event") return;
    expect(titled.title).toBe("Istanbul on land (Bosphorus BS)");
    expect(titled.starts_at).toBe("2027-02-21");
    expect(titled.ends_at).toBe("2027-02-28");
    expect(titled.attending).toBe("Caner + Team, Stefano");
  });

  it("updates proposed attendance on an existing event", () => {
    const parsed = command(
      "Update event Monaco Yacht Show attending Stefano, Simon"
    );
    expect(parsed.kind).toBe("update_event");
    if (parsed.kind !== "update_event") return;
    expect(parsed.query).toBe("Monaco Yacht Show");
    expect(parsed.attending).toBe("Stefano, Simon");
    expect(parsed.summary).toBe(
      'Update event "Monaco Yacht Show", attending Stefano, Simon.'
    );
  });

  it("splits people joined with and", () => {
    const parsed = command(
      "Update event Metstrade attending Ana Navarro and Giulia Fichera"
    );
    expect(parsed.kind).toBe("update_event");
    if (parsed.kind !== "update_event") return;
    expect(parsed.attending).toBe("Ana Navarro and Giulia Fichera");
    expect(
      splitProposedAttendance(parsed.attending).people.map((person) => person.name)
    ).toEqual(["Ana Navarro", "Giulia Fichera"]);
    expect(
      mergeAttendanceLabel("Nicky, Paul Everley", parsed.attending)
    ).toBe("Nicky, Paul Everley, Ana Navarro, Giulia Fichera");
  });

  it("checks We are attending without treating it as a person's name", () => {
    const quoted = command(
      'Update event Valencia Boat Show to "we are attending"'
    );
    expect(quoted.kind).toBe("update_event");
    if (quoted.kind !== "update_event") return;
    expect(quoted.query).toBe("Valencia Boat Show");
    expect(quoted.patch.pm_attending).toBe(true);
    expect(quoted.attending).toBe("");

    const bulk = command(
      "Update events with someone attending we are attending"
    );
    expect(bulk.kind).toBe("mark_events_we_are_attending");
    expect(bulk.summary).toContain("We are attending");
  });

  it("reads a full proposed attendance list", () => {
    const block = `
Add an event Thailand Phuket on 14-17 Jan 2027 in Phuket attending Charles
Add an event Düsseldorf on 23-31 Jan 2027 in Düsseldorf attending Simon, Cass, Richard, Inge, Sergee, Pascal, Loic, Stefano, Jesper, Luca, Luke, Kristina, maybe Racing
Add an event Gothenburg on 01-Feb 2027 attending Jesper
Add an event Helsinki on 6-15 Feb 2027 attending Jesper
Add an event Miami on 10-14 Feb 2027 attending Pascal, Simon, Chris
Add an event Istanbul on land (Bosphorus BS) on 21-28 Feb 2027 attending Caner + Team, Stefano
Add an event ExpoShipping Turkey (Commercial) on 23-26 February 2027 attending Robert
Add an event Dubai in February 2027 attending Jack
Add an event Stockholm in March 2027 attending Jesper
Add an event West Palm Beach on 17-21 March 2027 attending Chris, Kristina
Add an event Yokohama Japan BS on 18-21 March 2027 attending Charles, Luke
Add an event Shanghai China Intl BS on 28-30 March 2027
Add an event Fredericia BS Denmark on 7-9 May 2027 attending Jesper
Add an event Palma in April / May 2027 attending Elo, Inma, Richard, Kristina
Add an event Southeast Asia (SEA) Yachting Conference Singapore in April 2027 attending Charles
Add an event La Grande Motte in April 2027 attending Pascal
Add an event Singapore Yachting Festival on 22-25 April 2027 attending Charles
Add an event Annapolis Sail on 23-25 April 2027 attending Pascal
Add an event Med Yacht Show Nafp. Greece on 8-12 May 2027 attending Stefano
Add an event British MY Show Swanwick on 20-23 May 2027 attending Richard
Add an event Sanctuary Cove on 20-23 May 2027 attending Luke, Charles
Add an event South Coast + Green Tech Ocean Village in May 2027 attending Richard
Add an event Newport Charter Show in June 2027 attending TBC
Add an event Polboat Gdynia PL in July 2027 attending TBC
Add an event Karlshamn SE on 20-22 Aug 2027 attending Jesper
Add an event Oslo on 2-5 Sept 2027 attending Jesper
Add an event Cannes on 7-12 Sept 2027 attending Simon, Cass, Richard, Inge, Sergee, Pascal, Loic, Stefano, Charles, Luca, Luke, Kristina, maybe Racing
Add an event Monaco in Sept 2027 attending Stefano, Simon
Add an event Genoa in Sept 2027 attending Luca
Add an event Southampton in Sept 2027 attending Richard + Team
Add an event La Rochelle in Sept 2027 attending Pascal, Loic
Add an event FLIBS in October 2027 attending Chris + Team, Kristina
Add an event Warsaw Poland in October 2027 attending TBC
Add an event Paris in November 2027 attending Pascal, Loic
Add an event METS in November 2027 attending FF, Racing, Kristina
`;
    const result = parseHubCommands(block, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([]);
    expect(result.commands).toHaveLength(35);
    const shanghai = result.commands.find(
      (command) => command.kind === "create_event" && command.title.startsWith("Shanghai")
    );
    expect(shanghai?.kind).toBe("create_event");
    if (shanghai?.kind !== "create_event") return;
    expect(shanghai.attending).toBe("");
    expect(shanghai.starts_at).toBe("2027-03-28");
    expect(shanghai.ends_at).toBe("2027-03-30");
  });
});
