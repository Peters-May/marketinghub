import { timingSafeEqual } from "crypto";
import { uid } from "@/lib/utils";
import {
  createServiceClient,
  hasServiceRoleKey,
} from "@/lib/supabase/admin";
import type { WebEnquiry, WebEnquiryStatus } from "@/lib/types";

const STATUSES: WebEnquiryStatus[] = ["new", "in_progress", "done"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function yesFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "yes" || v === "true" || v === "1";
  }
  return false;
}

function parseCreatedAt(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // MySQL-style "YYYY-MM-DD HH:MM:SS" from WordPress
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function rowToEnquiry(row: Record<string, unknown>): WebEnquiry {
  const status = asString(row.status, "new") as WebEnquiryStatus;
  return {
    id: asString(row.id),
    submission_id: asString(row.submission_id),
    created_at: row.created_at ? asString(row.created_at) : null,
    customer_name: asString(row.customer_name),
    customer_email: asString(row.customer_email),
    customer_phone: asString(row.customer_phone),
    customer_country: asString(row.customer_country),
    final_service_category: asString(row.final_service_category),
    user_selected_service: asString(row.user_selected_service),
    collection_location: asString(row.collection_location),
    delivery_location: asString(row.delivery_location),
    selected_office: asString(row.selected_office),
    office_email: asString(row.office_email),
    needs_manual_review: Boolean(row.needs_manual_review),
    marketing_emails_consent: Boolean(row.marketing_emails_consent),
    routing_reason: asString(row.routing_reason),
    is_test: Boolean(row.is_test),
    status: STATUSES.includes(status) ? status : "new",
    make_fields: asRecord(row.make_fields),
    raw_payload: asRecord(row.raw_payload),
    received_at: asString(row.received_at),
    updated_at: asString(row.updated_at),
  };
}

/**
 * Map Quote Builder webhook JSON → flat web_enquiries columns.
 * See pm-quote-builder/docs/WEBHOOK-FIELDS.md
 */
export function mapWebhookPayload(
  body: Record<string, unknown>
): Omit<WebEnquiry, "id" | "received_at" | "updated_at" | "status"> & {
  status?: WebEnquiryStatus;
} {
  const make = asRecord(body.make_fields);
  const customer = asRecord(body.customer);
  const routing = asRecord(body.routing);
  const route = asRecord(body.route);

  const submissionId =
    asString(make.submission_id) ||
    asString(body.submission_id) ||
    "";

  const collectionFromRoute = [route.collection_country, route.collection_location]
    .map((v) => asString(v).trim())
    .filter(Boolean)
    .join(", ");
  const deliveryFromRoute = [route.delivery_country, route.delivery_location]
    .map((v) => asString(v).trim())
    .filter(Boolean)
    .join(", ");

  const isTest =
    body.pmqb_webhook_test === true ||
    yesFlag(make.pmqb_test_mode);

  const createdRaw =
    asString(make.created_at) || asString(body.created_at);

  return {
    submission_id: submissionId,
    created_at: parseCreatedAt(createdRaw),
    customer_name:
      asString(make.customer_name) || asString(customer.name),
    customer_email:
      asString(make.customer_email) || asString(customer.email),
    customer_phone:
      asString(make.customer_phone) || asString(customer.phone),
    customer_country:
      asString(make.customer_country) || asString(customer.country),
    final_service_category:
      asString(make.final_service_category) ||
      asString(body.final_service_category),
    user_selected_service:
      asString(make.user_selected_service) ||
      asString(body.user_selected_service),
    collection_location:
      asString(make.collection_location) || collectionFromRoute,
    delivery_location:
      asString(make.delivery_location) || deliveryFromRoute,
    selected_office:
      asString(make.selected_office) ||
      asString(routing.selected_office),
    office_email:
      asString(make.office_email) || asString(routing.office_email),
    needs_manual_review:
      yesFlag(make.needs_manual_review) ||
      routing.needs_manual_review === true,
    marketing_emails_consent: yesFlag(make.marketing_emails_consent),
    routing_reason:
      asString(make.routing_reason) ||
      asString(routing.routing_reason),
    is_test: isTest,
    make_fields: make,
    raw_payload: body,
  };
}

function secretsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function requireWebhookSecret(request: Request): boolean {
  const expected = process.env.WEB_ENQUIRY_WEBHOOK_SECRET?.trim();
  if (!expected) return false;

  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim() ?? "";
  if (key && secretsMatch(key, expected)) return true;

  const headerSecret =
    request.headers.get("x-webhook-secret")?.trim() ?? "";
  if (headerSecret && secretsMatch(headerSecret, expected)) return true;

  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token && secretsMatch(token, expected)) return true;
  }

  return false;
}

export async function upsertWebEnquiryFromWebhook(
  body: Record<string, unknown>
): Promise<WebEnquiry> {
  if (!hasServiceRoleKey()) {
    throw new Error("Supabase service role is required for enquiry ingest");
  }

  const mapped = mapWebhookPayload(body);
  if (!mapped.submission_id) {
    throw new Error("submission_id is required");
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("web_enquiries")
    .select("id, status")
    .eq("submission_id", mapped.submission_id)
    .maybeSingle();

  const id = existing?.id ? asString(existing.id) : uid("enq");
  const status: WebEnquiryStatus =
    existing?.status && STATUSES.includes(existing.status as WebEnquiryStatus)
      ? (existing.status as WebEnquiryStatus)
      : "new";

  const row = {
    id,
    submission_id: mapped.submission_id,
    created_at: mapped.created_at,
    customer_name: mapped.customer_name,
    customer_email: mapped.customer_email,
    customer_phone: mapped.customer_phone,
    customer_country: mapped.customer_country,
    final_service_category: mapped.final_service_category,
    user_selected_service: mapped.user_selected_service,
    collection_location: mapped.collection_location,
    delivery_location: mapped.delivery_location,
    selected_office: mapped.selected_office,
    office_email: mapped.office_email,
    needs_manual_review: mapped.needs_manual_review,
    marketing_emails_consent: mapped.marketing_emails_consent,
    routing_reason: mapped.routing_reason,
    is_test: mapped.is_test,
    status,
    make_fields: mapped.make_fields,
    raw_payload: mapped.raw_payload,
    updated_at: now,
    ...(existing ? {} : { received_at: now }),
  };

  const { data, error } = await supabase
    .from("web_enquiries")
    .upsert(row, { onConflict: "submission_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return rowToEnquiry(data as Record<string, unknown>);
}

const ENQUIRY_PAGE_SIZE = 1000;
const ENQUIRY_FETCH_CAP = 20_000;

function sortEnquiries(items: WebEnquiry[]): WebEnquiry[] {
  return [...items].sort((a, b) => {
    const ta = new Date(a.created_at ?? a.received_at).getTime();
    const tb = new Date(b.created_at ?? b.received_at).getTime();
    return tb - ta;
  });
}

export async function listWebEnquiries(options?: {
  includeTest?: boolean;
  limit?: number;
  offset?: number;
  /** Dashboard queue: not done, and flagged or missing an office. */
  needsReview?: boolean;
}): Promise<WebEnquiry[]> {
  if (!hasServiceRoleKey()) return [];

  const supabase = createServiceClient();
  const includeTest = Boolean(options?.includeTest);
  const needsReview = Boolean(options?.needsReview);

  async function fetchRange(from: number, to: number): Promise<WebEnquiry[]> {
    let query = supabase
      .from("web_enquiries")
      .select("*")
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("received_at", { ascending: false })
      .range(from, to);
    if (!includeTest) query = query.eq("is_test", false);
    if (needsReview) {
      query = query
        .or("status.is.null,status.neq.done")
        .or(
          "needs_manual_review.eq.true,selected_office.is.null,selected_office.eq."
        );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) =>
      rowToEnquiry(row as Record<string, unknown>)
    );
  }

  if (options?.limit != null) {
    const limit = Math.min(Math.max(options.limit, 1), ENQUIRY_FETCH_CAP);
    const offset = Math.max(options.offset ?? 0, 0);
    return sortEnquiries(await fetchRange(offset, offset + limit - 1));
  }

  const all: WebEnquiry[] = [];
  let offset = 0;
  while (offset < ENQUIRY_FETCH_CAP) {
    const to = Math.min(offset + ENQUIRY_PAGE_SIZE, ENQUIRY_FETCH_CAP) - 1;
    const batch = await fetchRange(offset, to);
    all.push(...batch);
    if (batch.length < ENQUIRY_PAGE_SIZE) break;
    offset += ENQUIRY_PAGE_SIZE;
  }
  return sortEnquiries(all);
}

export async function updateWebEnquiry(
  id: string,
  patch: { status?: WebEnquiryStatus }
): Promise<WebEnquiry | null> {
  if (!hasServiceRoleKey()) return null;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status && STATUSES.includes(patch.status)) {
    updates.status = patch.status;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("web_enquiries")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToEnquiry(data as Record<string, unknown>);
}

export async function deleteWebEnquiry(id: string): Promise<boolean> {
  if (!hasServiceRoleKey()) return false;

  const supabase = createServiceClient();
  const { error } = await supabase.from("web_enquiries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

export {
  computeEnquiryStats,
  type WebEnquiryStats,
} from "@/lib/data/web-enquiries-stats";
