import { describe, expect, it } from "vitest";
import {
  canEditCostLine,
  costTotalsByCurrency,
  costsSheetPath,
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

  it("limits a member to their own lines", () => {
    const member = { id: "u1", isAdmin: false };
    expect(canEditCostLine({ staff_user_id: "u1" }, member)).toBe(true);
    expect(canEditCostLine({ staff_user_id: "u2" }, member)).toBe(false);
    expect(canEditCostLine({ staff_user_id: null }, member)).toBe(false);
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
