import type {
  ShareAudience,
  ShareReviewDecision,
  ShareReviewResponse,
  ShareReviewTargetType,
  ShareTaggedPerson,
} from "@/lib/types";

function isShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

export type ShareAudienceCopy = {
  pageTitle: string;
  eyebrow: string;
  intro: string;
  approveLabel: string;
  changesLabel: string;
  byLabelApprove: string;
  byLabelChanges: string;
  submitLabel: string;
  thanksTitle: string;
  thanksBody: string;
};

export function audienceCopy(audience: ShareAudience): ShareAudienceCopy {
  if (audience === "client") {
    return {
      pageTitle: "Client approval",
      eyebrow: "Peters & May",
      intro: "Shared for your review by Peters & May. No Hub sign-in required.",
      approveLabel: "Approve",
      changesLabel: "Request changes",
      byLabelApprove: "Approved by",
      byLabelChanges: "Reviewed by",
      submitLabel: "Send to marketing",
      thanksTitle: "Thank you",
      thanksBody:
        "Your response has been sent to the Peters & May marketing team.",
    };
  }
  return {
    pageTitle: "Staff approval",
    eyebrow: "Peters & May",
    intro: "Shared with Peters & May staff. No Hub sign-in required.",
    approveLabel: "Approve",
    changesLabel: "Request changes",
    byLabelApprove: "Approved by",
    byLabelChanges: "Reviewed by",
    submitLabel: "Send to marketing",
    thanksTitle: "Response sent",
    thanksBody: "Marketing has been emailed with your updates.",
  };
}

export function byLabelForDecision(decision: ShareReviewDecision): string {
  return decision === "approved" ? "Approved by" : "Reviewed by";
}

export function normalizeTaggedPeople(
  raw: unknown
): ShareTaggedPerson[] {
  if (!Array.isArray(raw)) return [];
  const out: ShareTaggedPerson[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name = String((row as { name?: unknown }).name ?? "").trim();
    if (!name) continue;
    const email = String((row as { email?: unknown }).email ?? "").trim();
    out.push(email ? { name, email } : { name });
    if (out.length >= 20) break;
  }
  return out;
}

export function normalizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    const url = String(value ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    out.push(url);
    if (out.length >= 12) break;
  }
  return out;
}

export function normalizeShareReview(
  raw: Partial<ShareReviewResponse> & {
    id?: string;
    target_type?: string;
    target_id?: string;
  }
): ShareReviewResponse | null {
  const id = String(raw.id ?? "").trim();
  const target_id = String(raw.target_id ?? "").trim();
  const target_type = raw.target_type as ShareReviewTargetType;
  if (!id || !target_id) return null;
  if (
    target_type !== "content" &&
    target_type !== "email_campaign" &&
    target_type !== "email_template"
  ) {
    return null;
  }
  const audience: ShareAudience =
    raw.audience === "client" ? "client" : "staff";
  const decision: ShareReviewDecision =
    raw.decision === "changes_requested" ? "changes_requested" : "approved";
  const approved_by_name = String(raw.approved_by_name ?? "").trim();
  if (!approved_by_name) return null;

  return {
    id,
    target_type,
    target_id,
    audience,
    decision,
    original_caption: String(raw.original_caption ?? ""),
    original_subject: String(raw.original_subject ?? ""),
    amended_caption: String(raw.amended_caption ?? ""),
    amended_subject: String(raw.amended_subject ?? ""),
    notes: String(raw.notes ?? "").trim(),
    tagged_people: normalizeTaggedPeople(raw.tagged_people),
    added_image_urls: normalizeImageUrls(raw.added_image_urls),
    approved_by_name,
    approved_by_email: String(raw.approved_by_email ?? "").trim(),
    approved_by_role: String(raw.approved_by_role ?? "").trim(),
    created_at: String(raw.created_at ?? new Date().toISOString()),
  };
}

export type ResolvedShareTarget = {
  audience: ShareAudience;
  target_type: ShareReviewTargetType;
  target_id: string;
  title: string;
  /** Editable social caption (plain-ish). */
  caption: string;
  /** Editable email subject. */
  subject: string;
  hubPath: string;
};

export function matchShareAudience(params: {
  token: string;
  staffToken?: string | null;
  staffEnabled?: boolean | null;
  clientToken?: string | null;
  clientEnabled?: boolean | null;
}): ShareAudience | null {
  const trimmed = params.token.trim();
  if (!isShareToken(trimmed)) return null;
  if (
    params.clientEnabled === true &&
    (params.clientToken ?? "").trim() === trimmed
  ) {
    return "client";
  }
  if (
    params.staffEnabled === true &&
    (params.staffToken ?? "").trim() === trimmed
  ) {
    return "staff";
  }
  return null;
}

export function hubPathForShareTarget(
  target_type: ShareReviewTargetType,
  target_id: string
): string {
  if (target_type === "content") return `/app/social?content=${encodeURIComponent(target_id)}`;
  if (target_type === "email_campaign") {
    return `/app/email?campaign=${encodeURIComponent(target_id)}`;
  }
  return `/app/email?template=${encodeURIComponent(target_id)}`;
}
