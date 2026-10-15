import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { requireBudgetAccess } from "@/lib/auth/require-budget-access";
import { computeBudgetTotals } from "@/lib/budget/totals";
import {
  createBudgetLine,
  createBudgetPayment,
  deleteBudgetLine,
  deleteBudgetPayment,
  getBudgetMeta,
  listBudgetLines,
  listBudgetPayments,
  updateBudgetLine,
  updateBudgetPayment,
} from "@/lib/data/repos";
import type {
  BudgetGroup,
  BudgetLine,
  BudgetPayment,
  BudgetPaymentStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const PAYMENT_STATUSES: BudgetPaymentStatus[] = [
  "paid",
  "pending",
  "committed",
];

function parseGroup(value: unknown): BudgetGroup {
  return value === "uncommitted" ? "uncommitted" : "committed";
}

function parseStatus(value: unknown): BudgetPaymentStatus {
  const status = String(value ?? "paid");
  return PAYMENT_STATUSES.includes(status as BudgetPaymentStatus)
    ? (status as BudgetPaymentStatus)
    : "paid";
}

function parseAmount(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function parseDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const date = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function parseUrl(value: unknown): string | null {
  const url = String(value ?? "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function snapshot() {
  const [lines, payments, meta] = await Promise.all([
    listBudgetLines(),
    listBudgetPayments(),
    getBudgetMeta(),
  ]);
  return {
    lines,
    payments,
    meta,
    totals: computeBudgetTotals(lines, payments),
  };
}

function lineFromBody(
  body: Record<string, unknown>
): Omit<BudgetLine, "id" | "created_at" | "updated_at"> | string {
  const name = String(body.name ?? "").trim();
  if (!name) return "Name is required";
  const planned = parseAmount(body.planned);
  if (planned == null) return "Planned amount must be a number of 0 or more";
  return {
    name,
    code: String(body.code ?? "").trim(),
    group: parseGroup(body.group),
    planned,
    marketing: parseAmount(body.marketing),
    sponsorship: parseAmount(body.sponsorship),
    travel: parseAmount(body.travel),
    prior_year: parseAmount(body.prior_year),
    notes: String(body.notes ?? ""),
    sort_order: Number.isFinite(Number(body.sort_order))
      ? Number(body.sort_order)
      : 0,
    children: Array.isArray(body.children)
      ? body.children.map((child) => {
          const item = (child ?? {}) as Record<string, unknown>;
          return {
            name: String(item.name ?? "").trim(),
            amount: parseAmount(item.amount),
            note: item.note ? String(item.note) : undefined,
          };
        })
      : [],
  };
}

function linePatchFromBody(
  patch: Record<string, unknown>
): Partial<BudgetLine> | string {
  const out: Partial<BudgetLine> = {};
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) return "Name is required";
    out.name = name;
  }
  if (patch.code !== undefined) out.code = String(patch.code).trim();
  if (patch.group !== undefined) out.group = parseGroup(patch.group);
  if (patch.planned !== undefined) {
    const planned = parseAmount(patch.planned);
    if (planned == null) return "Planned amount must be a number of 0 or more";
    out.planned = planned;
  }
  if (patch.marketing !== undefined) out.marketing = parseAmount(patch.marketing);
  if (patch.sponsorship !== undefined) {
    out.sponsorship = parseAmount(patch.sponsorship);
  }
  if (patch.travel !== undefined) out.travel = parseAmount(patch.travel);
  if (patch.prior_year !== undefined) {
    out.prior_year = parseAmount(patch.prior_year);
  }
  if (patch.notes !== undefined) out.notes = String(patch.notes);
  if (patch.sort_order !== undefined && Number.isFinite(Number(patch.sort_order))) {
    out.sort_order = Number(patch.sort_order);
  }
  return out;
}

async function paymentFromBody(
  body: Record<string, unknown>,
  actor: { full_name: string; id: string }
): Promise<Omit<BudgetPayment, "id" | "created_at" | "updated_at"> | string> {
  const amount = parseAmount(body.amount);
  if (amount == null || amount <= 0) return "Amount must be greater than 0";
  const lineId = String(body.budget_line_id ?? "").trim();
  if (!lineId) return "Budget line is required";
  const lines = await listBudgetLines();
  if (!lines.some((line) => line.id === lineId)) return "Budget line not found";
  const invoiceUrl = parseUrl(body.invoice_url);
  if (invoiceUrl == null) return "Invoice/receipt link must be a valid URL";
  if (body.paid_at != null && body.paid_at !== "" && !parseDate(body.paid_at)) {
    return "Payment date must be YYYY-MM-DD";
  }
  return {
    budget_line_id: lineId,
    paid_at: parseDate(body.paid_at),
    supplier: String(body.supplier ?? "").trim(),
    description: String(body.description ?? "").trim(),
    amount,
    status: parseStatus(body.status),
    invoice_url: invoiceUrl,
    created_by: actor.full_name,
    created_by_user_id: actor.id,
  };
}

async function paymentPatchFromBody(
  patch: Record<string, unknown>
): Promise<Partial<BudgetPayment> | string> {
  const out: Partial<BudgetPayment> = {};
  if (patch.amount !== undefined) {
    const amount = parseAmount(patch.amount);
    if (amount == null || amount <= 0) return "Amount must be greater than 0";
    out.amount = amount;
  }
  if (patch.budget_line_id !== undefined) {
    const lineId = String(patch.budget_line_id).trim();
    if (!lineId) return "Budget line is required";
    const lines = await listBudgetLines();
    if (!lines.some((line) => line.id === lineId)) return "Budget line not found";
    out.budget_line_id = lineId;
  }
  if (patch.paid_at !== undefined) {
    if (patch.paid_at && !parseDate(patch.paid_at)) {
      return "Payment date must be YYYY-MM-DD";
    }
    out.paid_at = parseDate(patch.paid_at);
  }
  if (patch.supplier !== undefined) {
    out.supplier = String(patch.supplier).trim();
  }
  if (patch.description !== undefined) {
    out.description = String(patch.description).trim();
  }
  if (patch.status !== undefined) out.status = parseStatus(patch.status);
  if (patch.invoice_url !== undefined) {
    const invoiceUrl = parseUrl(patch.invoice_url);
    if (invoiceUrl == null) return "Invoice/receipt link must be a valid URL";
    out.invoice_url = invoiceUrl;
  }
  return out;
}

export async function GET() {
  const { error } = await requireBudgetAccess();
  if (error) return error;
  return jsonOk(await snapshot());
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireBudgetAccess();
  if (error || !user) return error;
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "create_line") {
    const input = lineFromBody(body);
    if (typeof input === "string") return jsonError(input, 400);
    const item = await createBudgetLine(input);
    return jsonOk({ item }, { status: 201 });
  }

  if (action === "update_line") {
    const patch = body.patch as Record<string, unknown> | undefined;
    if (!patch) return jsonError("Missing patch", 400);
    const parsed = linePatchFromBody(patch);
    if (typeof parsed === "string") return jsonError(parsed, 400);
    const item = await updateBudgetLine(String(body.id), parsed);
    if (!item) return jsonError("Not found", 404);
    return jsonOk({ item });
  }

  if (action === "delete_line") {
    await deleteBudgetLine(String(body.id));
    return jsonOk({ ok: true });
  }

  if (action === "create_payment") {
    const input = await paymentFromBody(body, user);
    if (typeof input === "string") return jsonError(input, 400);
    const item = await createBudgetPayment(input);
    return jsonOk({ item }, { status: 201 });
  }

  if (action === "update_payment") {
    const patch = body.patch as Record<string, unknown> | undefined;
    if (!patch) return jsonError("Missing patch", 400);
    const parsed = await paymentPatchFromBody(patch);
    if (typeof parsed === "string") return jsonError(parsed, 400);
    const item = await updateBudgetPayment(String(body.id), parsed);
    if (!item) return jsonError("Not found", 404);
    return jsonOk({ item });
  }

  if (action === "delete_payment") {
    await deleteBudgetPayment(String(body.id));
    return jsonOk({ ok: true });
  }

  return jsonError("Unknown action", 400);
}
