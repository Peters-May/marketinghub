import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  backfillPortalCampaignSends,
  syncPortalMarketingAudience,
} from "@/lib/sync/portal-marketing";

/** Pull opted-in Portal customers into the Hub "Portal customers" audience. */
export async function POST() {
  const { error } = await requireAdmin();
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
