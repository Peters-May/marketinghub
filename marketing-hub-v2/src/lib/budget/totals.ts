import type {
  BudgetGroup,
  BudgetLine,
  BudgetPayment,
  BudgetPaymentStatus,
} from "@/lib/types";

export type LineSpend = {
  lineId: string;
  planned: number;
  paid: number;
  pending: number;
  used: number;
  remaining: number;
  overBudget: boolean;
};

export type BudgetTotals = {
  planned: number;
  paid: number;
  pending: number;
  remaining: number;
  overBudgetCount: number;
  byGroup: Record<
    BudgetGroup,
    { planned: number; paid: number; pending: number; remaining: number }
  >;
  byLine: Record<string, LineSpend>;
};

function sumAmount(
  payments: BudgetPayment[],
  match: (payment: BudgetPayment) => boolean
) {
  return payments.reduce(
    (total, payment) => (match(payment) ? total + payment.amount : total),
    0
  );
}

export function isPendingStatus(status: BudgetPaymentStatus) {
  return status === "pending" || status === "committed";
}

/** Near or past the planned amount. Paid and committed stay in separate buckets. */
export function budgetThresholds(totals: BudgetTotals) {
  return Object.values(totals.byLine).filter((line) => {
    if (line.planned <= 0) return line.remaining < 0;
    return line.remaining < 0 || line.remaining / line.planned <= 0.1;
  });
}

export function spendForLine(
  line: BudgetLine,
  payments: BudgetPayment[]
): LineSpend {
  const related = payments.filter(
    (payment) => payment.budget_line_id === line.id
  );
  const paid = sumAmount(related, (payment) => payment.status === "paid");
  const pending = sumAmount(related, (payment) =>
    isPendingStatus(payment.status)
  );
  const used = paid + pending;
  const remaining = line.planned - used;
  return {
    lineId: line.id,
    planned: line.planned,
    paid,
    pending,
    used,
    remaining,
    overBudget: remaining < 0,
  };
}

export function computeBudgetTotals(
  lines: BudgetLine[],
  payments: BudgetPayment[]
): BudgetTotals {
  const byLine: Record<string, LineSpend> = {};
  const byGroup: BudgetTotals["byGroup"] = {
    committed: { planned: 0, paid: 0, pending: 0, remaining: 0 },
    uncommitted: { planned: 0, paid: 0, pending: 0, remaining: 0 },
  };

  let planned = 0;
  let paid = 0;
  let pending = 0;
  let overBudgetCount = 0;

  for (const line of lines) {
    const spend = spendForLine(line, payments);
    byLine[line.id] = spend;
    planned += spend.planned;
    paid += spend.paid;
    pending += spend.pending;
    if (spend.overBudget) overBudgetCount += 1;
    const group = byGroup[line.group];
    group.planned += spend.planned;
    group.paid += spend.paid;
    group.pending += spend.pending;
    group.remaining += spend.remaining;
  }

  return {
    planned,
    paid,
    pending,
    remaining: planned - paid - pending,
    overBudgetCount,
    byGroup,
    byLine,
  };
}
