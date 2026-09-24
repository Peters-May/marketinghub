import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  backfillPortalCampaignSends,
  syncPortalMarketingAudience,
} from "@/lib/sync/portal-marketing";

/** Pull opted-in Portal customers into the Hub "Portal customers" audience. */
export async function POST(_request: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const result = await syncPortalMarketingAudience();
  if (!result.ok) {
    return jsonError(result.error || "Portal audience sync failed", 502, result);
  }
  if (!result.skipped) {
    await backfillPortalCampaignSends();
  }
  return jsonOk(result);
}
