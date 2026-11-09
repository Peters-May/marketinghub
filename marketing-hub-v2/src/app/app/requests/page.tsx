import { InternalHub } from "@/components/internal/InternalHub";
import { listStaffRequests } from "@/lib/data/repos";

export default async function RequestsPage() {
  return <InternalHub requests={await listStaffRequests()} />;
}
