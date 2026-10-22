import { readStore, updateStore } from "@/lib/store/local";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import {
  matchOwnerUserId,
  type OwnerDirectoryEntry,
} from "@/lib/identity/owner-match";

export {
  matchOwnerUserId,
  normaliseOwnerName,
  ownerMatchesViewer,
  type OwnerDirectoryEntry,
} from "@/lib/identity/owner-match";

export async function loadOwnerDirectory(): Promise<OwnerDirectoryEntry[]> {
  if (hasServiceRoleKey()) {
    try {
      const { listSupabaseHubUsers } = await import("@/lib/supabase/hub-users");
      const users = await listSupabaseHubUsers();
      if (users.length > 0) {
        return users.map((user) => ({
          id: user.id,
          full_name: user.full_name,
        }));
      }
    } catch (err) {
      console.error("[owners] directory failed", err);
    }
  }
  const store = await readStore();
  return (store.hub_users ?? []).map((user) => ({
    id: user.id,
    full_name: user.full_name,
  }));
}

/** Writes owner_user_id only where the owner text matches one user exactly. */
export async function backfillOwnerUserIds() {
  const people = await loadOwnerDirectory();
  if (people.length === 0) return;
  const store = await readStore();
  const taskIds = new Map<string, string>();
  for (const task of store.tasks ?? []) {
    if (task.owner_user_id) continue;
    const id = matchOwnerUserId(task.owner, people);
    if (id) taskIds.set(task.id, id);
  }
  const contentIds = new Map<string, string>();
  for (const item of store.content ?? []) {
    if (item.owner_user_id) continue;
    const id = matchOwnerUserId(item.owner, people);
    if (id) contentIds.set(item.id, id);
  }
  if (taskIds.size === 0 && contentIds.size === 0) return;
  await updateStore((next) => {
    for (const task of next.tasks ?? []) {
      const id = taskIds.get(task.id);
      if (id && !task.owner_user_id) task.owner_user_id = id;
    }
    for (const item of next.content ?? []) {
      const id = contentIds.get(item.id);
      if (id && !item.owner_user_id) item.owner_user_id = id;
    }
  });
}
