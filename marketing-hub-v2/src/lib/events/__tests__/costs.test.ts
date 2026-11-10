import { describe, expect, it } from "vitest";
import {
  canEditCostLine,
  canManageAllCostLines,
  costTotalsByCurrency,
  costsSheetPath,
  defaultCostsRequestDraft,
  filterVisibleCostLines,
  findCostRequestRecipient,
  parseCostAmount,
} from "@/lib/events/costs";

describe("parseCostAmount", () => {
  it("treats blank as not known yet", () => {
    expect(parseCostAmount("")).toBeNull();
    expect(parseCostAmount("  ")).toBeNull();
    expect(parseCostAmount(null)).toBeNull();
  });

  it("strips symbols and commas and rounds to pence", () => {
    expect(parseCostAmount("£1,240.505")).toBe(1240.51);
    expect(parseCostAmount("€ 86")).toBe(86);
    expect(parseCostAmount(12.345)).toBe(12.35);
  });

  it("rejects negative or non-numeric amounts", () => {
    expect(parseCostAmount("-5")).toBeUndefined();
    expect(parseCostAmount("abc")).toBeUndefined();
    expect(parseCostAmount(Number.NaN)).toBeUndefined();
  });
});

describe("canEditCostLine", () => {
  it("lets an admin edit any line", () => {
    expect(canEditCostLine({ staff_user_id: "u2" }, { id: "a1", isAdmin: true })).toBe(true);
    expect(canEditCostLine({ staff_user_id: null }, { id: "a1", isAdmin: true })).toBe(true);
  });

  it("lets a budget editor edit any line via canManageAll", () => {
    expect(
      canEditCostLine({ staff_user_id: "u2" }, { id: "b1", canManageAll: true })
    ).toBe(true);
    expect(canManageAllCostLines({ canManageAll: true })).toBe(true);
  });

  it("limits a member to their own lines", () => {
    const member = { id: "u1", isAdmin: false };
    expect(canEditCostLine({ staff_user_id: "u1" }, member)).toBe(true);
    expect(canEditCostLine({ staff_user_id: "u2" }, member)).toBe(false);
    expect(canEditCostLine({ staff_user_id: null }, member)).toBe(false);
  });
});

describe("filterVisibleCostLines", () => {
  const lines = [
    { id: "1", staff_user_id: "u1" },
    { id: "2", staff_user_id: "u2" },
    { id: "3", staff_user_id: null },
  ];

  it("returns every line for admins and budget editors", () => {
    expect(filterVisibleCostLines(lines, { id: "a1", canManageAll: true })).toEqual(lines);
    expect(filterVisibleCostLines(lines, { id: "a1", isAdmin: true })).toEqual(lines);
  });

  it("returns only the viewer's own lines for staff", () => {
    expect(filterVisibleCostLines(lines, { id: "u1", canManageAll: false })).toEqual([
      lines[0],
    ]);
    expect(filterVisibleCostLines(lines, { id: "u3", isAdmin: false })).toEqual([]);
  });
});

describe("costTotalsByCurrency", () => {
  it("sums per currency, skips blanks and keeps a fixed order", () => {
    expect(
      costTotalsByCurrency([
        { amount: 340, currency: "EUR" },
        { amount: 212.4, currency: "GBP" },
        { amount: null, currency: "EUR" },
        { amount: 1850, currency: "EUR" },
        { amount: 0.1, currency: "GBP" },
      ])
    ).toEqual([
      { currency: "GBP", total: 212.5 },
      { currency: "EUR", total: 2190 },
    ]);
  });
});

describe("costsSheetPath", () => {
  it("opens the event with the sheet", () => {
    expect(costsSheetPath("evt_1")).toBe("/app/events?open=evt_1&costs=1");
  });
});

describe("findCostRequestRecipient", () => {
  const users = [
    { email: "ada@petersandmay.com", role: "member" },
    { email: "seo@petersandmay.com", role: "seo" },
  ];

  it("matches an existing staff member regardless of case", () => {
    expect(findCostRequestRecipient(users, "Ada@PetersAndMay.com")).toEqual({
      person: users[0],
      onList: true,
    });
  });

  it("flags someone who is in the Hub but not on the costs list", () => {
    expect(findCostRequestRecipient(users, "seo@petersandmay.com")?.onList).toBe(false);
  });

  it("returns null when the email is new", () => {
    expect(findCostRequestRecipient(users, "new@petersandmay.com")).toBeNull();
    expect(findCostRequestRecipient(users, "  ")).toBeNull();
  });
});

describe("defaultCostsRequestDraft", () => {
  it("builds a personalised subject and message", () => {
    const draft = defaultCostsRequestDraft({
      eventTitle: "Boot Düsseldorf",
      recipientName: "Jesper Jensen",
      requestedBy: "Sophie Edgerley",
    });
    expect(draft.subject).toBe("Boot Düsseldorf");
    expect(draft.message).toContain("Hi Jesper,");
    expect(draft.message).toContain(
      "Please can you add your costs for Boot Düsseldorf in Marketing Hub."
    );
    expect(draft.message).toContain("Sophie Edgerley");
  });
});
