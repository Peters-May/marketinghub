import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailCampaign } from "@/lib/types";

// In-memory hub store. updateStore runs one mutation at a time, like the real one.
const memory = vi.hoisted(() => ({ store: { email_campaigns: [] as unknown[] } }));

vi.mock("@/lib/store/local", () => {
  let chain: Promise<unknown> = Promise.resolve();
  const clone = () => JSON.parse(JSON.stringify(memory.store));
  return {
    readStore: async () => clone(),
    readStoreFresh: async () => clone(),
    updateStore: (mutator: (store: unknown) => unknown) => {
      const run = async () => {
        const next = clone();
        mutator(next);
        // Yield so racing callers interleave between read and write.
        await new Promise((resolve) => setTimeout(resolve, 1));
        memory.store = next;
        return next;
      };
      const result = chain.then(run, run);
      chain = result.catch(() => undefined);
      return result;
    },
  };
});

const repos = await import("@/lib/data/repos");

function seed(patch: Partial<EmailCampaign>) {
  memory.store = {
    email_campaigns: [
      {
        id: "ecamp_1",
        title: "Autumn",
        status: "draft",
        updated_at: new Date().toISOString(),
        ...patch,
      },
    ],
  };
}

describe("send claims", () => {
  beforeEach(() => seed({}));

  it("gives one claim when two callers race", async () => {
    const rule = { from: ["draft" as const] };
    const [a, b] = await Promise.all([
      repos.claimEmailCampaignSend("ecamp_1", rule),
      repos.claimEmailCampaignSend("ecamp_1", rule),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const campaign = await repos.getEmailCampaign("ecamp_1");
    expect(campaign?.status).toBe("sending");
    expect(campaign?.send_claim).toBe(a || b);
  });

  it("stops the runner after a cancel and keeps the cancelled status", async () => {
    const claim = (await repos.claimEmailCampaignSend("ecamp_1", { from: ["draft"] }))!;
    expect(await repos.holdEmailCampaignSend("ecamp_1", claim)).toBe(true);

    await repos.updateEmailCampaign("ecamp_1", { status: "cancelled" });
    expect(await repos.holdEmailCampaignSend("ecamp_1", claim)).toBe(false);
    expect(await repos.releaseEmailCampaignSend("ecamp_1", claim, { status: "sent" })).toBeNull();
    expect((await repos.getEmailCampaign("ecamp_1"))?.status).toBe("cancelled");
  });

  it("ignores claim fields sent through a normal update", async () => {
    const claim = (await repos.claimEmailCampaignSend("ecamp_1", { from: ["draft"] }))!;
    await repos.updateEmailCampaign("ecamp_1", { send_claim: "forged", subject: "New" });
    const campaign = await repos.getEmailCampaign("ecamp_1");
    expect(campaign?.send_claim).toBe(claim);
    expect(campaign?.subject).toBe("New");
  });

  it("releases the claim when the owner finishes", async () => {
    const claim = (await repos.claimEmailCampaignSend("ecamp_1", { from: ["draft"] }))!;
    const done = await repos.releaseEmailCampaignSend("ecamp_1", claim, { status: "sent" });
    expect(done?.status).toBe("sent");
    expect(done?.send_claim).toBe("");
    expect(await repos.claimEmailCampaignSend("ecamp_1", { from: ["sent" as never] })).toBeNull();
  });

  it("does not take a live send, but takes over a stalled one", async () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    seed({ status: "sending", send_claim: "send_old", send_heartbeat_at: recent });
    expect(await repos.claimEmailCampaignSend("ecamp_1", { from: ["sending"] })).toBeNull();

    const stale = new Date(Date.now() - 9 * 60_000).toISOString();
    seed({ status: "sending", send_claim: "send_old", send_heartbeat_at: stale });
    const claim = await repos.claimEmailCampaignSend("ecamp_1", { from: ["sending"] });
    expect(claim).toBeTruthy();
    expect(await repos.holdEmailCampaignSend("ecamp_1", "send_old")).toBe(false);
  });
});
