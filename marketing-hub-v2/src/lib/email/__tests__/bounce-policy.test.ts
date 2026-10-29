import { describe, expect, it } from "vitest";
import {
  bounceListNote,
  HARD_BOUNCE_NOTE,
  shouldSuppressBounce,
  SOFT_BOUNCE_KEPT_NOTE,
  type BounceMark,
} from "@/lib/email/bounce-policy";
import { extractBounceClass } from "@/lib/email/resend-event";

function soft(messageId: string, createdAt: string): BounceMark {
  return {
    kind: "bounced",
    meta: "email.bounced:soft",
    createdAt,
    messageId,
  };
}

describe("bounce classification", () => {
  it("treats a permanent failure as a hard bounce", () => {
    expect(extractBounceClass({ bounce: { type: "Permanent" } })).toBe("hard");
  });

  it("treats a temporary or unknown failure as a soft bounce", () => {
    expect(extractBounceClass({ bounce: { type: "Transient", subType: "MailboxFull" } })).toBe(
      "soft"
    );
    expect(extractBounceClass({ bounce: { type: "Undetermined" } })).toBe("soft");
  });

  it("leaves the class empty when Resend did not classify the bounce", () => {
    expect(extractBounceClass({})).toBeNull();
  });
});

describe("bounce suppression", () => {
  it("removes a hard bounce straight away", () => {
    expect(
      shouldSuppressBounce({
        bounceClass: "hard",
        events: [soft("m1", "2026-10-01T00:00:00.000Z")],
      })
    ).toEqual({ suppress: true, softCount: 0 });
  });

  it("keeps the first two temporary bounces", () => {
    const once = shouldSuppressBounce({
      bounceClass: "soft",
      events: [soft("m1", "2026-10-01T00:00:00.000Z")],
    });
    const twice = shouldSuppressBounce({
      bounceClass: "soft",
      events: [
        soft("m1", "2026-10-01T00:00:00.000Z"),
        soft("m2", "2026-10-08T00:00:00.000Z"),
      ],
    });
    expect(once).toEqual({ suppress: false, softCount: 1 });
    expect(twice).toEqual({ suppress: false, softCount: 2 });
  });

  it("removes an address after three temporary bounces in a row", () => {
    expect(
      shouldSuppressBounce({
        bounceClass: "soft",
        events: [
          soft("m1", "2026-10-01T00:00:00.000Z"),
          soft("m2", "2026-10-08T00:00:00.000Z"),
          soft("m3", "2026-10-15T00:00:00.000Z"),
        ],
      })
    ).toEqual({ suppress: true, softCount: 3 });
  });

  it("starts the count again after a successful delivery", () => {
    expect(
      shouldSuppressBounce({
        bounceClass: "soft",
        events: [
          soft("m1", "2026-10-01T00:00:00.000Z"),
          soft("m2", "2026-10-08T00:00:00.000Z"),
          {
            kind: "delivered",
            meta: "email.delivered",
            createdAt: "2026-10-09T00:00:00.000Z",
            messageId: "m2b",
          },
          soft("m3", "2026-10-15T00:00:00.000Z"),
        ],
      })
    ).toEqual({ suppress: false, softCount: 1 });
  });

  it("counts one webhook retry as a single bounce", () => {
    expect(
      shouldSuppressBounce({
        bounceClass: "soft",
        events: [
          soft("m1", "2026-10-01T00:00:00.000Z"),
          soft("m1", "2026-10-01T00:00:01.000Z"),
        ],
      })
    ).toEqual({ suppress: false, softCount: 1 });
  });
});

describe("bounce list note", () => {
  it("says a temporary bounce is still on the list", () => {
    expect(bounceListNote("email.bounced:soft")).toBe(SOFT_BOUNCE_KEPT_NOTE);
    expect(bounceListNote("email.bounced:hard")).toBe(HARD_BOUNCE_NOTE);
    expect(bounceListNote("email.bounced")).toBeUndefined();
  });
});
