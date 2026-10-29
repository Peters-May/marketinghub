import { EnquiriesClient } from "@/components/enquiries/EnquiriesClient";
import {
  HUB_ENQUIRY_PAGE_SIZE,
  listHubEnquiries,
} from "@/lib/data/hub-enquiries";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams?: { open?: string };
}) {
  const configured = hasServiceRoleKey();
  let initial: Awaited<ReturnType<typeof listHubEnquiries>> = [];
  if (configured) {
    try {
      initial = await listHubEnquiries({
        includeTest: false,
        limit: HUB_ENQUIRY_PAGE_SIZE,
      });
    } catch {
      initial = [];
    }
  }

  return (
    <EnquiriesClient
      initialOpenId={searchParams?.open ?? null}
      initial={initial}
      configured={configured}
    />
  );
}
