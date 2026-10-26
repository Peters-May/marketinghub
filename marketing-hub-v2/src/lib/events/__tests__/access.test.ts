import { describe, expect, it } from "vitest";
import { canDeleteEvent } from "@/lib/events/access";

describe("canDeleteEvent", () => {
  const member = { id: "user-1", role: "staff" as const };

  it("lets an admin delete an event they did not create", () => {
    expect(
      canDeleteEvent(
        { created_by: "someone-else" },
        { id: "admin-1", role: "admin" }
      )
    ).toBe(true);
  });

  it("lets a member delete an event they created", () => {
    expect(canDeleteEvent({ created_by: "user-1" }, member)).toBe(true);
  });

  it("refuses a member delete when the event was imported or created by someone else", () => {
    expect(canDeleteEvent({ created_by: null }, member)).toBe(false);
    expect(canDeleteEvent({ created_by: "user-2" }, member)).toBe(false);
  });
});
