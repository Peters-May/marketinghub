import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { readStore, updateStore } from "@/lib/store/local";

export async function GET() {
  const { user, error } = await requireStaff();
  if (error || !user) return error;
  const store = await readStore();
  const items = (store.notifications ?? [])
    .filter((item) => item.user_id === user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 30);
  return jsonOk({
    notifications: items,
    unread: items.filter((item) => !item.read_at).length,
  });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;
  const body = await request.json().catch(() => null);
  if (!body || body.action !== "read") return jsonError("Unknown action", 400);
  const id = String(body.id ?? "");
  await updateStore((store) => {
    const item = (store.notifications ?? []).find(
      (row) => row.id === id && row.user_id === user.id
    );
    if (item && !item.read_at) item.read_at = new Date().toISOString();
  });
  return jsonOk({ ok: true });
}
