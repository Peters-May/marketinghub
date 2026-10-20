import { describe, expect, it } from "vitest";
import { projectCampaignStatsFromEvents } from "@/lib/email/stats-projector";
import type { EmailEvent } from "@/lib/types";

function event(
  kind: EmailEvent["kind"],
  email: string,
  id = kind + email
): EmailEvent {
  return {
    id,
    campaign_id: "c1",
    contact_id: null,
    email,
    kind,
    resend_message_id: "",
    meta: "",
    link: "",
    user_agent: "",
    created_at: "2026-10-20T00:00:00.000Z",
  };
}

describe("projectCampaignStatsFromEvents", () => {
  it("counts unique recipients per event kind", () => {
    const stats = projectCampaignStatsFromEvents(
      [
        event("sent", "a@example.com"),
        event("sent", "b@example.com"),
        event("delivered", "a@example.com"),
        event("opened", "a@example.com"),
        event("opened", "a@example.com", "opened-dup"),
        event("clicked", "a@example.com"),
        event("bounced", "b@example.com"),
      ],
      { recipients: 2 }
    );
    expect(stats.recipients).toBe(2);
    expect(stats.delivered).toBe(1);
    expect(stats.opened).toBe(1);
    expect(stats.clicked).toBe(1);
    expect(stats.bounced).toBe(1);
  });
});
