import { uid } from "@/lib/utils";
import {
  createServiceClient,
  hasServiceRoleKey,
} from "@/lib/supabase/admin";
import { syncWhatsAppEnquiryToPortal } from "@/lib/sync/portal-enquiries";
import type { WhatsAppEnquiry, WebEnquiryStatus } from "@/lib/types";

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

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(normalized.length === 10 ? `${normalized}T00:00:00Z` : normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Map spreadsheet Status → hub workflow bucket. */
export function hubStatusFromTracker(
  trackerStatus: string,
  fallback: WebEnquiryStatus = "new"
): WebEnquiryStatus {
  const s = trackerStatus.trim().toLowerCase();
  if (!s) return fallback;
  if (
    /^(quoted|sent to accounts|closed|complete|completed|done|won|lost)$/.test(s)
  ) {
    return "done";
  }
  if (/^(new|received|open)$/.test(s)) return "new";
  return "in_progress";
}

function rowToWhatsApp(row: Record<string, unknown>): WhatsAppEnquiry {
  const status = asString(row.status, "new") as WebEnquiryStatus;
  return {
    id: asString(row.id),
    external_id: asString(row.external_id),
    created_at: row.created_at ? asString(row.created_at) : null,
    sent_to_office_at: row.sent_to_office_at
      ? asString(row.sent_to_office_at)
      : null,
    follow_up_at: row.follow_up_at ? asString(row.follow_up_at) : null,
    customer_name: asString(row.customer_name),
    company: asString(row.company),
    customer_email: asString(row.customer_email),
    customer_phone: asString(row.customer_phone),
    customer_country: asString(row.customer_country),
    category: asString(row.category),
    service: asString(row.service),
    vessel_cargo: asString(row.vessel_cargo),
    collection_location: asString(row.collection_location),
    delivery_location: asString(row.delivery_location),
    dimensions: asString(row.dimensions),
    declared_value: asString(row.declared_value),
    preferred_timeframe: asString(row.preferred_timeframe),
    selected_office: asString(row.selected_office),
    office_email: asString(row.office_email),
    tracker_status: asString(row.tracker_status),
    email_subject: asString(row.email_subject),
    source: asString(row.source),
    message: asString(row.message),
    notes: asString(row.notes),
    needs_manual_review: Boolean(row.needs_manual_review),
    is_test: Boolean(row.is_test),
    status: STATUSES.includes(status) ? status : "new",
    raw_payload: asRecord(row.raw_payload),
    received_at: asString(row.received_at),
    updated_at: asString(row.updated_at),
  };
}

export type WhatsAppEnquiryInput = {
  /** Stable id — WA-001 style or WhatsApp message id */
  external_id?: string;
  sent_to_office_at?: string | null;
  follow_up_at?: string | null;
  customer_name?: string;
  company?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_country?: string;
  category?: string;
  /** Enquiry Type */
  service?: string;
  enquiry_type?: string;
  vessel_cargo?: string;
  collection_location?: string;
  delivery_location?: string;
  dimensions?: string;
  declared_value?: string;
  preferred_timeframe?: string;
  /** Team / Office Sent To */
  selected_office?: string;
  office_email?: string;
  /** Spreadsheet Status */
  tracker_status?: string;
  email_subject?: string;
  source?: string;
  message?: string;
  notes?: string;
  created_at?: string;
  is_test?: boolean;
  status?: WebEnquiryStatus;
};

export type WhatsAppEnquiryPatch = WhatsAppEnquiryInput & {
  id?: string;
  external_id?: string;
};

function buildMessage(input: {
  service: string;
  vessel: string;
  origin: string;
  dest: string;
  dims: string;
  timeframe: string;
  message: string;
}): string {
  if (input.message) return input.message;
  const bits = [
    input.service,
    input.vessel,
    input.origin || input.dest
      ? `${input.origin} → ${input.dest}`.replace(/^ → | → $/g, "")
      : "",
    input.dims,
    input.timeframe ? `Timeframe: ${input.timeframe}` : "",
  ].filter(Boolean);
  return bits.join(" | ");
}

async function nextExternalId(): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("whatsapp_enquiries")
    .select("external_id")
    .like("external_id", "WA-%")
    .order("external_id", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  let max = 0;
  for (const row of data ?? []) {
    const m = /^WA-(\d+)$/i.exec(asString(row.external_id));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `WA-${String(max + 1).padStart(3, "0")}`;
}

function normalizeInput(input: WhatsAppEnquiryInput) {
  const service =
    asString(input.enquiry_type).trim() || asString(input.service).trim();
  const vessel = asString(input.vessel_cargo).trim();
  const origin = asString(input.collection_location).trim();
  const dest = asString(input.delivery_location).trim();
  const dims = asString(input.dimensions).trim();
  const timeframe = asString(input.preferred_timeframe).trim();
  const message = buildMessage({
    service,
    vessel,
    origin,
    dest,
    dims,
    timeframe,
    message: asString(input.message).trim(),
  });
  const selectedOffice = asString(input.selected_office).trim();
  const trackerStatus = asString(input.tracker_status).trim();
  const sentToOffice =
    parseDate(asString(input.sent_to_office_at)) ??
    parseDate(asString(input.created_at));

  return {
    service,
    vessel,
    origin,
    dest,
    dims,
    timeframe,
    message,
    selectedOffice,
    trackerStatus,
    sentToOffice,
    followUp: parseDate(asString(input.follow_up_at ?? "")),
    customerName: asString(input.customer_name).trim(),
    company: asString(input.company).trim(),
    customerPhone: asString(input.customer_phone).trim(),
    customerEmail: asString(input.customer_email).trim(),
    customerCountry: asString(input.customer_country).trim(),
    category: asString(input.category).trim(),
    officeEmail: asString(input.office_email).trim(),
    emailSubject: asString(input.email_subject).trim() || "WhatsApp Enquiry",
    source: asString(input.source).trim() || "mcp",
    notes: asString(input.notes).trim(),
    isTest: Boolean(input.is_test),
  };
}

/** Create or upsert by external_id (ChatGPT / Hub MCP). */
export async function upsertWhatsAppEnquiry(
  input: WhatsAppEnquiryInput
): Promise<WhatsAppEnquiry> {
  if (!hasServiceRoleKey()) {
    throw new Error("Supabase service role is required for enquiry ingest");
  }

  let externalId = asString(input.external_id).trim();
  if (!externalId) {
    externalId = await nextExternalId();
  }

  const n = normalizeInput(input);
  if (!n.customerPhone && !n.customerName && !n.message && !n.vessel) {
    throw new Error(
      "Provide at least customer_phone, customer_name, vessel_cargo, or message"
    );
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("whatsapp_enquiries")
    .select("id, status, tracker_status")
    .eq("external_id", externalId)
    .maybeSingle();

  const id = existing?.id ? asString(existing.id) : uid("wa");
  const trackerStatus =
    n.trackerStatus ||
    asString(existing?.tracker_status) ||
    (n.selectedOffice ? "Sent to office" : "New");
  const status: WebEnquiryStatus =
    input.status && STATUSES.includes(input.status)
      ? input.status
      : hubStatusFromTracker(
          trackerStatus,
          existing?.status && STATUSES.includes(existing.status as WebEnquiryStatus)
            ? (existing.status as WebEnquiryStatus)
            : "new"
        );

  const row = {
    id,
    external_id: externalId,
    created_at: n.sentToOffice ?? now,
    sent_to_office_at: n.sentToOffice ?? now,
    follow_up_at: n.followUp,
    customer_name: n.customerName,
    company: n.company,
    customer_email: n.customerEmail,
    customer_phone: n.customerPhone,
    customer_country: n.customerCountry,
    category: n.category,
    service: n.service,
    vessel_cargo: n.vessel,
    collection_location: n.origin,
    delivery_location: n.dest,
    dimensions: n.dims,
    declared_value: asString(input.declared_value).trim(),
    preferred_timeframe: n.timeframe,
    selected_office: n.selectedOffice,
    office_email: n.officeEmail,
    tracker_status: trackerStatus,
    email_subject: n.emailSubject,
    source: n.source,
    message: n.message,
    notes: n.notes,
    needs_manual_review: !n.selectedOffice,
    is_test: n.isTest,
    status,
    raw_payload: {
      source: "mcp",
      ...input,
      external_id: externalId,
    },
    updated_at: now,
    ...(existing ? {} : { received_at: now }),
  };

  const { data, error } = await supabase
    .from("whatsapp_enquiries")
    .upsert(row, { onConflict: "external_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const enquiry = rowToWhatsApp(data as Record<string, unknown>);
  // Hub remains SoT: store succeeds even when Portal sync fails.
  void syncWhatsAppEnquiryToPortal(enquiry);
  return enquiry;
}

const PAGE_SIZE = 1000;
const FETCH_CAP = 20_000;

function sortWhatsApp(items: WhatsAppEnquiry[]): WhatsAppEnquiry[] {
  return [...items].sort((a, b) => {
    const ta = new Date(
      a.sent_to_office_at ?? a.created_at ?? a.received_at
    ).getTime();
    const tb = new Date(
      b.sent_to_office_at ?? b.created_at ?? b.received_at
    ).getTime();
    return tb - ta;
  });
}

export async function listWhatsAppEnquiries(options?: {
  includeTest?: boolean;
  limit?: number;
  offset?: number;
}): Promise<WhatsAppEnquiry[]> {
  if (!hasServiceRoleKey()) return [];

  const supabase = createServiceClient();
  const includeTest = Boolean(options?.includeTest);

  async function fetchRange(
    from: number,
    to: number
  ): Promise<WhatsAppEnquiry[]> {
    let query = supabase
      .from("whatsapp_enquiries")
      .select("*")
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("received_at", { ascending: false })
      .range(from, to);
    if (!includeTest) query = query.eq("is_test", false);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) =>
      rowToWhatsApp(row as Record<string, unknown>)
    );
  }

  if (options?.limit != null) {
    const limit = Math.min(Math.max(options.limit, 1), FETCH_CAP);
    const offset = Math.max(options.offset ?? 0, 0);
    return sortWhatsApp(await fetchRange(offset, offset + limit - 1));
  }

  const all: WhatsAppEnquiry[] = [];
  let offset = 0;
  while (offset < FETCH_CAP) {
    const to = Math.min(offset + PAGE_SIZE, FETCH_CAP) - 1;
    const batch = await fetchRange(offset, to);
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return sortWhatsApp(all);
}

export async function getWhatsAppEnquiry(options: {
  id?: string;
  external_id?: string;
}): Promise<WhatsAppEnquiry | null> {
  if (!hasServiceRoleKey()) return null;
  const id = asString(options.id).trim();
  const externalId = asString(options.external_id).trim();
  if (!id && !externalId) return null;

  const supabase = createServiceClient();
  let query = supabase.from("whatsapp_enquiries").select("*");
  query = id ? query.eq("id", id) : query.eq("external_id", externalId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToWhatsApp(data as Record<string, unknown>);
}

/** Partial update by id or external_id (ChatGPT chase / status updates). */
export async function updateWhatsAppEnquiry(
  patch: WhatsAppEnquiryPatch
): Promise<WhatsAppEnquiry | null> {
  if (!hasServiceRoleKey()) return null;

  const id = asString(patch.id).trim();
  const externalId = asString(patch.external_id).trim();
  if (!id && !externalId) {
    throw new Error("id or external_id is required");
  }

  const existing = await getWhatsAppEnquiry({ id, external_id: externalId });
  if (!existing) return null;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const stringFields: Array<keyof WhatsAppEnquiryInput> = [
    "customer_name",
    "company",
    "customer_phone",
    "customer_email",
    "customer_country",
    "category",
    "vessel_cargo",
    "collection_location",
    "delivery_location",
    "dimensions",
    "declared_value",
    "preferred_timeframe",
    "selected_office",
    "office_email",
    "tracker_status",
    "email_subject",
    "source",
    "message",
    "notes",
  ];
  for (const key of stringFields) {
    if (patch[key] !== undefined) {
      updates[key === "enquiry_type" ? "service" : key] = asString(
        patch[key]
      ).trim();
    }
  }
  if (patch.enquiry_type !== undefined || patch.service !== undefined) {
    updates.service =
      asString(patch.enquiry_type).trim() || asString(patch.service).trim();
  }
  if (patch.sent_to_office_at !== undefined) {
    updates.sent_to_office_at = parseDate(asString(patch.sent_to_office_at));
    if (updates.sent_to_office_at) {
      updates.created_at = updates.sent_to_office_at;
    }
  }
  if (patch.follow_up_at !== undefined) {
    updates.follow_up_at = parseDate(asString(patch.follow_up_at ?? ""));
  }
  if (patch.is_test !== undefined) {
    updates.is_test = Boolean(patch.is_test);
  }
  if (patch.tracker_status !== undefined || patch.status !== undefined) {
    const tracker =
      patch.tracker_status !== undefined
        ? asString(patch.tracker_status).trim()
        : existing.tracker_status;
    updates.tracker_status = tracker;
    updates.status =
      patch.status && STATUSES.includes(patch.status)
        ? patch.status
        : hubStatusFromTracker(tracker, existing.status);
  }
  if (patch.selected_office !== undefined) {
    updates.needs_manual_review = !asString(patch.selected_office).trim();
  }

  updates.raw_payload = {
    ...existing.raw_payload,
    ...patch,
    source: existing.raw_payload.source ?? "mcp",
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("whatsapp_enquiries")
    .update(updates)
    .eq("id", existing.id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const enquiry = rowToWhatsApp(data as Record<string, unknown>);
  void syncWhatsAppEnquiryToPortal(enquiry);
  return enquiry;
}

/** @deprecated Prefer updateWhatsAppEnquiry({ id, status }) */
export async function updateWhatsAppEnquiryStatus(
  id: string,
  patch: { status?: WebEnquiryStatus }
): Promise<WhatsAppEnquiry | null> {
  return updateWhatsAppEnquiry({ id, status: patch.status });
}

export async function deleteWhatsAppEnquiry(id: string): Promise<boolean> {
  if (!hasServiceRoleKey()) return false;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("whatsapp_enquiries")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
