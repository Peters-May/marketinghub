import { EnquiriesClient } from "@/components/enquiries/EnquiriesClient";
import { enquiryToFact } from "@/lib/data/enquiry-facts";
import {
  HUB_ENQUIRY_PAGE_SIZE,
  listHubEnquiries,
} from "@/lib/data/hub-enquiries";
import { canAccessWebsiteChat } from "@/lib/auth/chat-access";
import { getSessionUser } from "@/lib/auth/session";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams?: { open?: string };
}) {
  const configured = hasServiceRoleKey();
  const user = await getSessionUser();
  const includeWebsiteChat = canAccessWebsiteChat(user);
  let initial: Awaited<ReturnType<typeof listHubEnquiries>> = [];
  let facts: ReturnType<typeof enquiryToFact>[] = [];
  if (configured) {
    try {
      const all = await listHubEnquiries({
        includeTest: true,
        includeWebsiteChat,
      });
      facts = all.map(enquiryToFact);
      initial = all
        .filter((item) => !item.is_test)
        .slice(0, HUB_ENQUIRY_PAGE_SIZE);
    } catch {
      initial = [];
      facts = [];
    }
  }

  return (
    <EnquiriesClient
      initialOpenId={searchParams?.open ?? null}
      initial={initial}
      facts={facts}
      configured={configured}
    />
  );
}
