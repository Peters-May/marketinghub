import { waitUntil } from "@vercel/functions";
import { Resend } from "resend";
import {
  brandedHubEmailHtml,
  emailAppOrigin,
  escapeHtml,
} from "@/lib/email/brand-shell";

export type MarketingAlertKind =
  | "clothing"
  | "asset"
  | "social"
  | "other_request"
  | "feedback";

export type ClothingAlertLine = {
  item: string;
  fit?: string;
  size?: string;
  colour?: string;
  logo?: string;
  quantity?: number;
  is_other?: boolean;
  other_description?: string;
};

export type ClothingAlertDetail = {
  requested_for?: string;
  created_by?: string;
  office?: string;
  needed_by?: string | null;
  notes?: string;
  lines?: ClothingAlertLine[];
};

const KIND_LABEL: Record<MarketingAlertKind, string> = {
  clothing: "clothing",
  asset: "asset",
  social: "social",
  other_request: "other request",
  feedback: "feedback",
};

export { escapeHtml };

function hubPathFor(kind: MarketingAlertKind): string {
  if (kind === "feedback") return "/app/feedback";
  // Internal Merch → Orders (not the public /shop browse page).
  if (kind === "clothing") return "/app/shop";
  return "/app/requests";
}

function clothingDetailHtml(detail: ClothingAlertDetail): string {
  const rows: string[] = [];
  if (detail.requested_for?.trim()) {
    rows.push(
      `<p style="margin:0 0 8px;"><strong>For:</strong> ${escapeHtml(detail.requested_for.trim())}</p>`
    );
  }
  if (detail.created_by?.trim()) {
    rows.push(
      `<p style="margin:0 0 8px;"><strong>Submitted by:</strong> ${escapeHtml(detail.created_by.trim())}</p>`
    );
  }
  if (detail.office?.trim()) {
    rows.push(
      `<p style="margin:0 0 8px;"><strong>Office:</strong> ${escapeHtml(detail.office.trim())}</p>`
    );
  }
  if (detail.needed_by?.trim()) {
    rows.push(
      `<p style="margin:0 0 8px;"><strong>Needed by:</strong> ${escapeHtml(detail.needed_by.trim())}</p>`
    );
  }

  const lines = detail.lines ?? [];
  if (lines.length) {
    const items = lines
      .map((line) => {
        if (line.is_other) {
          const label =
            line.other_description?.trim() || line.item || "Other item";
          const qty = line.quantity && line.quantity > 1 ? ` ×${line.quantity}` : "";
          return `<li>${escapeHtml(label)}${qty}</li>`;
        }
        const parts = [
          line.item,
          line.colour,
          line.size,
          line.fit,
          line.logo,
        ]
          .map((p) => (typeof p === "string" ? p.trim() : ""))
          .filter(Boolean);
        const qty =
          line.quantity && line.quantity > 0 ? ` ×${line.quantity}` : "";
        return `<li>${escapeHtml(parts.join(" · "))}${qty}</li>`;
      })
      .join("");
    rows.push(
      `<p style="margin:12px 0 4px;"><strong>Items</strong></p><ul style="margin:0;padding-left:18px;">${items}</ul>`
    );
  }

  if (detail.notes?.trim()) {
    const plain = detail.notes
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (plain) {
      rows.push(
        `<p style="margin:12px 0 0;"><strong>Notes:</strong> ${escapeHtml(plain)}</p>`
      );
    }
  }

  return rows.join("");
}

/**
 * Lightweight alert to marketing.
 * Clothing alerts may include requester + line items; other kinds stay type-only.
 */
export async function sendMarketingAlert(params: {
  kind: MarketingAlertKind;
  /** Extra label e.g. feedback type "bug" — still no body/details */
  subtype?: string;
  clothing?: ClothingAlertDetail;
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[sendMarketingAlert] RESEND_API_KEY not set, skipping email");
    return { success: false, error: "Email not configured" };
  }

  const to =
    process.env.MARKETING_ALERT_EMAIL?.trim() || "marketing@petersandmay.com";
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() || "marketing@petersandmay.com";

  const what = KIND_LABEL[params.kind];
  const subtype =
    params.subtype?.trim() && params.kind === "feedback"
      ? ` (${params.subtype.trim()})`
      : "";

  const subject = `New ${what}${subtype} in Marketing Hub`;
  const origin = emailAppOrigin();
  const path = hubPathFor(params.kind);
  const href = origin ? `${origin}${path}` : path;

  const clothingBlock =
    params.kind === "clothing" && params.clothing
      ? clothingDetailHtml(params.clothing)
      : "";

  const detailNote = clothingBlock
    ? clothingBlock
    : `<p style="margin:0;">Open the hub to review — this email does not include the request details.</p>`;

  const html = brandedHubEmailHtml({
    eyebrow: "Marketing Hub · Alert",
    heading: `New ${what}${subtype}`,
    bodyHtml: `
      <p style="margin:0 0 16px;">A new <strong>${escapeHtml(what)}${escapeHtml(subtype)}</strong> was submitted in Marketing Hub.</p>
      ${detailNote}
    `,
    ctaLabel: "Open in Marketing Hub",
    ctaHref: href,
    footerNote: "Automated notification from Marketing Hub.",
  });

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[sendMarketingAlert] Resend error:", JSON.stringify(error));
      return { success: false, error: error.message };
    }

    if (data?.id) {
      console.log("[sendMarketingAlert] Email sent, id:", data.id, "kind:", params.kind);
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message || "Unknown error";
    console.error("[sendMarketingAlert] Failed:", err);
    return { success: false, error: msg };
  }
}

/** Queue alert after the response — waitUntil keeps the send alive on Vercel. */
export function notifyMarketingAlert(params: {
  kind: MarketingAlertKind;
  subtype?: string;
  clothing?: ClothingAlertDetail;
}): void {
  waitUntil(
    sendMarketingAlert(params)
      .then((result) => {
        if (!result.success) {
          console.error(
            "[notifyMarketingAlert] failed:",
            result.error,
            "kind:",
            params.kind
          );
        }
      })
      .catch((err) => {
        console.error("[notifyMarketingAlert] Unhandled:", err);
      })
  );
}

export function staffRequestAlertKind(
  kind: string
): Extract<MarketingAlertKind, "asset" | "social" | "other_request"> {
  if (kind === "asset") return "asset";
  if (kind === "social_form") return "social";
  return "other_request";
}
