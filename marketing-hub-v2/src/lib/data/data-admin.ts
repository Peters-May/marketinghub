import { promises as fs } from "fs";
import path from "path";
import { uid } from "@/lib/utils";
import { readStore, updateStore } from "@/lib/store/local";
import { getDataDir } from "@/lib/store/paths";
import type { ContentStatus, HubStore } from "@/lib/types";
import {
  CONTENT_STATUS,
  DATA_COLLECTIONS,
  contactOwnerOptions,
  getCollection,
  inferFieldType,
  isCollectionKey,
  themeLinkOptions,
  MANAGEABLE_FIELD_TYPES,
  type CollectionKey,
  type FieldDef,
  type FieldOption,
  type FieldType,
} from "@/lib/data/collections";

const CONTENT_STATUS_COLLECTIONS = new Set<CollectionKey>([
  "content",
  "theme_mains",
  "theme_offshoots",
]);

function withCancelledContentStatus(
  collection: CollectionKey,
  key: string,
  options: FieldOption[] | undefined
): FieldOption[] | undefined {
  if (key !== "status" || !CONTENT_STATUS_COLLECTIONS.has(collection)) {
    return options;
  }
  if (!options?.length) return CONTENT_STATUS;
  if (options.some((o) => o.value === "cancelled")) return options;
  const cancelled = CONTENT_STATUS.find((o) => o.value === "cancelled");
  return cancelled ? [...options, cancelled] : options;
}

const DATA_DIR = getDataDir();
const EXTRAS_PATH = path.join(DATA_DIR, "field-extras.json");

export type StoredFieldDef = {
  key: string;
  label: string;
  type: FieldType;
  options?: FieldOption[];
  /** True when this is a custom (non-core) field. */
  custom?: boolean;
};

function isManageableType(
  type: FieldType
): type is Exclude<FieldType, "readonly"> {
  return (MANAGEABLE_FIELD_TYPES as readonly FieldType[]).includes(type);
}

type FieldExtras = Partial<Record<CollectionKey, StoredFieldDef[]>>;

function isFieldType(value: unknown): value is FieldType {
  return (
    typeof value === "string" &&
    [
      "text",
      "longtext",
      "number",
      "date",
      "datetime",
      "url",
      "email",
      "select",
      "tags",
      "readonly",
    ].includes(value)
  );
}

function normalizeOptions(raw: unknown): FieldOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const options = raw
    .map((item) => {
      if (typeof item === "string") {
        const value = item.trim();
        return value ? { value, label: value } : null;
      }
      if (item && typeof item === "object") {
        const value = String(
          (item as { value?: unknown }).value ??
            (item as { label?: unknown }).label ??
            ""
        ).trim();
        if (!value) return null;
        const label = String(
          (item as { label?: unknown }).label ?? value
        ).trim();
        return { value, label: label || value };
      }
      return null;
    })
    .filter((o): o is FieldOption => Boolean(o));
  return options.length ? options : undefined;
}

function normalizeStoredField(
  raw: unknown,
  fallbackKey?: string
): StoredFieldDef | null {
  if (typeof raw === "string") {
    const key = slugField(raw);
    if (!key) return null;
    return {
      key,
      label: key.replace(/_/g, " "),
      type: inferFieldType(key),
      custom: true,
    };
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const key = slugField(String(obj.key ?? fallbackKey ?? ""));
  if (!key) return null;
  const type = isFieldType(obj.type) ? obj.type : inferFieldType(key);
  const label =
    typeof obj.label === "string" && obj.label.trim()
      ? obj.label.trim()
      : key.replace(/_/g, " ");
  return {
    key,
    label,
    type,
    options: normalizeOptions(obj.options),
    custom: obj.custom !== false,
  };
}

async function readExtrasFile(): Promise<FieldExtras> {
  try {
    const raw = await fs.readFile(EXTRAS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const extras: FieldExtras = {};
    for (const [collection, value] of Object.entries(parsed)) {
      if (!isCollectionKey(collection) || !Array.isArray(value)) continue;
      const fields = value
        .map((item) => normalizeStoredField(item))
        .filter((f): f is StoredFieldDef => Boolean(f));
      // Deduplicate by key (last wins)
      const byKey = new Map<string, StoredFieldDef>();
      for (const field of fields) byKey.set(field.key, field);
      extras[collection] = Array.from(byKey.values());
    }
    return extras;
  } catch {
    return {};
  }
}

function normalizeExtrasPayload(raw: unknown): FieldExtras {
  if (!raw || typeof raw !== "object") return {};
  const extras: FieldExtras = {};
  for (const [collection, value] of Object.entries(
    raw as Record<string, unknown>
  )) {
    if (!isCollectionKey(collection) || !Array.isArray(value)) continue;
    const fields = value
      .map((item) => normalizeStoredField(item))
      .filter((f): f is StoredFieldDef => Boolean(f));
    const byKey = new Map<string, StoredFieldDef>();
    for (const field of fields) byKey.set(field.key, field);
    extras[collection] = Array.from(byKey.values());
  }
  return extras;
}

async function writeExtrasFile(extras: FieldExtras) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(EXTRAS_PATH, JSON.stringify(extras, null, 2), "utf8");
  } catch (err) {
    console.error("[field-extras] file write failed", err);
  }
}

async function readExtras(): Promise<FieldExtras> {
  const store = await readStore();
  const fromStore = normalizeExtrasPayload(store.field_extras);
  if (Object.keys(fromStore).length > 0) return fromStore;

  // One-time migrate legacy field-extras.json into durable hub_store.
  const fromFile = await readExtrasFile();
  if (Object.keys(fromFile).length > 0) {
    await updateStore((s) => {
      s.field_extras = fromFile;
    });
    return fromFile;
  }
  return {};
}

function emptyValueForType(type: FieldType): unknown {
  if (type === "tags") return [];
  if (type === "number") return null;
  if (type === "date" || type === "datetime") return null;
  return "";
}

function asRows(store: HubStore, key: CollectionKey): Record<string, unknown>[] {
  const value = store[key];
  if (!Array.isArray(value)) return [];
  return value as unknown as Record<string, unknown>[];
}

function discoverKeys(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((k) => keys.add(k));
  }
  return Array.from(keys);
}

function slugField(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function listCollectionSummaries() {
  return DATA_COLLECTIONS.filter((c) => !c.hiddenFromDataAdmin).map((c) => ({
    key: c.key,
    label: c.label,
    description: c.description,
  }));
}

export async function getTable(collection: string) {
  if (!isCollectionKey(collection)) {
    throw new Error("Unknown collection");
  }
  const def = getCollection(collection)!;
  const store = await readStore();
  const rows = asRows(store, collection);
  const extras = await readExtras();
  const stored = extras[collection] ?? [];
  const storedByKey = new Map(stored.map((f) => [f.key, f]));
  const discovered = discoverKeys(rows);
  const coreKeys = new Set(def.fields.map((f) => f.key));

  const fieldMap = new Map<string, FieldDef>();
  for (const field of def.fields) {
    const override = storedByKey.get(field.key);
    if (override) {
      fieldMap.set(field.key, {
        ...field,
        label: override.label || field.label,
        type: field.locked ? field.type : override.type || field.type,
        options: withCancelledContentStatus(
          collection,
          field.key,
          field.optionsSource || field.locked
            ? field.options
            : (override.options ?? field.options)
        ),
        custom: false,
      });
    } else {
      fieldMap.set(field.key, { ...field, custom: false });
    }
  }

  for (const storedField of stored) {
    if (coreKeys.has(storedField.key)) continue;
    fieldMap.set(storedField.key, {
      key: storedField.key,
      label: storedField.label,
      type: storedField.type,
      options: storedField.options,
      locked: storedField.type === "readonly",
      custom: true,
    });
  }

  for (const name of discovered) {
    if (fieldMap.has(name)) continue;
    const type = inferFieldType(name);
    fieldMap.set(name, {
      key: name,
      label: name.replace(/_/g, " "),
      type,
      locked: type === "readonly",
      optionsSource: name.toLowerCase() === "owner" ? "contacts" : undefined,
      custom: true,
    });
  }

  // Keep core fields first, then extras alpha
  const coreOrder = def.fields.map((f) => f.key);
  const rest = Array.from(fieldMap.keys())
    .filter((k) => !coreKeys.has(k))
    .sort((a, b) => a.localeCompare(b));
  const contactOpts = contactOwnerOptions(store.contacts ?? []);
  const themeOpts = themeLinkOptions(store.themes ?? []);
  const fields = [...coreOrder, ...rest]
    .map((k) => fieldMap.get(k)!)
    .filter(Boolean)
    .map((field) => {
      if (field.optionsSource === "contacts") {
        return { ...field, type: "select" as const, options: contactOpts };
      }
      if (field.optionsSource === "themes") {
        return { ...field, type: "select" as const, options: themeOpts };
      }
      return field;
    });

  return {
    collection,
    label: def.label,
    description: def.description,
    fields,
    rows,
    count: rows.length,
  };
}

/** Field options map for page UIs (Field Manager order preserved). */
export async function getFieldOptionsMap(
  collection: string
): Promise<Record<string, FieldOption[]>> {
  const table = await getTable(collection);
  const map: Record<string, FieldOption[]> = {};
  for (const field of table.fields) {
    if (field.options?.length) map[field.key] = field.options;
  }
  return map;
}

export async function updateCell(
  collection: string,
  id: string,
  field: string,
  value: unknown
) {
  if (!isCollectionKey(collection)) throw new Error("Unknown collection");
  if (field === "id") throw new Error("Cannot edit id");

  let updated: Record<string, unknown> | null = null;
  await updateStore((store) => {
    const rows = asRows(store, collection);
    const idx = rows.findIndex((r) => String(r.id) === id);
    if (idx === -1) return;
    const next = { ...rows[idx], [field]: value };
    if (collection === "content" && field === "theme_id") {
      next.theme_id = value ? String(value) : null;
    }
    if ("updated_at" in next) {
      next.updated_at = new Date().toISOString();
    }
    rows[idx] = next;
    (store as HubStore)[collection] = rows as never;
    updated = next;
  });
  if (!updated) throw new Error("Row not found");
  return updated;
}

export async function bulkUpdate(
  collection: string,
  ids: string[],
  field: string,
  value: unknown
) {
  if (!isCollectionKey(collection)) throw new Error("Unknown collection");
  if (field === "id") throw new Error("Cannot edit id");
  if (!ids.length) return { updated: 0 };

  const idSet = new Set(ids.map(String));
  let updated = 0;
  const now = new Date().toISOString();

  await updateStore((store) => {
    const rows = asRows(store, collection).map((row) => {
      if (!idSet.has(String(row.id))) return row;
      updated += 1;
      const next = { ...row, [field]: value };
      if ("updated_at" in next) next.updated_at = now;
      return next;
    });
    (store as HubStore)[collection] = rows as never;
  });

  return { updated };
}

export async function bulkDelete(collection: string, ids: string[]) {
  if (!isCollectionKey(collection)) throw new Error("Unknown collection");
  if (!ids.length) return { deleted: 0 };
  const idSet = new Set(ids.map(String));
  let deleted = 0;
  await updateStore((store) => {
    const before = asRows(store, collection);
    const rows = before.filter((r) => {
      const keep = !idSet.has(String(r.id));
      if (!keep) deleted += 1;
      return keep;
    });
    (store as HubStore)[collection] = rows as never;
  });
  return { deleted };
}

export async function addRow(collection: string, patch: Record<string, unknown> = {}) {
  if (!isCollectionKey(collection)) throw new Error("Unknown collection");
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id: uid(collection.slice(0, 3)),
    created_at: now,
    updated_at: now,
    ...patch,
  };

  // Sensible blanks for known fields
  const def = getCollection(collection)!;
  for (const field of def.fields) {
    if (field.key in row) continue;
    if (field.locked) continue;
    row[field.key] =
      field.key.includes("at") || field.key.includes("date")
        ? null
        : field.type === "tags" || field.key === "tags"
          ? []
          : field.key === "quantity" || field.key === "year"
            ? 0
            : field.key === "content_id"
              ? null
              : "";
  }

  // Theme mains must create a linked Content row in the same write, otherwise
  // the Themes page / Content table look empty after "add".
  if (collection === "theme_mains") {
    const contentId = uid("cnt");
    const title = String(row.title || "Main content");
    const channel = String(row.channel || "");
    const owner = String(row.owner || "");
    const status = String(row.status || "idea");
    const notes = String(row.notes || "");
    row.content_id = contentId;
    row.title = title;
    await updateStore((store) => {
      store.content.push({
        id: contentId,
        title,
        channel: channel ? [channel] : ["Editorial"],
        content_type: "Editorial",
        owner,
        due_date: null,
        deadline_date: null,
        status: (status as ContentStatus) || "idea",
        category: "",
        priority: "",
        website: "",
        caption: "",
        theme_id: String(row.theme_id || "") || null,
        planable_url: "",
        planable_post_id: "",
        planable_group_id: "",
        planable_page_ids: [],
        last_synced_at: null,
        sync_source: "",
        asset_url: "",
        notes,
        created_at: now,
        updated_at: now,
      });
      const rows = asRows(store, collection);
      rows.push(row);
      (store as HubStore)[collection] = rows as never;
    });
    return row;
  }

  await updateStore((store) => {
    const rows = asRows(store, collection);
    rows.push(row);
    (store as HubStore)[collection] = rows as never;
  });
  return row;
}

export async function deleteRow(collection: string, id: string) {
  if (!isCollectionKey(collection)) throw new Error("Unknown collection");
  await updateStore((store) => {
    const rows = asRows(store, collection).filter((r) => String(r.id) !== id);
    (store as HubStore)[collection] = rows as never;
  });
}

export async function addField(
  collection: string,
  name: string,
  opts: {
    label?: string;
    type?: FieldType;
    options?: FieldOption[];
  } = {}
) {
  if (!isCollectionKey(collection)) throw new Error("Unknown collection");
  const key = slugField(name);
  if (!key) throw new Error("Invalid field name");
  if (key === "id") throw new Error("Reserved field");

  const def = getCollection(collection)!;
  if (def.fields.some((f) => f.key === key)) {
    throw new Error("Field already exists on this table");
  }

  const type =
    opts.type && isManageableType(opts.type)
      ? opts.type
      : inferFieldType(key);
  if (type === "readonly") throw new Error("Cannot create readonly fields");

  const label =
    (opts.label && opts.label.trim()) ||
    name.trim() ||
    key.replace(/_/g, " ");
  const needsOptions = type === "select" || type === "tags";
  const options = needsOptions ? normalizeOptions(opts.options) : undefined;

  const extras = await readExtras();
  const list = extras[collection] ?? [];
  if (list.some((f) => f.key === key)) {
    throw new Error("Field already exists");
  }
  const stored: StoredFieldDef = {
    key,
    label,
    type,
    options,
    custom: true,
  };

  // Single write: field schema + empty values on existing rows.
  await updateStore((store) => {
    const nextExtras = normalizeExtrasPayload(store.field_extras);
    const current = nextExtras[collection] ?? [];
    if (current.some((f) => f.key === key)) return;
    nextExtras[collection] = [...current, stored];
    store.field_extras = nextExtras;

    const rows = asRows(store, collection).map((r) =>
      key in r ? r : { ...r, [key]: emptyValueForType(type) }
    );
    (store as HubStore)[collection] = rows as never;
  });
  await writeExtrasFile(
    normalizeExtrasPayload((await readStore()).field_extras)
  );

  return stored;
}

export async function updateField(
  collection: string,
  key: string,
  patch: {
    label?: string;
    type?: FieldType;
    options?: FieldOption[];
    /** Rename key — only allowed for custom fields. */
    newKey?: string;
  }
) {
  if (!isCollectionKey(collection)) throw new Error("Unknown collection");
  if (!key) throw new Error("Field required");

  const def = getCollection(collection)!;
  const core = def.fields.find((f) => f.key === key);
  if (core?.locked) throw new Error("Cannot edit locked field");

  const extras = await readExtras();
  const list = extras[collection] ?? [];
  const existingIdx = list.findIndex((f) => f.key === key);
  const existing = existingIdx >= 0 ? list[existingIdx] : null;
  const isCustom = !core;

  let nextKey = key;
  if (patch.newKey && patch.newKey !== key) {
    if (!isCustom) throw new Error("Cannot rename core table fields");
    nextKey = slugField(patch.newKey);
    if (!nextKey) throw new Error("Invalid field name");
    if (nextKey === "id") throw new Error("Reserved field");
    if (def.fields.some((f) => f.key === nextKey)) {
      throw new Error("A core field already uses that name");
    }
    if (list.some((f) => f.key === nextKey && f.key !== key)) {
      throw new Error("Another field already uses that name");
    }
  }

  const nextTypeRaw = patch.type ?? existing?.type ?? core?.type ?? inferFieldType(nextKey);
  const nextType =
    nextTypeRaw === "readonly"
      ? "readonly"
      : isManageableType(nextTypeRaw)
        ? nextTypeRaw
        : "text";
  if (nextType === "readonly" && isCustom) {
    throw new Error("Cannot set custom fields to readonly");
  }

  const nextLabel =
    (patch.label && patch.label.trim()) ||
    existing?.label ||
    core?.label ||
    nextKey.replace(/_/g, " ");

  const needsOptions = nextType === "select" || nextType === "tags";
  let nextOptions: FieldOption[] | undefined;
  if (core?.optionsSource) {
    nextOptions = undefined;
  } else if (needsOptions) {
    nextOptions =
      patch.options !== undefined
        ? normalizeOptions(patch.options)
        : existing?.options ?? core?.options;
  } else {
    nextOptions = undefined;
  }

  const stored: StoredFieldDef = {
    key: nextKey,
    label: nextLabel,
    type: nextType,
    options: nextOptions,
    custom: isCustom,
  };

  await updateStore((store) => {
    const nextExtras = normalizeExtrasPayload(store.field_extras);
    const current = [...(nextExtras[collection] ?? [])];
    const idx = current.findIndex((f) => f.key === key);
    if (idx >= 0) current[idx] = stored;
    else current.push(stored);
    nextExtras[collection] = current;
    store.field_extras = nextExtras;

    if (nextKey !== key) {
      const rows = asRows(store, collection).map((r) => {
        if (!(key in r)) return { ...r, [nextKey]: emptyValueForType(nextType) };
        const next = { ...r, [nextKey]: r[key] };
        delete next[key];
        return next;
      });
      (store as HubStore)[collection] = rows as never;
    }
  });
  await writeExtrasFile(
    normalizeExtrasPayload((await readStore()).field_extras)
  );

  return stored;
}

/** Append a select/tags option when it is not already on the field. */
export async function addSelectOption(
  collection: string,
  key: string,
  value: string
) {
  if (!isCollectionKey(collection)) throw new Error("Unknown collection");
  const label = value.trim();
  if (!label) throw new Error("Option required");
  if (!key) throw new Error("Field required");

  const table = await getTable(collection);
  const field = table.fields.find((f) => f.key === key);
  if (!field) throw new Error("Unknown field");
  if (field.locked) throw new Error("Cannot edit locked field");
  if (field.optionsSource) {
    throw new Error("Options for this field come from another table");
  }
  if (field.type !== "select" && field.type !== "tags") {
    throw new Error("Field does not have selectable options");
  }

  const current = field.options ?? [];
  const needle = label.toLowerCase();
  if (
    current.some(
      (o) =>
        o.value.trim().toLowerCase() === needle ||
        o.label.trim().toLowerCase() === needle
    )
  ) {
    return { field: { key, label: field.label, type: field.type, options: current }, added: false };
  }

  const options = [...current, { value: label, label }];
  const updated = await updateField(collection, key, { options });
  return { field: updated, added: true };
}

export async function removeField(collection: string, name: string) {
  if (!isCollectionKey(collection)) throw new Error("Unknown collection");
  const def = getCollection(collection)!;
  const core = def.fields.find((f) => f.key === name);
  if (core?.locked) throw new Error("Cannot remove locked field");

  await updateStore((store) => {
    const nextExtras = normalizeExtrasPayload(store.field_extras);
    nextExtras[collection] = (nextExtras[collection] ?? []).filter(
      (f) => f.key !== name
    );
    store.field_extras = nextExtras;

    // Core fields: clear values but keep the column concept via schema;
    // still strip the key from rows so data is gone. Core schema remains in code.
    const rows = asRows(store, collection).map((r) => {
      if (!(name in r)) return r;
      const next = { ...r };
      delete next[name];
      return next;
    });
    (store as HubStore)[collection] = rows as never;
  });
  await writeExtrasFile(
    normalizeExtrasPayload((await readStore()).field_extras)
  );
}
