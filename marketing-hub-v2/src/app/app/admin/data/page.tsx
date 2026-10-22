import { DataAdminClient } from "@/components/data/DataAdminClient";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function AdminDataPage() {
  await requireAdminPage();
  return <DataAdminClient />;
}
