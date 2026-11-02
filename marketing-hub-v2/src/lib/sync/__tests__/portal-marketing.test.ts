import { describe, expect, it } from "vitest";
import { parseUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import {
  hubCampaignUrl,
  hubContactRecordUrl,
  hubEmailPreviewUrl,
} from "@/lib/sync/portal-marketing";

describe("hub record urls", () => {
  it("points a portal client at the hub contact", () => {
    const url = hubContactRecordUrl("ctc_123");
    expect(url).toContain("/app/contacts?id=ctc_123");
    expect(url.startsWith("http")).toBe(true);
  });

  it("points a campaign tag at the hub email screen", () => {
    expect(hubCampaignUrl("camp 1")).toContain("/app/email?campaign=camp%201");
  });

  it("points a portal log at the email that person was sent", () => {
    const url = hubEmailPreviewUrl({
      email: "A@Example.com",
      campaignId: "camp-1",
      contactId: "ctc_1",
    });
    expect(url).toMatch(/^https?:\/\/.+\/email\/view\?token=/);
    expect(new URL(url).searchParams.get("preview")).toBe("1");
    const token = new URL(url).searchParams.get("token") ?? "";
    expect(parseUnsubscribeToken(token)).toMatchObject({
      email: "a@example.com",
      campaignId: "camp-1",
      contactId: "ctc_1",
    });
  });
});
