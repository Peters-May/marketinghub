import type { BudgetLine, BudgetPayment } from "@/lib/types";
import p10Rows from "@/lib/budget/p10-marketing-2026.json";

type P10Row = {
  paid_at: string | null;
  code: string;
  job: string;
  period: string;
  amount: number;
};

/** Map a finance marketing code to the 2026 budget line draft id. */
export function draftIdForMarketingCode(code: string): string | null {
  const compact = code.trim().toUpperCase().replace(/\s+/g, "");
  if (!compact) return null;
  if (compact === "MP3") return null;
  if (compact === "MS1" || compact === "MSI") return "ms1";
  if (compact === "MS2") return "ms2";
  if (compact === "MP1") return "video";
  if (compact === "MP2") return "mp2";
  if (compact === "MM") return "memberships";
  if (compact === "MC") return "mc";
  if (compact === "ME") return "me";
  if (compact.startsWith("MB") || compact === "M8") return "mbx";
  if (compact.startsWith("MTG")) return "mtg";
  if (compact.startsWith("MT") || compact === "MTL") return "mtx";
  if (compact.startsWith("INDEED")) return "mtg";
  if (compact.startsWith("TRAVEL")) return "mtx";
  if (compact === "OTHER") return "mtx";
  return null;
}

function resolveLineId(draftId: string, lines: BudgetLine[]): string {
  const id = `bln_${draftId}`;
  return lines.find((line) => line.id === id)?.id ?? id;
}

export function createP10BudgetPayments(
  lines: BudgetLine[],
  now = new Date().toISOString()
): BudgetPayment[] {
  return (p10Rows as P10Row[]).flatMap((row, index) => {
    const draftId = draftIdForMarketingCode(row.code);
    if (!draftId) return [];
    const label = [row.code, row.job].filter(Boolean).join(" · ");
    const period = row.period ? `Period ${row.period}` : "";
    return [
      {
        id: `pay_p10_${String(index + 1).padStart(3, "0")}`,
        budget_line_id: resolveLineId(draftId, lines),
        paid_at: row.paid_at,
        supplier: row.job || row.code,
        description: [label, period].filter(Boolean).join(" · "),
        amount: row.amount,
        status: "paid",
        invoice_url: "",
        created_by: "P10 marketing breakdown",
        created_by_user_id: null,
        created_at: now,
        updated_at: now,
      },
    ];
  });
}

/** True when store still has superseded P6 finance breakdown payments. */
export function hasLegacyP6BudgetPayments(payments: BudgetPayment[]): boolean {
  return payments.some((payment) => payment.id.startsWith("pay_p6_"));
}

export function stripLegacyP6BudgetPayments(
  payments: BudgetPayment[]
): BudgetPayment[] {
  return payments.filter((payment) => !payment.id.startsWith("pay_p6_"));
}
