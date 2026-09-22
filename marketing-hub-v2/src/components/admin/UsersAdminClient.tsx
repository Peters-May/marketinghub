"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccessRequest, Contact, HubAccessRole, HubUser } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { PasswordField } from "@/components/ui/PasswordField";

const ROLE_OPTIONS: {
  value: HubAccessRole;
  label: string;
  hint: string;
  process: string[];
}[] = [
  {
    value: "admin",
    label: "Admin",
    hint: "Full hub + data tables",
    process: [
      "Full hub access plus Admin → Users and data tables.",
      "Use sparingly — prefer Member for day-to-day staff.",
    ],
  },
  {
    value: "member",
    label: "Member",
    hint: "Day-to-day staff access",
    process: [
      "Invite → they set a password from the email.",
      "Sign in at /login → land in /app as staff.",
      "Optional: link a Contact so they can edit My details.",
    ],
  },
  {
    value: "seo",
    label: "SEO",
    hint: "Enquiries only",
    process: [
      "Invite → they set a password from the email.",
      "Sign in → land on Enquiries only (no other hub pages).",
      "Use for Google Ads / SEO partners who need lead attribution.",
    ],
  },
  {
    value: "external",
    label: "External",
    hint: "Outside / media access",
    process: [
      "Invite → they set a password from the email.",
      "Sign in → redirected to /media only (no /app).",
      "Mark relevant Media folders Public so they can see them.",
    ],
  },
];

function roleBadgeClass(role: HubAccessRole) {
  if (role === "admin") return "bg-brand/10 text-brand";
  if (role === "member") return "bg-accent-soft text-brand";
  if (role === "seo") return "bg-sky-50 text-sky-900";
  return "bg-sand text-muted";
}

function formatSignIn(value: string | null | undefined) {
  if (!value) return "Never";
  try {
    // Fixed locale avoids SSR/client hydration mismatches (React #418/#425).
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Invite not yet accepted (Supabase Auth fields present). */
function isInvitePending(u: HubUser) {
  if (u.email_confirmed_at === undefined && u.invited_at === undefined) {
    return false;
  }
  if (u.last_sign_in_at) return false;
  if (u.email_confirmed_at) return false;
  return true;
}

export function UsersAdminClient({
  initial,
  initialSource = "local",
}: {
  initial: HubUser[];
  initialSource?: "supabase" | "local";
}) {
  const [items, setItems] = useState(initial);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [source, setSource] = useState<"supabase" | "local">(initialSource);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [actingUserKey, setActingUserKey] = useState<string | null>(null);
  const [passwordUser, setPasswordUser] = useState<HubUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [settingPassword, setSettingPassword] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role: "member" as HubAccessRole,
    notes: "",
  });

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to load users");
      return;
    }
    setItems(data.users ?? []);
    setSource(data.source === "supabase" ? "supabase" : "local");
    setError(null);
  }, []);

  const refreshContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/contacts");
      if (!res.ok) return;
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAccessRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/access-requests");
      if (!res.ok) return;
      const data = await res.json();
      setAccessRequests(data.requests ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshContacts();
    void refreshAccessRequests();
  }, [refresh, refreshContacts, refreshAccessRequests]);

  const contactByUserId = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts) {
      if (c.user_id) map.set(c.user_id, c);
    }
    return map;
  }, [contacts]);

  const actionableRequests = useMemo(
    () =>
      accessRequests.filter(
        (r) => r.status === "pending" || r.status === "failed"
      ),
    [accessRequests]
  );

  const counts = useMemo(() => {
    return {
      admin: items.filter((u) => u.role === "admin").length,
      member: items.filter((u) => u.role === "member").length,
      seo: items.filter((u) => u.role === "seo").length,
      external: items.filter((u) => u.role === "external").length,
    };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((u) => {
      if (
        !matchesSearch(search, [
          u.full_name,
          u.email,
          u.role,
          plainTextFromHtml(u.notes),
        ])
      ) {
        return false;
      }
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      return true;
    });
  }, [items, search, roleFilter]);

  const selectedRoleOption =
    ROLE_OPTIONS.find((r) => r.value === form.role) ?? ROLE_OPTIONS[1];

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not add user");
      return;
    }
    setShowForm(false);
    setForm({ full_name: "", email: "", role: "member", notes: "" });
    await refresh();
  }

  async function setRole(id: string, role: HubAccessRole) {
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, patch: { role } }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not update role");
      return;
    }
    await refresh();
  }

  async function setContactLink(userId: string, contactId: string) {
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: userId,
        patch: { contact_id: contactId || null },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not link contact");
      return;
    }
    await refreshContacts();
  }

  async function remove(id: string) {
    if (
      !window.confirm(
        source === "supabase"
          ? "Remove this user from Supabase Auth? They will no longer be able to sign in."
          : "Remove this user?"
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not remove user");
      return;
    }
    await refresh();
  }

  async function reinvite(id: string, email: string) {
    if (
      !window.confirm(
        `Resend the invite email to ${email || "this user"}?`
      )
    ) {
      return;
    }
    setActingUserKey(`${id}:reinvite`);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reinvite", id }),
    });
    const data = await res.json();
    setActingUserKey(null);
    if (!res.ok) {
      setError(data.error ?? "Could not resend invite");
      return;
    }
    setNotice(data.message ?? `Invite resent to ${email}`);
    await refresh();
  }

  async function sendPasswordReset(id: string, email: string) {
    if (
      !window.confirm(
        `Send a password reset email to ${email || "this user"}?`
      )
    ) {
      return;
    }
    setActingUserKey(`${id}:reset`);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_password_reset", id }),
    });
    const data = await res.json();
    setActingUserKey(null);
    if (!res.ok) {
      setError(data.error ?? "Could not send password reset");
      return;
    }
    setNotice(data.message ?? `Password reset sent to ${email}`);
  }

  function openSetPassword(user: HubUser) {
    setPasswordUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setError(null);
    setNotice(null);
  }

  function closeSetPassword() {
    setPasswordUser(null);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setSettingPassword(false);
  }

  async function submitSetPassword() {
    if (!passwordUser) return;
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setSettingPassword(true);
    setPasswordError(null);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_password",
        id: passwordUser.id,
        password: newPassword,
      }),
    });
    const data = await res.json();
    setSettingPassword(false);
    if (!res.ok) {
      setPasswordError(data.error ?? "Could not set password");
      return;
    }
    setNotice(
      data.message ??
        `Password updated for ${passwordUser.email || passwordUser.full_name}`
    );
    closeSetPassword();
  }

  async function decideAccessRequest(
    id: string,
    action: "approve" | "deny" | "dismiss"
  ) {
    setActingRequestId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Could not ${action} request`);
        await refreshAccessRequests();
        return;
      }
      if (data.message) setNotice(data.message);
      await refreshAccessRequests();
      if (action === "approve") await refresh();
    } catch {
      setError(`Could not ${action} request`);
    } finally {
      setActingRequestId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description={
          source === "supabase"
            ? "Supabase Auth users and profile roles — Admin, Member, SEO, or External."
            : "Local demo users. Set SUPABASE_SERVICE_ROLE_KEY to manage live Supabase users."
        }
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm(true)}
          >
            {source === "supabase" ? "Invite user" : "Add user"}
          </button>
        }
      />

      <p className="mb-4 text-xs text-muted">
        Source:{" "}
        <span className="font-medium text-foreground">
          {source === "supabase" ? "Supabase Auth + profiles" : "Local store"}
        </span>
        {" · "}
        Public form:{" "}
        <a href="/request-access" className="text-brand underline-offset-2 hover:underline">
          /request-access
        </a>
      </p>

      {error ? (
        <p className="mb-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="mb-4 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-brand">
          {notice}
        </p>
      ) : null}

      {actionableRequests.length > 0 ? (
        <div className="surface-card mb-6 overflow-hidden">
          <div className="border-b border-border bg-sand/50 px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              Access requests{" "}
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                {actionableRequests.length}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              External requests from the public form. Accept sends an External
              invite; use Invite user for Member access (non–P&amp;M).
            </p>
          </div>
          <ul className="divide-y divide-border">
            {actionableRequests.map((req) => (
              <li
                key={req.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{req.full_name}</p>
                  <p className="truncate text-sm text-muted">{req.email}</p>
                  {req.organisation ? (
                    <p className="text-xs text-muted">{req.organisation}</p>
                  ) : null}
                  {req.reason ? (
                    <p className="mt-1 text-xs text-muted">{req.reason}</p>
                  ) : null}
                  {req.status === "failed" && req.error_message ? (
                    <p className="mt-1 text-xs text-[var(--danger)]">
                      {req.error_message}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  {req.status === "failed" ? (
                    <>
                      {!/already\s+(been\s+)?registered|already\s+exists/i.test(
                        req.error_message ?? ""
                      ) ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={actingRequestId === req.id}
                          onClick={() =>
                            void decideAccessRequest(req.id, "approve")
                          }
                        >
                          {actingRequestId === req.id ? "…" : "Retry"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={actingRequestId === req.id}
                        onClick={() =>
                          void decideAccessRequest(req.id, "dismiss")
                        }
                      >
                        {actingRequestId === req.id ? "…" : "Dismiss"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={actingRequestId === req.id}
                        onClick={() =>
                          void decideAccessRequest(req.id, "approve")
                        }
                      >
                        {actingRequestId === req.id ? "…" : "Accept"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={actingRequestId === req.id}
                        onClick={() => void decideAccessRequest(req.id, "deny")}
                      >
                        Deny
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() =>
              setRoleFilter(roleFilter === opt.value ? "all" : opt.value)
            }
            className={cn(
              "surface-card p-4 text-left transition",
              roleFilter === opt.value && "border-accent ring-1 ring-accent"
            )}
          >
            <p className="text-xs uppercase tracking-wide text-muted">
              {opt.label}
            </p>
            <p className="mt-1 font-display text-2xl text-brand">
              {counts[opt.value]}
            </p>
            <p className="mt-1 text-xs text-muted">{opt.hint}</p>
          </button>
        ))}
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email…"
        resultCount={filtered.length}
        totalCount={items.length}
        selects={[
          {
            id: "role",
            label: "Role",
            value: roleFilter,
            onChange: setRoleFilter,
            options: [
              { value: "all", label: "All roles" },
              ...ROLE_OPTIONS.map((r) => ({
                value: r.value,
                label: r.label,
              })),
            ],
          },
        ]}
      />

      {showForm ? (
        <div className="surface-card mb-6 grid gap-3 p-5 md:grid-cols-2">
          <div>
            <label className="label">Full name</label>
            <input
              className="field"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="field"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Access role</label>
            <SearchSelect
              className="field"
              value={form.role}
              onChange={(role) =>
                setForm({ ...form, role: role as HubAccessRole })
              }
              options={ROLE_OPTIONS.map((r) => ({
                value: r.value,
                label: r.label,
              }))}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <RichTextEditor
              value={form.notes}
              onChange={(notes) => setForm({ ...form, notes })}
              placeholder="Notes…"
              minHeight="70px"
            />
          </div>
          <div className="rounded-xl border border-border bg-sand/40 px-4 py-3 text-xs text-muted md:col-span-2">
            <p className="font-medium text-foreground">
              {selectedRoleOption.label}: suggested process
            </p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              {selectedRoleOption.process.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            {source === "supabase" ? (
              <p className="mt-2">
                Sends a Supabase invite email. Role is stored on{" "}
                <code className="text-[11px]">profiles</code> and{" "}
                <code className="text-[11px]">app_metadata</code>.
              </p>
            ) : null}
          </div>
          <div className="flex gap-2 md:col-span-2">
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={() => void create()}
            >
              {saving
                ? "Saving…"
                : source === "supabase"
                  ? "Send invite"
                  : "Save"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {passwordUser ? (
        <div className="surface-card mb-6 max-w-md space-y-3 p-5">
          <div>
            <p className="font-medium text-foreground">Set password</p>
            <p className="mt-1 text-xs text-muted">
              Set a new password for{" "}
              <span className="text-foreground">
                {passwordUser.email || passwordUser.full_name || "this user"}
              </span>
              . They can sign in with it immediately — no email is sent.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="admin-new-password">
              New password
            </label>
            <PasswordField
              id="admin-new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
              placeholder="At least 8 characters"
              minLength={8}
            />
          </div>
          <div>
            <label className="label" htmlFor="admin-confirm-password">
              Confirm password
            </label>
            <PasswordField
              id="admin-confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
              placeholder="Confirm password"
              minLength={8}
            />
          </div>
          {passwordError ? (
            <p className="text-sm text-[var(--danger)]">{passwordError}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={
                settingPassword || !newPassword || !confirmPassword
              }
              onClick={() => void submitSetPassword()}
            >
              {settingPassword ? "Saving…" : "Set password"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={settingPassword}
              onClick={closeSetPassword}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="surface-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-sand/50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">
                Linked contact
              </th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">
                Last sign-in
              </th>
              <th className="hidden px-4 py-3 font-semibold xl:table-cell">
                Notes
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{u.full_name || "—"}</td>
                <td className="px-4 py-3">
                  {u.email ? (
                    <a
                      href={`mailto:${u.email}`}
                      className="text-brand hover:underline"
                    >
                      {u.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <SearchSelect
                    className={cn(
                      "rounded-lg border-0 px-2 py-1 text-xs font-medium",
                      roleBadgeClass(u.role)
                    )}
                    value={u.role}
                    onChange={(role) =>
                      void setRole(u.id, role as HubAccessRole)
                    }
                    aria-label={`Role for ${u.full_name || u.email}`}
                    options={ROLE_OPTIONS.map((r) => ({
                      value: r.value,
                      label: r.label,
                    }))}
                  />
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <SearchSelect
                    className="field !py-1 text-xs"
                    value={contactByUserId.get(u.id)?.id ?? ""}
                    allowEmpty
                    emptyLabel="None"
                    placeholder="None"
                    onChange={(value) => void setContactLink(u.id, value)}
                    aria-label={`Linked contact for ${u.full_name || u.email}`}
                    options={contacts.map((c) => {
                      const takenByOther = !!c.user_id && c.user_id !== u.id;
                      return {
                        value: c.id,
                        label: `${c.name}${c.organisation ? ` · ${c.organisation}` : ""}${takenByOther ? " (linked)" : ""}`,
                        disabled: takenByOther,
                      };
                    })}
                  />
                </td>
                <td className="hidden px-4 py-3 text-muted md:table-cell">
                  <span className="block">{formatSignIn(u.last_sign_in_at)}</span>
                  {source === "supabase" && isInvitePending(u) ? (
                    <span className="mt-0.5 inline-block rounded-full bg-sand px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Invite pending
                    </span>
                  ) : null}
                </td>
                <td className="hidden px-4 py-3 text-muted xl:table-cell">
                  <RichTextView html={u.notes} plain clampLines={2} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end">
                    {source === "supabase" ? (
                      <>
                        {isInvitePending(u) ? (
                          <button
                            type="button"
                            className="text-xs text-brand hover:underline disabled:opacity-50"
                            disabled={actingUserKey === `${u.id}:reinvite`}
                            onClick={() => void reinvite(u.id, u.email)}
                          >
                            {actingUserKey === `${u.id}:reinvite`
                              ? "Sending…"
                              : "Resend invite"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs text-brand hover:underline disabled:opacity-50"
                          disabled={actingUserKey === `${u.id}:reset`}
                          onClick={() => void sendPasswordReset(u.id, u.email)}
                        >
                          {actingUserKey === `${u.id}:reset`
                            ? "Sending…"
                            : "Send password reset"}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-brand hover:underline"
                          onClick={() => openSetPassword(u)}
                        >
                          Set password
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs text-[var(--danger)]"
                      onClick={() => void remove(u.id)}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            No users match your search. Invite someone above.
          </p>
        ) : null}
      </div>
    </div>
  );
}
