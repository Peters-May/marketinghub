import type {
  EventCostCategory,
  EventCostCurrency,
  EventCostLine,
} from "@/lib/types";

export const COST_CATEGORIES: { value: EventCostCategory; label: string }[] = [
  { value: "travel", label: "Travel" },
  { value: "accommodation", label: "Accommodation" },
  { value: "marketing_materials", label: "Marketing materials" },
  { value: "other", label: "Other" },
];

export const COST_CURRENCIES: EventCostCurrency[] = ["GBP", "EUR", "USD", "AUD"];

export function isCostCategory(value: unknown): value is EventCostCategory {
  return COST_CATEGORIES.some((item) => item.value === value);
}

export function isCostCurrency(value: unknown): value is EventCostCurrency {
  return COST_CURRENCIES.includes(value as EventCostCurrency);
}

/**
 * Blank means "not known yet" (null). Strips currency symbols and commas.
 * Returns undefined when the value is not a usable amount.
 */
export function parseCostAmount(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : undefined;
  }
  const text = String(value).replace(/[£€$,\s]/g, "");
  if (!text) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return Math.round(amount * 100) / 100;
}

/** Admins edit any line; members only lines assigned to them. */
export function canEditCostLine(
  line: Pick<EventCostLine, "staff_user_id">,
  viewer: { id: string; isAdmin: boolean }
) {
  return viewer.isAdmin || (!!line.staff_user_id && line.staff_user_id === viewer.id);
}

/** Totals per currency, in COST_CURRENCIES order. Blank amounts are skipped. */
export function costTotalsByCurrency(lines: Pick<EventCostLine, "amount" | "currency">[]) {
  const sums = new Map<EventCostCurrency, number>();
  for (const line of lines) {
    if (line.amount === null) continue;
    const currency = isCostCurrency(line.currency) ? line.currency : "GBP";
    sums.set(currency, (sums.get(currency) ?? 0) + line.amount);
  }
  return COST_CURRENCIES.filter((currency) => sums.has(currency)).map((currency) => ({
    currency,
    total: Math.round((sums.get(currency) ?? 0) * 100) / 100,
  }));
}

export function formatCostAmount(amount: number, currency: EventCostCurrency) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

export function costsSheetPath(eventId: string) {
  return `/app/events?open=${encodeURIComponent(eventId)}&costs=1`;
}
