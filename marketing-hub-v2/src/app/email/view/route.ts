import { NextRequest } from "next/server";
import { getContact, getContactByEmail, getEmailCampaign } from "@/lib/data/repos";
import {
  applyEmailMerge,
  ensureUnsubscribeFooter,
  ensureViewInBrowserLink,
} from "@/lib/email/merge";
import {
  parseUnsubscribeToken,
  unsubscribeUrlFor,
  viewInBrowserUrlFor,
} from "@/lib/email/unsubscribe-token";
import {
  EMAIL_DOCUMENT_HEADERS,
  unavailableEmailPreviewHtml,
} from "@/lib/email/share";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

function unavailable() {
  return new Response(unavailableEmailPreviewHtml(), {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const parsed = parseUnsubscribeToken(token);
  if (!parsed?.campaignId || parsed.campaignId === "test") return unavailable();

  const campaign = await getEmailCampaign(parsed.campaignId);
  if (!campaign?.html_body) return unavailable();

  const contact =
    (parsed.contactId ? await getContact(parsed.contactId) : null) ??
    (await getContactByEmail(parsed.email)) ??
    ({
      id: parsed.contactId || "preview",
      name: "",
      email: parsed.email,
      organisation: "",
      role: "",
      outlet: "",
      country: "",
    } as Contact);

  const identity = {
    email: parsed.email,
    campaignId: parsed.campaignId,
    contactId: contact.id,
  };
  const staffPreview = request.nextUrl.searchParams.get("preview") === "1";
  const html = applyEmailMerge(
    ensureViewInBrowserLink(ensureUnsubscribeFooter(campaign.html_body)),
    {
      contact,
      unsubscribeUrl: staffPreview ? "#" : unsubscribeUrlFor(identity),
      preferencesUrl: staffPreview ? "#" : undefined,
      viewInBrowserUrl: staffPreview ? "#" : viewInBrowserUrlFor(identity),
    }
  );

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      ...EMAIL_DOCUMENT_HEADERS,
    },
  });
}
