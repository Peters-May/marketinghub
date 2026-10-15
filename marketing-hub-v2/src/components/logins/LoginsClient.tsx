"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, ExternalLink, KeyRound } from "lucide-react";
import type { PlatformCredential } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import {
  PLATFORM_CREDENTIAL_PLATFORMS,
  optionsForField,
  type FieldOption,
} from "@/lib/data/collections";
import { useManagedFieldOptions } from "@/lib/data/useManagedFieldOptions";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";

const emptyForm = {
  platform: "Planable",
  url: "",
  username: "",
  password: "",
  notes: "",
};

type LoginForm = typeof emptyForm;

function toForm(item: PlatformCredential): LoginForm {
  return {
    platform: item.platform,
    url: item.url,
    username: item.username,
    password: item.password,
    notes: item.notes,
  };
}

async function copyText(value: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    /* clipboard may be blocked */
  }
}

export function LoginsClient({
  initial,
  fieldOptions: fieldOptionsProp,
}: {
  initial: PlatformCredential[];
  fieldOptions?: Record<string, FieldOption[]>;
}) {
  const fieldOptions = useManagedFieldOptions(
    "platform_credentials",
    fieldOptionsProp
  );
  const platformOptions = optionsForField(
    fieldOptions,
    "platform",
    PLATFORM_CREDENTIAL_PLATFORMS
  );

  const [items, setItems] = useState(initial);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<LoginForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/logins");
    const data = await res.json();
    setItems(data.logins ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    return items.filter((item) =>
      matchesSearch(search, [
        item.platform,
        item.url,
        item.username,
        item.notes,
      ])
    );
  }, [items, search]);

  function flashCopied(key: string) {
    setCopied(key);
    window.setTimeout(() => {
      setCopied((current) => (current === key ? null : current));
    }, 1500);
  }

  async function create() {
    const res = await fetch("/api/logins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<PlatformCredential>(data);
    if (!res.ok || !item) return;
    setItems((prev) => upsertById(prev, item));
    setShowForm(false);
    setForm(emptyForm);
  }

  async function saveEdit() {
    if (!editingId || !edit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/logins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          patch: edit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const item = rowFromResponse<PlatformCredential>(data);
      if (!res.ok || !item) return;
      setItems((prev) => upsertById(prev, item));
      setEditingId(null);
      setEdit(null);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this login?")) return;
    const res = await fetch("/api/logins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (!res.ok) return;
    setItems((prev) => removeById(prev, id));
    if (editingId === id) {
      setEditingId(null);
      setEdit(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Logins"
        description="Shared marketing platform credentials. Admin only — this is an internal vault, not a replacement for a password manager."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm(true)}
          >
            Add login
          </button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search platform, username…"
        resultCount={filtered.length}
        totalCount={items.length}
      />

      {showForm ? (
        <div className="surface-card mb-6 p-5">
          <LoginFields
            form={form}
            onChange={setForm}
            platformOptions={platformOptions}
            showPassword
          />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void create()}
            >
              Save
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

      <div className="space-y-3">
        {filtered.map((item) => {
          const isEditing = editingId === item.id && edit;
          const showPass = revealed[item.id] === true;
          return (
            <article key={item.id} className="surface-card p-5">
              {isEditing && edit ? (
                <div>
                  <LoginFields
                    form={edit}
                    onChange={setEdit}
                    platformOptions={platformOptions}
                    showPassword
                  />
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={saving}
                      onClick={() => void saveEdit()}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setEditingId(null);
                        setEdit(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-accent-soft p-2.5 text-brand">
                        <KeyRound className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium">{item.platform}</h3>
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-sm text-brand hover:underline"
                          >
                            {item.url}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <p className="text-sm text-muted">No URL</p>
                        )}
                      </div>
                    </div>

                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <dt className="label !mb-0.5">Username</dt>
                        <dd className="flex items-center gap-2 text-sm">
                          <span className="truncate">
                            {item.username || "—"}
                          </span>
                          {item.username ? (
                            <button
                              type="button"
                              className="btn-ghost px-2 py-1 text-xs"
                              onClick={() => {
                                void copyText(item.username);
                                flashCopied(`${item.id}-user`);
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {copied === `${item.id}-user` ? "Copied" : "Copy"}
                            </button>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt className="label !mb-0.5">Password</dt>
                        <dd className="flex items-center gap-2 text-sm">
                          <span className="truncate font-mono">
                            {showPass
                              ? item.password || "—"
                              : item.password
                                ? "••••••••"
                                : "—"}
                          </span>
                          {item.password ? (
                            <>
                              <button
                                type="button"
                                className="btn-ghost px-2 py-1 text-xs"
                                onClick={() =>
                                  setRevealed((prev) => ({
                                    ...prev,
                                    [item.id]: !showPass,
                                  }))
                                }
                              >
                                {showPass ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                                {showPass ? "Hide" : "Show"}
                              </button>
                              <button
                                type="button"
                                className="btn-ghost px-2 py-1 text-xs"
                                onClick={() => {
                                  void copyText(item.password);
                                  flashCopied(`${item.id}-pass`);
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {copied === `${item.id}-pass`
                                  ? "Copied"
                                  : "Copy"}
                              </button>
                            </>
                          ) : null}
                        </dd>
                      </div>
                    </dl>
                    {item.notes ? (
                      <p className="mt-3 text-sm text-muted">{item.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 md:flex-col">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setEditingId(item.id);
                        setEdit(toForm(item));
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-[var(--danger)]"
                      onClick={() => void remove(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {filtered.length === 0 ? (
          <p className="surface-card p-6 text-sm text-muted">
            No logins match your search.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LoginFields({
  form,
  onChange,
  platformOptions,
  showPassword,
}: {
  form: LoginForm;
  onChange: (next: LoginForm) => void;
  platformOptions: FieldOption[];
  showPassword?: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="label">Platform</label>
        <SearchSelect
          className="field"
          value={form.platform}
          onChange={(platform) => onChange({ ...form, platform })}
          options={platformOptions}
        />
      </div>
      <div>
        <label className="label">URL</label>
        <input
          className="field"
          value={form.url}
          onChange={(e) => onChange({ ...form, url: e.target.value })}
          placeholder="https://…"
        />
      </div>
      <div>
        <label className="label">Username</label>
        <input
          className="field"
          value={form.username}
          onChange={(e) => onChange({ ...form, username: e.target.value })}
          autoComplete="off"
        />
      </div>
      <div>
        <label className="label">Password</label>
        <input
          className="field"
          type={showPassword ? "text" : "password"}
          value={form.password}
          onChange={(e) => onChange({ ...form, password: e.target.value })}
          autoComplete="new-password"
        />
      </div>
      <div className="md:col-span-2">
        <label className="label">Notes</label>
        <textarea
          className="field min-h-[70px]"
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
        />
      </div>
    </div>
  );
}
