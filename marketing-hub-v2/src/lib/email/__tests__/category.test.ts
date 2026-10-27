import { describe, expect, it } from "vitest";
import {
  emailCampaignCategory,
  isMarketingInboxCampaign,
  isPitchCampaign,
  isPitchTabCampaign,
} from "@/lib/email/category";
import { PRESS_PITCH_TEMPLATE_ID } from "@/lib/pr/pitch-email";

describe("email campaign category", () => {
  it("keeps an explicit category", () => {
    expect(emailCampaignCategory({ category: "marketing", folder: "Press" })).toBe(
      "marketing"
    );
    expect(emailCampaignCategory({ category: "pitch", folder: "Yacht" })).toBe(
      "pitch"
    );
  });

  it("treats older press pitches as pitches", () => {
    expect(emailCampaignCategory({ folder: "Press" })).toBe("pitch");
    expect(
      emailCampaignCategory({ template_id: PRESS_PITCH_TEMPLATE_ID })
    ).toBe("pitch");
    expect(isPitchCampaign({ folder: "Press" })).toBe(true);
  });

  it("keeps release sends and blank emails as marketing", () => {
    expect(emailCampaignCategory({ folder: "Commercial" })).toBe("marketing");
    expect(emailCampaignCategory({ folder: "Forwarding" })).toBe("marketing");
    expect(emailCampaignCategory({})).toBe("marketing");
    expect(isPitchCampaign({ folder: "Commercial" })).toBe(false);
  });

  it("keeps imported press sends off the marketing inbox", () => {
    const release = { id: "ecamp_rel_nl_uk", folder: "Forwarding", category: "marketing" as const };
    const newsletter = { id: "ecamp_asia", folder: "Yacht", category: "marketing" as const };
    expect(isPitchTabCampaign(release)).toBe(true);
    expect(isMarketingInboxCampaign(release)).toBe(false);
    expect(isMarketingInboxCampaign(newsletter)).toBe(true);
    expect(isPitchTabCampaign({ id: "ecamp_pitch", category: "pitch" })).toBe(true);
  });
});
