import { describe, expect, it } from "vitest";
import {
  audienceCopy,
  byLabelForDecision,
  matchShareAudience,
  normalizeShareReview,
} from "@/lib/share/review";

describe("audienceCopy", () => {
  it("uses client wording for client links", () => {
    expect(audienceCopy("client").pageTitle).toBe("Client approval");
    expect(audienceCopy("client").intro).toContain("your review");
    expect(audienceCopy("staff").pageTitle).toBe("Staff approval");
    expect(audienceCopy("staff").intro).toContain("staff");
  });
});

describe("matchShareAudience", () => {
  const token = "abcdefghij1234567890ab";
  const client = "clienttoken1234567890ab";

  it("resolves staff and client tokens", () => {
    expect(
      matchShareAudience({
        token,
        staffToken: token,
        staffEnabled: true,
        clientToken: client,
        clientEnabled: true,
      })
    ).toBe("staff");
    expect(
      matchShareAudience({
        token: client,
        staffToken: token,
        staffEnabled: true,
        clientToken: client,
        clientEnabled: true,
      })
    ).toBe("client");
    expect(
      matchShareAudience({
        token,
        staffToken: token,
        staffEnabled: false,
        clientToken: client,
        clientEnabled: true,
      })
    ).toBeNull();
  });
});

describe("normalizeShareReview", () => {
  it("requires approved-by name and keeps decision labels", () => {
    expect(
      normalizeShareReview({
        id: "srev_1",
        target_type: "content",
        target_id: "c1",
        decision: "approved",
        approved_by_name: "",
      })
    ).toBeNull();
    const review = normalizeShareReview({
      id: "srev_1",
      target_type: "content",
      target_id: "c1",
      decision: "changes_requested",
      approved_by_name: "Alex Client",
      approved_by_role: "Marketing lead",
      original_caption: "A",
      amended_caption: "B",
    });
    expect(review?.decision).toBe("changes_requested");
    expect(byLabelForDecision(review!.decision)).toBe("Reviewed by");
    expect(byLabelForDecision("approved")).toBe("Approved by");
  });
});
