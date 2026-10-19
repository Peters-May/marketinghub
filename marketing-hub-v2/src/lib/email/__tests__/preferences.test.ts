import { describe, expect, it } from "vitest";
import {
  normalizeTopicOptOuts,
  topicForAudienceName,
} from "@/lib/email/preferences";

describe("topicForAudienceName", () => {
  it("maps the mailing lists used on the preference page", () => {
    expect(topicForAudienceName("USA Sailing Schedules One Offs")).toBe("sailing_schedules");
    expect(topicForAudienceName("Sailing Schedule Updates")).toBe("sailing_schedules");
    expect(topicForAudienceName("Freight Forwarding")).toBe("freight_forwarding");
    expect(topicForAudienceName("HubSpot Commercial Marine")).toBe("commercial_marine");
    expect(topicForAudienceName("General Marketing Updates")).toBe("general_marketing");
    expect(topicForAudienceName("Newsletter")).toBe("general_marketing");
    expect(topicForAudienceName("Yacht Brokers")).toBeNull();
  });
});

describe("normalizeTopicOptOuts", () => {
  it("keeps known lists and drops anything else", () => {
    expect(
      normalizeTopicOptOuts(["sailing_schedules", "nope", "sailing_schedules", "freight_forwarding"])
    ).toEqual(["sailing_schedules", "freight_forwarding"]);
    expect(normalizeTopicOptOuts(null)).toEqual([]);
  });
});
