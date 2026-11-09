import { ShopHub } from "@/components/merch/ShopHub";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import {
  getContactByUserId,
  listMerchInventory,
  listMerchOrders,
} from "@/lib/data/repos";
import {
  filterMerchOrdersForUser,
  isMerchAdmin,
} from "@/lib/merch/access";

export default async function InternalShopPage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  const [allMerch, inventory, viewerContact] = await Promise.all([
    listMerchOrders(),
    listMerchInventory(),
    user ? getContactByUserId(user.id) : Promise.resolve(null),
  ]);
  const merch = user ? filterMerchOrdersForUser(allMerch, user) : [];
  const canManageAll = user ? isMerchAdmin(user) : false;

  return (
    <ShopHub
      merch={merch}
      inventory={inventory}
      canManageAll={canManageAll}
      viewerName={user?.full_name ?? ""}
      viewerContactId={viewerContact?.id ?? null}
    />
  );
}
