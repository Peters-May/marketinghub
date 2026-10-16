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
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

function unavailable() {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Email preview</title></head><body style="margin:0;padding:32px;font-family:Arial,sans-serif;color:#0B2545;">This email preview is not available.</body></html>`;
  return new Response(html, {
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
  const html = applyEmailMerge(
    ensureViewInBrowserLink(ensureUnsubscribeFooter(campaign.html_body)),
    {
      contact,
      unsubscribeUrl: unsubscribeUrlFor(identity),
      viewInBrowserUrl: viewInBrowserUrlFor(identity),
    }
  );

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
