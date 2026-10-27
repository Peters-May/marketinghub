import { Resend } from "resend";

export type MarketingAlertKind =
  | "clothing"
  | "asset"
  | "social"
  | "other_request"
  | "feedback";

const KIND_LABEL: Record<MarketingAlertKind, string> = {
  clothing: "clothing",
  asset: "asset",
  social: "social",
  other_request: "other request",
  feedback: "feedback",
};

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hubPathFor(kind: MarketingAlertKind): string {
  if (kind === "feedback") return "/app/feedback";
  return "/app/requests";
}

/**
 * Lightweight alert to marketing — type only, no request/feedback details.
 * Fails gracefully if Resend is not configured.
 */
export async function sendMarketingAlert(params: {
  kind: MarketingAlertKind;
  /** Extra label e.g. feedback type "bug" — still no body/details */
  subtype?: string;
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
  const origin = appOrigin();
  const path = hubPathFor(params.kind);
  const href = origin ? `${origin}${path}` : path;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>A new <strong>${escapeHtml(what)}${escapeHtml(subtype)}</strong> was submitted in Marketing Hub.</p>
  <p>Open the hub to review — this email does not include the request details.</p>
  <p><a href="${escapeHtml(href)}" style="color: #0f766e; text-decoration: none;">Open in Marketing Hub →</a></p>
  <p style="color: #666; font-size: 12px;">Automated notification from Marketing Hub.</p>
</body>
</html>
`.trim();

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

/** Fire-and-forget so create APIs are never blocked by email. */
export function notifyMarketingAlert(params: {
  kind: MarketingAlertKind;
  subtype?: string;
}): void {
  void sendMarketingAlert(params).catch((err) => {
    console.error("[notifyMarketingAlert] Unhandled:", err);
  });
}

export function staffRequestAlertKind(
  kind: string
): Extract<MarketingAlertKind, "asset" | "social" | "other_request"> {
  if (kind === "asset") return "asset";
  if (kind === "social_form") return "social";
  return "other_request";
}
