import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createHubUser,
  deleteHubUser,
  linkUserToContact,
  listHubUsers,
  updateHubUser,
} from "@/lib/data/repos";
import { HUB_ACCESS_ROLES } from "@/lib/auth/roles";
import type { HubAccessRole } from "@/lib/types";
import {
  deleteSupabaseHubUser,
  hasServiceRoleKey,
  inviteSupabaseHubUser,
  listSupabaseHubUsers,
  reinviteSupabaseHubUser,
  sendPasswordResetForHubUser,
  setPasswordForHubUser,
  updateSupabaseHubUser,
} from "@/lib/supabase/hub-users";

const ROLES: HubAccessRole[] = HUB_ACCESS_ROLES;

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    if (hasServiceRoleKey()) {
      return jsonOk({
        users: await listSupabaseHubUsers(),
        source: "supabase",
      });
    }
    return jsonOk({ users: await listHubUsers(), source: "local" });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to load users",
      500
    );
  }
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await request.json();
  const action = body.action as string | undefined;
  const useSupabase = hasServiceRoleKey();

  try {
    if (action === "update") {
      const patch = { ...(body.patch ?? {}) } as Record<string, unknown>;
      if (patch.role !== undefined && !ROLES.includes(patch.role as HubAccessRole)) {
        return jsonError("Role must be admin, member, seo, or external");
      }

      if ("contact_id" in patch) {
        const contactId =
          patch.contact_id === null || patch.contact_id === ""
            ? null
            : String(patch.contact_id);
        await linkUserToContact(body.id, contactId);
        delete patch.contact_id;
      }

      const hasUserFields =
        patch.role !== undefined ||
        patch.full_name !== undefined ||
        patch.notes !== undefined ||
        patch.email !== undefined;

      let updated = null;
      if (hasUserFields) {
        updated = useSupabase
          ? await updateSupabaseHubUser(body.id, patch)
          : await updateHubUser(body.id, patch);
        if (!updated) return jsonError("Not found", 404);
      } else {
        // Contact link-only update — still return the user record.
        const users = useSupabase
          ? await listSupabaseHubUsers()
          : await listHubUsers();
        updated = users.find((u) => u.id === body.id) ?? null;
        if (!updated) return jsonError("Not found", 404);
      }

      return jsonOk({
        item: updated,
        source: useSupabase ? "supabase" : "local",
      });
    }

    if (action === "delete") {
      if (useSupabase) {
        await deleteSupabaseHubUser(body.id);
      } else {
        await deleteHubUser(body.id);
      }
      return jsonOk({ ok: true });
    }

    if (action === "reinvite") {
      if (!useSupabase) {
        return jsonError(
          "Resend invite requires SUPABASE_SERVICE_ROLE_KEY",
          400
        );
      }
      if (!body.id) return jsonError("User id is required");
      const result = await reinviteSupabaseHubUser(String(body.id));
      const message =
        result.delivery === "invite"
          ? "Invite resent"
          : "Invite could not be resent; sent a password setup email instead";
      return jsonOk({
        item: result.user,
        source: "supabase",
        delivery: result.delivery,
        message,
      });
    }

    if (action === "send_password_reset") {
      if (!useSupabase) {
        return jsonError(
          "Password reset requires SUPABASE_SERVICE_ROLE_KEY",
          400
        );
      }
      if (!body.id) return jsonError("User id is required");
      await sendPasswordResetForHubUser(String(body.id));
      return jsonOk({
        ok: true,
        source: "supabase",
        message: "Password reset email sent",
      });
    }

    if (action === "set_password") {
      if (!useSupabase) {
        return jsonError(
          "Set password requires SUPABASE_SERVICE_ROLE_KEY",
          400
        );
      }
      if (!body.id) return jsonError("User id is required");
      const password = String(body.password ?? "");
      if (password.length < 8) {
        return jsonError("Password must be at least 8 characters");
      }
      await setPasswordForHubUser(String(body.id), password);
      return jsonOk({
        ok: true,
        source: "supabase",
        message: "Password updated",
      });
    }

    const role = (body.role as HubAccessRole) ?? "member";
    if (!ROLES.includes(role)) {
      return jsonError("Role must be admin, member, seo, or external");
    }
    if (!String(body.email ?? "").trim()) {
      return jsonError("Email is required");
    }

    const item = useSupabase
      ? await inviteSupabaseHubUser({
          email: body.email,
          full_name: body.full_name ?? "",
          role,
          notes: body.notes ?? "",
        })
      : await createHubUser({
          email: body.email,
          full_name: body.full_name ?? "",
          role,
          notes: body.notes ?? "",
        });

    if (body.contact_id !== undefined && body.contact_id !== null && body.contact_id !== "") {
      await linkUserToContact(item.id, String(body.contact_id));
    }

    return jsonOk(
      { item, source: useSupabase ? "supabase" : "local" },
      { status: 201 }
    );
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "User action failed",
      400
    );
  }
}
