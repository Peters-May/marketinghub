import { InternalHub } from "@/components/internal/InternalHub";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import {
  getContactByUserId,
  listMerchOrders,
  listStaffRequests,
} from "@/lib/data/repos";
import {
  filterMerchOrdersForUser,
  isMerchAdmin,
} from "@/lib/merch/access";

export default async function RequestsPage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  const [allMerch, requests, viewerContact] = await Promise.all([
    listMerchOrders(),
    listStaffRequests(),
    user ? getContactByUserId(user.id) : Promise.resolve(null),
  ]);
  const merch = user
    ? filterMerchOrdersForUser(allMerch, user)
    : [];
  const canManageAll = user ? isMerchAdmin(user) : false;

  return (
    <InternalHub
      merch={merch}
      requests={requests}
      canManageAll={canManageAll}
      viewerName={user?.full_name ?? ""}
      viewerContactId={viewerContact?.id ?? null}
    />
  );
}
