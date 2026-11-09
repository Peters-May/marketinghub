import { Resend } from "resend";
import { byLabelForDecision } from "@/lib/share/review";
import { diffWordsToHtml, hasCopyChanges } from "@/lib/share/text-diff";
import { escapeHtml } from "@/lib/email/send-marketing-alert";
import type { ShareReviewResponse } from "@/lib/types";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export async function sendShareReviewAlert(params: {
  review: ShareReviewResponse;
  title: string;
  hubPath: string;
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[sendShareReviewAlert] RESEND_API_KEY not set, skipping email");
    return { success: false, error: "Email not configured" };
  }

  const to =
    process.env.MARKETING_ALERT_EMAIL?.trim() || "marketing@petersandmay.com";
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() || "marketing@petersandmay.com";

  const { review, title, hubPath } = params;
  const decisionLabel =
    review.decision === "approved" ? "Approved" : "Changes requested";
  const byLabel = byLabelForDecision(review.decision);
  const audienceLabel = review.audience === "client" ? "Client" : "Staff";
  const origin = appOrigin();
  const href = origin ? `${origin}${hubPath}` : hubPath;

  const copyBlocks: string[] = [];
  if (review.target_type === "content") {
    if (hasCopyChanges(review.original_caption, review.amended_caption)) {
      copyBlocks.push(
        `<p style="margin:12px 0 4px;"><strong>Caption changes</strong></p><p style="margin:0;line-height:1.5;">${diffWordsToHtml(review.original_caption, review.amended_caption)}</p>`
      );
    } else {
      copyBlocks.push(
        `<p style="margin:12px 0 0;"><strong>Caption:</strong> unchanged</p>`
      );
    }
  } else if (hasCopyChanges(review.original_subject, review.amended_subject)) {
    copyBlocks.push(
      `<p style="margin:12px 0 4px;"><strong>Subject changes</strong></p><p style="margin:0;line-height:1.5;">${diffWordsToHtml(review.original_subject, review.amended_subject)}</p>`
    );
  } else {
    copyBlocks.push(
      `<p style="margin:12px 0 0;"><strong>Subject:</strong> unchanged</p>`
    );
  }

  const people =
    review.tagged_people.length > 0
      ? `<p style="margin:12px 0 4px;"><strong>Tagged people</strong></p><ul style="margin:0;padding-left:18px;">${review.tagged_people
          .map((p) => {
            const email = p.email ? ` (${escapeHtml(p.email)})` : "";
            return `<li>${escapeHtml(p.name)}${email}</li>`;
          })
          .join("")}</ul>`
      : "";

  const images =
    review.added_image_urls.length > 0
      ? `<p style="margin:12px 0 4px;"><strong>Attached images</strong></p><ul style="margin:0;padding-left:18px;">${review.added_image_urls
          .map(
            (url) =>
              `<li><a href="${escapeHtml(url)}" style="color:#0B2545;">${escapeHtml(url)}</a></li>`
          )
          .join("")}</ul>`
      : "";

  const notes = review.notes.trim()
    ? `<p style="margin:12px 0 0;"><strong>Notes:</strong> ${escapeHtml(review.notes.trim())}</p>`
    : "";

  const byLine = [
    escapeHtml(review.approved_by_name),
    review.approved_by_role ? escapeHtml(review.approved_by_role) : "",
    review.approved_by_email ? escapeHtml(review.approved_by_email) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const subject = `${audienceLabel} share review: ${decisionLabel} — ${title || "Untitled"}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 640px; margin: 0 auto; padding: 20px;">
  <p>A <strong>${escapeHtml(audienceLabel.toLowerCase())}</strong> share-for-approval response was returned in Marketing Hub.</p>
  <p style="margin:0 0 8px;"><strong>Item:</strong> ${escapeHtml(title || "Untitled")}</p>
  <p style="margin:0 0 8px;"><strong>Decision:</strong> ${escapeHtml(decisionLabel)}</p>
  <p style="margin:0 0 8px;"><strong>${escapeHtml(byLabel)}:</strong> ${byLine}</p>
  ${copyBlocks.join("")}
  ${notes}
  ${people}
  ${images}
  <p style="margin-top:16px;"><a href="${escapeHtml(href)}" style="color: #0B2545; text-decoration: none;">Open in Marketing Hub →</a></p>
  <p style="color: #666; font-size: 12px;">Automated notification from Marketing Hub. Marketing still applies edits before publish.</p>
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
      console.error("[sendShareReviewAlert] Resend error:", JSON.stringify(error));
      return { success: false, error: error.message };
    }
    if (data?.id) {
      console.log("[sendShareReviewAlert] Email sent, id:", data.id);
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message || "Unknown error";
    console.error("[sendShareReviewAlert] Failed:", err);
    return { success: false, error: msg };
  }
}

export function notifyShareReviewAlert(params: {
  review: ShareReviewResponse;
  title: string;
  hubPath: string;
}): void {
  void sendShareReviewAlert(params).catch((err) => {
    console.error("[notifyShareReviewAlert] Unhandled:", err);
  });
}
