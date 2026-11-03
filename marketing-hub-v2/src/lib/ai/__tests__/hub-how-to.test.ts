import { describe, expect, it } from "vitest";
import {
  formatHubHowToContext,
  howToForPath,
  searchHubHowTo,
} from "@/lib/ai/hub-how-to";

describe("hub how-to", () => {
  it("finds event cost guidance", () => {
    const topics = searchHubHowTo("How do I add an event cost?");
    expect(topics[0]?.id).toBe("add-event-cost");
    expect(topics[0]?.href).toBe("/app/events");
  });

  it("maps the current events path", () => {
    const page = howToForPath("/app/events");
    expect(page?.label).toBe("Events");
    expect(page?.href).toBe("/app/events");
  });

  it("includes pathname in the system context block", () => {
    const text = formatHubHowToContext({ pathname: "/app/tasks" });
    expect(text).toContain("Current page: Tasks");
    expect(text).toContain("/app/tasks");
  });
});
