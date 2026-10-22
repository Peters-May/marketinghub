import { ReportsClient } from "@/components/reports/ReportsClient";
import { getFieldOptionsMap } from "@/lib/data/data-admin";
import {
  listAdvertisements,
  listPaidCampaigns,
  listReports,
} from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [
    reports,
    paidCampaigns,
    advertisements,
    fieldOptions,
    paidFieldOptions,
    adFieldOptions,
  ] = await Promise.all([
    listReports(),
    listPaidCampaigns(),
    listAdvertisements(),
    getFieldOptionsMap("reports"),
    getFieldOptionsMap("paid_campaigns"),
    getFieldOptionsMap("advertisements"),
  ]);
  return (
    <ReportsClient
      initial={reports}
      paidCampaigns={paidCampaigns}
      advertisements={advertisements}
      fieldOptions={fieldOptions}
      paidFieldOptions={paidFieldOptions}
      adFieldOptions={adFieldOptions}
    />
  );
}
