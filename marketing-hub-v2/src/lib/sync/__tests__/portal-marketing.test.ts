import { describe, expect, it } from "vitest";
import { hubCampaignUrl, hubContactRecordUrl } from "@/lib/sync/portal-marketing";

describe("hub record urls", () => {
  it("points a portal client at the hub contact", () => {
    const url = hubContactRecordUrl("ctc_123");
    expect(url).toContain("/app/contacts?id=ctc_123");
    expect(url.startsWith("http")).toBe(true);
  });

  it("points a campaign tag at the hub email screen", () => {
    expect(hubCampaignUrl("camp 1")).toContain("/app/email?campaign=camp%201");
  });
});
