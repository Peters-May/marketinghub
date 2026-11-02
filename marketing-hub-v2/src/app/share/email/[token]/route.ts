import { NextRequest } from "next/server";
import { getPublicEmailByShareToken } from "@/lib/data/repos";
import {
  EMAIL_DOCUMENT_HEADERS,
  emailSharePath,
  renderPublicEmailHtml,
  unavailableEmailPreviewHtml,
} from "@/lib/email/share";

export const dynamic = "force-dynamic";

const DOCUMENT_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
  ...EMAIL_DOCUMENT_HEADERS,
};

export async function GET(
  request: NextRequest,
  context: { params: { token: string } }
) {
  const token = context.params.token ?? "";
  const draft = await getPublicEmailByShareToken(token);
  if (!draft) {
    return new Response(unavailableEmailPreviewHtml(), {
      status: 404,
      headers: DOCUMENT_HEADERS,
    });
  }

  const path = emailSharePath(token);
  const shareUrl = `${request.nextUrl.origin}${path || `/share/email/${encodeURIComponent(token)}`}`;
  const html = renderPublicEmailHtml({
    subject: draft.subject,
    html: draft.html_body,
    shareUrl,
    sent: draft.sent,
  });
  return new Response(html, { headers: DOCUMENT_HEADERS });
}
