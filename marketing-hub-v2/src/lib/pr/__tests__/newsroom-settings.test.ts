import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEWSROOM_SETTINGS,
  normalizeNewsroomSettings,
} from "@/lib/pr/newsroom-settings";

describe("newsroom settings", () => {
  it("replaces the retired default copy and keeps a custom description", () => {
    const retired = normalizeNewsroomSettings({
      homepage_greetings:
        "Welcome to our newsroom, the latest updates, stories and insights from Peters & May.",
      description:
        "Peters & May is a global specialist in bespoke logistics, providing yacht transport, freight forwarding, commercial marine transport and project cargo solutions by sea, road and air. Our newsroom shares the latest company updates, press releases, case studies, expert insights and media resources from across the Peters & May Group. For more information about our services, visit our main website: www.petersandmay.com",
    });
    expect(retired.homepage_greetings).toBe(
      DEFAULT_NEWSROOM_SETTINGS.homepage_greetings
    );
    expect(retired.description).toBe(DEFAULT_NEWSROOM_SETTINGS.description);
    expect(retired.description).toContain(
      "brings experienced thinking to complex logistics"
    );

    const custom = normalizeNewsroomSettings({
      description: "A custom newsroom note.",
    });
    expect(custom.description).toBe("A custom newsroom note.");
  });
});
