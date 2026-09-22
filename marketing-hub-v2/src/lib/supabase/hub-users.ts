import type { User } from "@supabase/supabase-js";
import { hasSupabaseConfig } from "@/lib/auth/config";
import {
  HUB_ACCESS_ROLE_ORDER,
  normalizeHubAccessRole,
} from "@/lib/auth/roles";
import {
  createAdminClient,
  hasServiceRoleKey,
} from "@/lib/supabase/admin";
import type { HubAccessRole, HubUser } from "@/lib/types";

export { hasServiceRoleKey, normalizeHubAccessRole };
export { hubRoleToSessionRole } from "@/lib/auth/roles";

/** Public app origin for Auth email redirectTo (must be allow-listed in Supabase). */
export function getAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3001";
}

/** Invite / recovery emails land here, then the user sets a password. */
export function passwordSetupRedirectUrl() {
  const next = encodeURIComponent("/set-password");
  return `${getAppUrl()}/auth/callback?next=${next}`;
}

function displayName(user: User): string {
  const meta = user.user_metadata ?? {};
  return (
    (meta.full_name as string | undefined)?.trim() ||
    (meta.name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "User"
  );
}

function toHubUser(
  user: User,
  profileRole: string | null | undefined,
  profileEmail?: string | null
): HubUser {
  const meta = user.user_metadata ?? {};
  const appRole = (user.app_metadata as { role?: string } | undefined)?.role;
  return {
    id: user.id,
    email: (profileEmail || user.email || "").trim().toLowerCase(),
    full_name: displayName(user),
    role: normalizeHubAccessRole(profileRole ?? appRole),
    notes: String(meta.notes ?? ""),
    last_sign_in_at: user.last_sign_in_at ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    invited_at: user.invited_at ?? null,
    created_at: user.created_at,
    updated_at: user.updated_at ?? user.created_at,
  };
}

/** True when the user was invited but has not confirmed / signed in yet. */
export function isHubUserInvitePending(user: HubUser) {
  // Local demo users omit these fields — do not treat them as pending invites.
  if (user.email_confirmed_at === undefined && user.invited_at === undefined) {
    return false;
  }
  if (user.last_sign_in_at) return false;
  if (user.email_confirmed_at) return false;
  return true;
}

async function listAllAuthUsers() {
  const supabase = createAdminClient();
  const users: User[] = [];
  let page = 1;
  const perPage = 200;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(error.message);
    const batch = data.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  return users;
}

export async function listSupabaseHubUsers(): Promise<HubUser[]> {
  const supabase = createAdminClient();
  const [authUsers, profilesRes] = await Promise.all([
    listAllAuthUsers(),
    supabase
      .from("profiles")
      .select("user_id, role, email, is_archived")
      .or("is_archived.is.null,is_archived.eq.false"),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const roleByUser = new Map(
    (profilesRes.data ?? []).map((p) => [
      p.user_id as string,
      {
        role: p.role as string,
        email: (p.email as string | null) ?? null,
      },
    ])
  );

  const users = authUsers.map((u) => {
    const profile = roleByUser.get(u.id);
    return toHubUser(u, profile?.role, profile?.email);
  });

  return users.sort((a, b) => {
    const byRole =
      HUB_ACCESS_ROLE_ORDER[a.role] - HUB_ACCESS_ROLE_ORDER[b.role];
    if (byRole !== 0) return byRole;
    return a.full_name.localeCompare(b.full_name);
  });
}

async function upsertProfile(
  userId: string,
  email: string,
  role: HubAccessRole
) {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("profiles")
      .update({
        role,
        email,
        updated_at: new Date().toISOString(),
        is_archived: false,
      })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("profiles").insert({
    user_id: userId,
    role,
    email,
  });
  if (error) throw new Error(error.message);
}

async function syncAuthMetadata(
  userId: string,
  role: HubAccessRole,
  fullName?: string,
  notes?: string,
  existing?: User
) {
  const supabase = createAdminClient();
  const user =
    existing ??
    (await supabase.auth.admin.getUserById(userId)).data.user ??
    undefined;

  const patch: {
    app_metadata: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  } = {
    app_metadata: {
      ...(user?.app_metadata ?? {}),
      role,
    },
  };
  if (fullName !== undefined || notes !== undefined) {
    patch.user_metadata = {
      ...(user?.user_metadata ?? {}),
    };
    if (fullName !== undefined) patch.user_metadata.full_name = fullName;
    if (notes !== undefined) patch.user_metadata.notes = notes;
  }
  const { error } = await supabase.auth.admin.updateUserById(userId, patch);
  if (error) throw new Error(error.message);
}

export async function inviteSupabaseHubUser(input: {
  email: string;
  full_name: string;
  role: HubAccessRole;
  notes?: string;
  organisation?: string;
}): Promise<HubUser> {
  const supabase = createAdminClient();
  const email = input.email.trim().toLowerCase();
  const role = normalizeHubAccessRole(input.role);
  const fullName = input.full_name.trim() || email.split("@")[0];
  const notes = input.notes ?? "";

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      notes,
      role,
    },
    redirectTo: passwordSetupRedirectUrl(),
  });
  if (error) throw new Error(error.message);
  const user = data.user;
  if (!user) throw new Error("Invite succeeded but no user returned");

  await upsertProfile(user.id, email, role);
  await syncAuthMetadata(user.id, role, fullName, notes, user);

  const { ensureContactForUser } = await import("@/lib/data/repos");
  await ensureContactForUser({
    userId: user.id,
    email,
    full_name: fullName,
    organisation: input.organisation,
    notes,
  });

  return toHubUser(
    {
      ...user,
      user_metadata: {
        ...user.user_metadata,
        full_name: fullName,
        notes,
      },
      app_metadata: { ...user.app_metadata, role },
    },
    role,
    email
  );
}

export async function updateSupabaseHubUser(
  id: string,
  patch: Partial<Pick<HubUser, "role" | "full_name" | "notes" | "email">>
): Promise<HubUser | null> {
  const supabase = createAdminClient();
  const { data: existing, error: getError } =
    await supabase.auth.admin.getUserById(id);
  if (getError) throw new Error(getError.message);
  if (!existing.user) return null;

  const role = patch.role
    ? normalizeHubAccessRole(patch.role)
    : normalizeHubAccessRole(
        (
          await supabase
            .from("profiles")
            .select("role")
            .eq("user_id", id)
            .maybeSingle()
        ).data?.role ??
          (existing.user.app_metadata as { role?: string })?.role
      );

  const fullName =
    patch.full_name !== undefined
      ? patch.full_name.trim()
      : displayName(existing.user);
  const notes =
    patch.notes !== undefined
      ? patch.notes
      : String(existing.user.user_metadata?.notes ?? "");
  const email =
    patch.email !== undefined
      ? patch.email.trim().toLowerCase()
      : (existing.user.email ?? "").toLowerCase();

  if (patch.email && patch.email !== existing.user.email) {
    const { error } = await supabase.auth.admin.updateUserById(id, { email });
    if (error) throw new Error(error.message);
  }

  await syncAuthMetadata(id, role, fullName, notes, existing.user);
  await upsertProfile(id, email, role);

  if (patch.email && patch.email.trim().toLowerCase() !== (existing.user.email ?? "").toLowerCase()) {
    const { ensureContactForUser } = await import("@/lib/data/repos");
    await ensureContactForUser({
      userId: id,
      email,
      full_name: fullName,
      notes,
      createIfMissing: false,
    });
  }

  const { data: refreshed, error: refreshError } =
    await supabase.auth.admin.getUserById(id);
  if (refreshError) throw new Error(refreshError.message);
  if (!refreshed.user) return null;

  return toHubUser(refreshed.user, role, email);
}

export async function deleteSupabaseHubUser(id: string): Promise<void> {
  const userId = String(id ?? "").trim();
  if (!userId) throw new Error("User id is required");

  const supabase = createAdminClient();

  // Clear NO ACTION / RESTRICT FKs (e.g. automation_runs.created_by) first.
  const { error: clearError } = await supabase.rpc(
    "clear_auth_user_restrict_refs",
    { target_user_id: userId }
  );
  if (clearError) {
    throw new Error(
      clearError.message || "Failed to clear user references before delete"
    );
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (!error) return;

  // Retry once: first clear can miss rows if a concurrent write re-linked the user.
  const { error: retryClearError } = await supabase.rpc(
    "clear_auth_user_restrict_refs",
    { target_user_id: userId }
  );
  if (retryClearError) {
    throw new Error(
      retryClearError.message ||
        "Failed to clear user references before delete retry"
    );
  }

  const { error: retryError } = await supabase.auth.admin.deleteUser(userId);
  if (retryError) throw new Error(retryError.message);
}

/**
 * Resend the invite email for an existing Auth user (e.g. expired / lost invite).
 * Tries inviteUserByEmail again (supported for pending invites on current GoTrue).
 * Falls back to a recovery email if re-invite is rejected.
 */
export async function reinviteSupabaseHubUser(id: string): Promise<{
  user: HubUser;
  delivery: "invite" | "recovery";
}> {
  const supabase = createAdminClient();
  const { data: existing, error: getError } =
    await supabase.auth.admin.getUserById(id);
  if (getError) throw new Error(getError.message);
  const user = existing.user;
  if (!user?.email) throw new Error("User not found or has no email");

  if (user.last_sign_in_at || user.email_confirmed_at) {
    throw new Error(
      "This user already activated their account. Use Send password reset instead."
    );
  }

  const email = user.email.trim().toLowerCase();
  const fullName = displayName(user);
  const notes = String(user.user_metadata?.notes ?? "");
  const role = normalizeHubAccessRole(
    (
      await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", id)
        .maybeSingle()
    ).data?.role ?? (user.app_metadata as { role?: string } | undefined)?.role
  );

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      notes,
      role,
    },
    redirectTo: passwordSetupRedirectUrl(),
  });

  if (!error && data.user) {
    await upsertProfile(data.user.id, email, role);
    await syncAuthMetadata(data.user.id, role, fullName, notes, data.user);
    return {
      user: toHubUser(data.user, role, email),
      delivery: "invite",
    };
  }

  const alreadyExists = /already (been )?registered|already exists|duplicate/i.test(
    error?.message ?? ""
  );
  if (error && !alreadyExists) {
    throw new Error(error.message);
  }

  // Fallback when GoTrue rejects a second invite for an existing pending user.
  await sendRecoveryEmail(email);
  return {
    user: toHubUser(user, role, email),
    delivery: "recovery",
  };
}

async function sendRecoveryEmail(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase is not configured");

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: passwordSetupRedirectUrl(),
  });
  if (error) throw new Error(error.message);
}

/**
 * Send a password-recovery email (Reset Password template) for an existing user.
 */
export async function sendPasswordResetForHubUser(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: existing, error: getError } =
    await supabase.auth.admin.getUserById(id);
  if (getError) throw new Error(getError.message);
  const email = existing.user?.email?.trim().toLowerCase();
  if (!email) throw new Error("User not found or has no email");

  await sendRecoveryEmail(email);
}

/**
 * Set a user's password directly via the Auth admin API (no email).
 */
export async function setPasswordForHubUser(
  id: string,
  password: string
): Promise<void> {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const supabase = createAdminClient();
  const { data: existing, error: getError } =
    await supabase.auth.admin.getUserById(id);
  if (getError) throw new Error(getError.message);
  if (!existing.user) throw new Error("User not found");

  const { error } = await supabase.auth.admin.updateUserById(id, {
    password,
    // So invite-pending users can sign in immediately after an admin sets a password.
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
}

/** Resolve hub role from profiles (preferred) or app_metadata. */
export async function getProfileRoleForUser(
  userId: string
): Promise<HubAccessRole | null> {
  if (!hasSupabaseConfig()) return null;

  try {
    if (hasServiceRoleKey()) {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.role) return normalizeHubAccessRole(data.role);
      return null;
    }

    const { createClient: createServerClient } = await import(
      "@/lib/supabase/server"
    );
    const server = await createServerClient();
    const { data } = await server
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.role) return normalizeHubAccessRole(data.role);
    return null;
  } catch {
    return null;
  }
}

