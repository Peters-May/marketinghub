import { describe, expect, it } from "vitest";
import { budgetThresholds, spendForLine } from "@/lib/budget/totals";
import { buildDashboard } from "@/lib/dashboard/build";
import { enquiryRoutingGap } from "@/lib/enquiries/routing";
import { buildPrPipeline } from "@/lib/pr/pipeline";
import type {
  AwardEntry,
  BudgetLine,
  BudgetPayment,
  ContentItem,
  PrCoverage,
  PrPitch,
} from "@/lib/types";

function release(
  partial: Partial<ContentItem> & Pick<ContentItem, "id" | "title" | "status">
): ContentItem {
  return {
    channel: ["PR"],
    content_type: "pr",
    owner: "",
    due_date: null,
    deadline_date: null,
    category: "press release",
    priority: "",
    website: "",
    caption: "",
    theme_id: null,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "",
    asset_url: "",
    notes: "",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

function pitch(contentId: string): PrPitch {
  return {
    id: "pitch-1",
    title: "Pitch",
    subject: "",
    body: "",
    status: "draft",
    channel: "pr",
    preview_text: "",
    from_name: "",
    from_email: "",
    campaign_tag: "",
    theme_id: null,
    media_list_id: null,
    list_ids: [],
    recipient_ids: [],
    content_id: contentId,
    event_id: null,
    exported_at: null,
    hubspot_url: "",
    parent_draft_id: null,
    notes: "",
    created_by: "",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

function coverage(partial: Pick<PrCoverage, "id" | "pitch_id" | "content_id">): PrCoverage {
  return {
    title: "Clip",
    url: "",
    outlet: "",
    published_at: null,
    sentiment: "",
    notes: "",
    event_id: null,
    monitor_mention_id: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

function line(): BudgetLine {
  return {
    id: "line-1",
    name: "Shows",
    code: "",
    group: "committed",
    planned: 200,
    marketing: null,
    sponsorship: null,
    travel: null,
    prior_year: null,
    notes: "",
    sort_order: 0,
    children: [],
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

function payment(
  partial: Pick<BudgetPayment, "id" | "amount" | "status">
): BudgetPayment {
  return {
    budget_line_id: "line-1",
    paid_at: null,
    supplier: "",
    description: "",
    invoice_url: "",
    created_by: "",
    created_by_user_id: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

describe("phase 4", () => {
  it("moves a release from approved, to pitched, to coverage", () => {
    const approved = release({
      id: "rel-1",
      title: "Monaco release",
      status: "review",
    });
    expect(
      buildPrPipeline({ content: [approved], pitches: [], coverage: [] })[0]
        ?.stage
    ).toBe("release");
    expect(
      buildPrPipeline({
        content: [approved],
        pitches: [pitch("rel-1")],
        coverage: [],
      })[0]?.stage
    ).toBe("pitched");
    expect(
      buildPrPipeline({
        content: [approved],
        pitches: [pitch("rel-1")],
        coverage: [
          coverage({ id: "clip-1", pitch_id: "pitch-1", content_id: null }),
        ],
      })[0]?.stage
    ).toBe("coverage");
    expect(
      buildPrPipeline({
        content: [
          release({ id: "draft-1", title: "Draft", status: "draft" }),
        ],
        pitches: [],
        coverage: [],
      })
    ).toEqual([]);
  });

  it("leaves an unverified award date unverified and does not invent one", () => {
    const dated: AwardEntry = {
      id: "aw-1",
      title: "Logistics award",
      organisation: "",
      category: "",
      year: 2026,
      status: "watching",
      submission_deadline: "2026-11-01",
      ceremony_at: null,
      owner: "",
      event_id: null,
      notes: "",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    };
    const undated: AwardEntry = {
      ...dated,
      id: "aw-2",
      title: "Open award",
      submission_deadline: null,
    };
    const model = buildDashboard({
      now: new Date("2026-10-22T09:00:00.000Z"),
      viewer: { id: "u1", fullName: "Sophie Edgerley", isAdmin: true },
      scope: "everyone",
      tasks: [],
      content: [],
      events: [],
      attendance: [],
      awards: [dated, undated],
      enquiries: [],
      emails: [],
      budget: null,
    });
    const datedRow = model.actions.find((row) => row.key === "award:aw-1");
    const openRow = model.actions.find((row) => row.key === "award:aw-2");
    expect(datedRow?.reason).toBe("Award deadline, date not verified");
    expect(datedRow?.when).toContain("1 Nov");
    expect(dated.submission_deadline).toBe("2026-11-01");
    expect(dated.deadline_verified).toBeUndefined();
    expect(openRow?.reason).toBe("Award needs research");
    expect(openRow?.when).toBeNull();
    expect(undated.submission_deadline).toBeNull();
  });

  it("counts paid and committed once, and flags a line near its plan", () => {
    const spend = spendForLine(line(), [
      payment({ id: "pay-1", amount: 100, status: "paid" }),
      payment({ id: "pay-2", amount: 80, status: "committed" }),
    ]);
    expect(spend.paid).toBe(100);
    expect(spend.pending).toBe(80);
    expect(spend.used).toBe(180);
    expect(spend.remaining).toBe(20);
    const totals = {
      planned: 200,
      paid: 100,
      pending: 80,
      remaining: 20,
      overBudgetCount: 0,
      byGroup: {
        committed: { planned: 200, paid: 100, pending: 80, remaining: 20 },
        uncommitted: { planned: 0, paid: 0, pending: 0, remaining: 0 },
      },
      byLine: { "line-1": spend },
    };
    expect(budgetThresholds(totals).map((row) => row.lineId)).toEqual([
      "line-1",
    ]);
  });

  it("flags an open enquiry with no office, and leaves a routed one alone", () => {
    expect(
      enquiryRoutingGap({
        status: "new",
        selected_office: "",
        needs_manual_review: false,
      })
    ).toBe("no office");
    expect(
      enquiryRoutingGap({
        status: "done",
        selected_office: "",
        needs_manual_review: true,
      })
    ).toBeNull();
    expect(
      enquiryRoutingGap({
        status: "new",
        selected_office: "UK",
        needs_manual_review: false,
      })
    ).toBeNull();
  });
});
