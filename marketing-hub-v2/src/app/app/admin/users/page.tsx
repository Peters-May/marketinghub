import { UsersAdminClient } from "@/components/admin/UsersAdminClient";
import { listHubUsers } from "@/lib/data/repos";
import {
  hasServiceRoleKey,
  listSupabaseHubUsers,
} from "@/lib/supabase/hub-users";

export default async function AdminUsersPage() {
  if (hasServiceRoleKey()) {
    try {
      const users = await listSupabaseHubUsers();
      return <UsersAdminClient initial={users} initialSource="supabase" />;
    } catch (err) {
      console.error("[admin/users] supabase load failed", err);
    }
  }

  const users = await listHubUsers();
  return <UsersAdminClient initial={users} initialSource="local" />;
}
