import { enquiryRoutingGap } from "@/lib/enquiries/routing";
import type { EnquiryIntake, HubEnquiry, WebEnquiry } from "@/lib/types";
import {
  enquiryDate,
  enquiryInDateRange,
  enquiryReferrerKey,
  enquirySourceLabel,
  isGoogleAdsEnquiry,
  type WebEnquiryStats,
} from "@/lib/data/web-enquiries-stats";

/** Slim row for counts, history, and filters. The table stays paged. */
export type EnquiryFact = {
  id: string;
  channel: EnquiryIntake;
  createdAt: string | null;
  isTest: boolean;
  needsReview: boolean;
  openGap: boolean;
  office: string;
  source: string;
  googleAds: boolean;
  adsGroup: string;
  search: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function vesselLabel(e: HubEnquiry): string {
  if (e.channel === "whatsapp" && e.vessel_cargo) return e.vessel_cargo;
  const raw = asRecord(e.raw_payload);
  const shipment = asRecord(raw.shipment);
  const form = asRecord(raw.form_fields);
  const make = asRecord(e.make_fields);
  return (
    asString(e.vessel_cargo) ||
    asString(shipment.yacht_vessel_name) ||
    asString(form["Yacht Name"]) ||
    asString(make.yacht_vessel_name) ||
    asString(make.vessel_cargo) ||
    asString(shipment.make_model) ||
    asString(form["Make & Model"]) ||
    ""
  );
}

function enquiryMessage(e: HubEnquiry): string {
  const raw = asRecord(e.raw_payload);
  if (asString(raw.message)) return asString(raw.message);
  const make = asRecord(e.make_fields);
  if (asString(make.message)) return asString(make.message);
  const form = asRecord(raw.form_fields);
  return (
    asString(form["Message / additional information"]) ||
    asString(
      form[
        "Any additional or specific information you feel is important to note?"
      ]
    )
  );
}

export function enquiryToFact(e: HubEnquiry): EnquiryFact {
  const source = enquirySourceLabel(e);
  const adsGroup = enquiryReferrerKey(e);
  const search = [
    e.submission_id,
    e.customer_name,
    e.customer_email,
    e.customer_phone,
    e.customer_country,
    e.final_service_category,
    e.user_selected_service,
    e.collection_location,
    e.delivery_location,
    e.selected_office,
    e.routing_reason,
    e.channel,
    e.company,
    e.category,
    e.vessel_cargo,
    e.tracker_status,
    enquiryMessage(e),
    source,
    adsGroup,
    vesselLabel(e),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .slice(0, 2000);

  return {
    id: e.id,
    channel: e.channel,
    createdAt: e.created_at || e.received_at || null,
    isTest: e.is_test,
    needsReview: e.needs_manual_review,
    openGap: enquiryRoutingGap(e) !== null,
    office: e.selected_office?.trim() || "",
    source,
    googleAds: isGoogleAdsEnquiry(e),
    adsGroup,
    search,
  };
}

function asEnquiryDate(fact: EnquiryFact): WebEnquiry {
  return {
    created_at: fact.createdAt,
    received_at: fact.createdAt ?? "",
    is_test: fact.isTest,
  } as WebEnquiry;
}

export function factInDateRange(
  fact: EnquiryFact,
  from: string,
  to: string
): boolean {
  return enquiryInDateRange(asEnquiryDate(fact), from, to);
}

/** Same totals as computeEnquiryStats, from the slim rows. */
export function computeEnquiryStatsFromFacts(
  facts: EnquiryFact[],
  opts?: { includeTest?: boolean; now?: Date }
): WebEnquiryStats {
  const list = opts?.includeTest ? facts : facts.filter((f) => !f.isTest);
  const now = opts?.now ?? new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let thisWeek = 0;
  let thisMonth = 0;
  let needsReview = 0;
  let googleAds = 0;
  const sourceCounts = new Map<string, number>();
  const officeCounts = new Map<string, number>();
  const adsReferrerCounts = new Map<string, number>();

  for (const fact of list) {
    const t = enquiryDate(asEnquiryDate(fact));
    if (t) {
      if (t >= weekAgo) thisWeek += 1;
      if (t >= monthStart) thisMonth += 1;
    }
    if (fact.needsReview) needsReview += 1;
    sourceCounts.set(fact.source, (sourceCounts.get(fact.source) ?? 0) + 1);
    const office = fact.office || "Unassigned";
    officeCounts.set(office, (officeCounts.get(office) ?? 0) + 1);
    if (fact.googleAds) {
      googleAds += 1;
      const ref = fact.adsGroup || "Google Ads (no campaign)";
      adsReferrerCounts.set(ref, (adsReferrerCounts.get(ref) ?? 0) + 1);
    }
  }

  return {
    thisWeek,
    thisMonth,
    total: list.length,
    needsReview,
    googleAds,
    topSources: [...sourceCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    byOffice: [...officeCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    googleAdsByReferrer: [...adsReferrerCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 16),
  };
}

export function factsForYearCompare(facts: EnquiryFact[]): WebEnquiry[] {
  return facts.map(asEnquiryDate);
}
