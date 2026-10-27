import { describe, expect, it } from "vitest";
import {
  batchIdempotencyKey,
  canClaimSend,
  holdsSend,
  SEND_LOCK_MS,
  sendLockExpired,
} from "@/lib/email/send-lock";

const NOW = Date.parse("2026-10-27T12:00:00Z");

function campaign(patch: Record<string, unknown> = {}) {
  return {
    status: "draft" as const,
    updated_at: new Date(NOW).toISOString(),
    scheduled_at: null,
    send_claim: "",
    send_heartbeat_at: null,
    ...patch,
  } as Parameters<typeof canClaimSend>[0];
}

describe("send lock", () => {
  it("uses the heartbeat, not updated_at, to judge a running send", () => {
    const stale = new Date(NOW - SEND_LOCK_MS - 1000).toISOString();
    const fresh = new Date(NOW - 5000).toISOString();
    // An edit bumps updated_at but must not hide a stopped send.
    expect(
      sendLockExpired(campaign({ status: "sending", updated_at: fresh, send_heartbeat_at: stale }), NOW)
    ).toBe(true);
    expect(
      sendLockExpired(campaign({ status: "sending", updated_at: stale, send_heartbeat_at: fresh }), NOW)
    ).toBe(false);
  });

  it("does not let a second runner take a live send", () => {
    const live = campaign({
      status: "sending",
      send_claim: "send_a",
      send_heartbeat_at: new Date(NOW - 30_000).toISOString(),
    });
    expect(canClaimSend(live, { from: ["scheduled", "sending"] }, NOW)).toBe(false);
  });

  it("lets a runner take over a stalled send", () => {
    const stalled = campaign({
      status: "sending",
      send_claim: "send_a",
      send_heartbeat_at: new Date(NOW - SEND_LOCK_MS - 1).toISOString(),
    });
    expect(canClaimSend(stalled, { from: ["scheduled", "sending"] }, NOW)).toBe(true);
  });

  it("never claims a sent campaign, and respects the allowed statuses", () => {
    expect(canClaimSend(campaign({ status: "sent" }), { from: ["sent" as never] }, NOW)).toBe(false);
    expect(canClaimSend(campaign({ status: "cancelled" }), { from: ["scheduled"] }, NOW)).toBe(false);
    expect(canClaimSend(campaign({ status: "draft" }), { from: ["draft"] }, NOW)).toBe(true);
  });

  it("only claims a scheduled campaign once it is due", () => {
    const later = campaign({ status: "scheduled", scheduled_at: new Date(NOW + 60_000).toISOString() });
    const due = campaign({ status: "scheduled", scheduled_at: new Date(NOW - 60_000).toISOString() });
    expect(canClaimSend(later, { from: ["scheduled"], dueOnly: true }, NOW)).toBe(false);
    expect(canClaimSend(due, { from: ["scheduled"], dueOnly: true }, NOW)).toBe(true);
  });

  it("drops ownership after a cancel or a takeover", () => {
    const owned = campaign({ status: "sending", send_claim: "send_a" });
    expect(holdsSend(owned, "send_a")).toBe(true);
    expect(holdsSend(owned, "send_b")).toBe(false);
    expect(holdsSend(campaign({ status: "cancelled", send_claim: "send_a" }), "send_a")).toBe(false);
    expect(holdsSend(campaign({ status: "sending", send_claim: "" }), "")).toBe(false);
  });
});

describe("batchIdempotencyKey", () => {
  it("is the same for the same run and recipients, in any order or case", () => {
    const a = batchIdempotencyKey("ecamp_1", "send_a", ["b@x.com", "A@x.com"]);
    const b = batchIdempotencyKey("ecamp_1", "send_a", ["a@x.com", " b@x.com "]);
    expect(a).toBe(b);
  });

  it("changes with the recipients or the run, and stays within Resend's limit", () => {
    const base = batchIdempotencyKey("ecamp_1", "send_a", ["a@x.com"]);
    expect(batchIdempotencyKey("ecamp_1", "send_a", ["a@x.com", "c@x.com"])).not.toBe(base);
    expect(batchIdempotencyKey("ecamp_1", "send_b", ["a@x.com"])).not.toBe(base);
    expect(batchIdempotencyKey("e".repeat(500), "s".repeat(500), ["a@x.com"]).length).toBeLessThanOrEqual(256);
  });
});
