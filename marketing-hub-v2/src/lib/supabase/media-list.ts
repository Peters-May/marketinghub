import {
  asString,
  createServiceClient,
  findMediaTable,
  listCoreTables,
  pickField,
} from "@/lib/supabase/core-data";
import { normalizeDivision } from "@/lib/events/division-colors";

export type MediaFile = {
  url: string;
  name: string;
  type: string;
  size: number | null;
};

export type MediaListItem = {
  id: string;
  /** Internal name (staff reference). */
  name: string;
  /** Public gallery title; falls back to `name` when empty. */
  public_title: string;
  /** Title to show in the current context (public vs staff). */
  display_name: string;
  category: string;
  /** Optional folder under Gallery (and similar) for sorting images. */
  subfolder: string;
  /**
   * Gallery subfolder visibility: public (listed externally), internal (staff),
   * or admin. Share links are a separate folder flag (see gallery_folder_shares).
   * Non-gallery categories ignore this; missing values treat as internal.
   */
  subfolder_visibility: GalleryFolderVisibility;
  /**
   * Per-item visibility. More restrictive than the folder wins.
   * When folder is set to internal/admin, items are cascaded to match.
   */
  visibility: GalleryFolderVisibility;
  /**
   * Business division (All, Racing, Commercial, Leisure, Forwarding, CEC).
   * "All" = company-wide / shared across departments.
   */
  division: string;
  status: string;
  owned_by: string;
  notes: string;
  document_url: string;
  document_link: string;
  files: MediaFile[];
  cover_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type GalleryFolderVisibility = "public" | "internal" | "admin";

export const GALLERY_CATEGORY = "Gallery";

export const GALLERY_VISIBILITY_OPTIONS = [
  { id: "public", label: "Public" },
  { id: "internal", label: "Internal" },
  { id: "admin", label: "Admin only" },
] as const;

export type GalleryFolderShare = {
  subfolder: string;
  share_token: string;
  enabled: boolean;
};

/** Categories visible on the public /media gallery and external library view. */
export const PUBLIC_MEDIA_CATEGORIES = [
  "Logos",
  "Presentations",
  "Gallery",
] as const;

export type MediaListScope = "public" | "all";

export function normalizeGalleryVisibility(
  raw: string | null | undefined
): GalleryFolderVisibility {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "admin" || value === "admin only" || value === "admin_only") {
    return "admin";
  }
  // Legacy "link" visibility is now Internal + share toggle.
  if (
    value === "link" ||
    value === "link only" ||
    value === "link_only" ||
    value === "unlisted"
  ) {
    return "internal";
  }
  if (value === "public") return "public";
  return "internal";
}

function visibilityRank(value: GalleryFolderVisibility): number {
  if (value === "admin") return 2;
  if (value === "internal") return 1;
  return 0;
}

/** More restrictive of two levels (public < internal < admin). */
export function moreRestrictiveVisibility(
  a: GalleryFolderVisibility,
  b: GalleryFolderVisibility
): GalleryFolderVisibility {
  return visibilityRank(a) >= visibilityRank(b) ? a : b;
}

export function visibilityLabel(value: GalleryFolderVisibility): string {
  if (value === "admin") return "Admin only";
  if (value === "internal") return "Internal";
  return "Public";
}

/** Path for an unlisted Gallery folder share (no login required). */
export function gallerySharePath(token: string): string {
  return `/share/gallery/${encodeURIComponent(token)}`;
}

function generateShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function normalizeMediaDivision(raw: string | null | undefined): string {
  return normalizeDivision(raw) || "All";
}

/** Department filter: specific division also includes company-wide (All) assets. */
export function matchesMediaDivisionFilter(
  itemDivision: string | null | undefined,
  filter: string
): boolean {
  if (!filter || filter === "all") return true;
  const division = normalizeMediaDivision(itemDivision);
  const normalizedFilter = normalizeDivision(filter) || filter;
  if (division === "All") return true;
  return division === normalizedFilter;
}

function parseFiles(raw: unknown): MediaFile[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const url = asString(obj.url ?? obj.href ?? obj.src);
      if (!url) return null;
      return {
        url,
        name: asString(obj.name ?? obj.filename ?? "File") || "File",
        type: asString(obj.type ?? obj.mimeType ?? ""),
        size:
          typeof obj.size === "number"
            ? obj.size
            : Number.isFinite(Number(obj.size))
              ? Number(obj.size)
              : null,
      };
    })
    .filter((f): f is MediaFile => !!f);
}

function extractUrlFromDocumentField(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const match = trimmed.match(/\((https?:\/\/[^)]+)\)/i);
  if (match?.[1]) return match[1];
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed) && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }
  return "";
}

function normalizeLink(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function isPublicCategory(category: string): boolean {
  const normalized = category.trim().toLowerCase();
  return PUBLIC_MEDIA_CATEGORIES.some((c) => c.toLowerCase() === normalized);
}

function isGalleryCategoryName(category: string): boolean {
  return category.trim().toLowerCase() === GALLERY_CATEGORY.toLowerCase();
}

/** Public scope: public categories; Gallery needs public folder + public item. */
function isVisibleInPublicScope(item: {
  category: string;
  subfolder_visibility: GalleryFolderVisibility;
  visibility: GalleryFolderVisibility;
}): boolean {
  if (!isPublicCategory(item.category)) return false;
  return effectiveMediaVisibility(item) === "public";
}

/** Effective visibility for display badges (folder ∩ item for Gallery). */
export function effectiveMediaVisibility(item: {
  category: string;
  subfolder_visibility: GalleryFolderVisibility;
  visibility: GalleryFolderVisibility;
}): GalleryFolderVisibility {
  if (isGalleryCategoryName(item.category)) {
    return moreRestrictiveVisibility(
      item.subfolder_visibility,
      item.visibility
    );
  }
  return item.visibility;
}

export async function listMediaFromSupabase(options?: {
  scope?: MediaListScope;
  /** When false, admin-only items are hidden (members / non-admins). */
  includeAdmin?: boolean;
  /** Max rows per request (default 200). Use offset for pagination. */
  limit?: number;
  offset?: number;
  /** When set, only these hub categories are read (newest first). */
  categories?: string[];
  /** Read the newest rows first. The default media list order is unchanged. */
  newestFirst?: boolean;
}): Promise<{
  items: MediaListItem[];
  tableName: string | null;
  scope: MediaListScope;
  total?: number;
}> {
  const scope: MediaListScope = options?.scope === "all" ? "all" : "public";
  const includeAdmin = options?.includeAdmin === true;
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 1000);
  const offset = Math.max(options?.offset ?? 0, 0);
  const categories = (options?.categories ?? [])
    .map((category) => category.trim())
    .filter(Boolean);
  const newestFirst = options?.newestFirst === true;
  const tables = await listCoreTables();
  const mediaTable = findMediaTable(tables);
  if (!mediaTable) {
    return { items: [], tableName: null, scope };
  }

  const supabase = createServiceClient();
  const { count } = await supabase
    .from(mediaTable.supabase_table)
    .select("*", { count: "exact", head: true });

  let listQuery = supabase.from(mediaTable.supabase_table).select("*");
  if (categories.length > 0) {
    listQuery = listQuery.is("deleted_at", null).in("hub_category", categories);
  }
  if (newestFirst || categories.length > 0) {
    listQuery = listQuery.order("updated_at", { ascending: false });
  }
  const { data, error } = await listQuery.range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message);
  }

  const items = ((data ?? []) as Record<string, unknown>[])
    .filter((r) => r.deleted_at == null)
    .map((r) => {
      const id = asString(r.id);
      const name =
        asString(pickField(r, [/^name$/i, /^title$/i, /^asset$/i])) ||
        "Untitled asset";
      const publicTitle = asString(
        pickField(r, [/^public_?title$/i, /^display_?title$/i, /^public_?name$/i])
      );
      const files = parseFiles(
        pickField(r, [/^media$/i, /^attachments?/i, /^files?/i, /^images?/i])
      );
      const documentRaw = asString(
        pickField(r, [/^document$/i, /^file$/i, /^attachment$/i])
      );
      const document_url = extractUrlFromDocumentField(documentRaw);
      const document_link = normalizeLink(
        asString(
          pickField(r, [
            /^document_?link$/i,
            /^link$/i,
            /^url$/i,
            /^onedrive/i,
          ])
        )
      );
      const cover =
        files.find((f) => f.type.startsWith("image/"))?.url ??
        files[0]?.url ??
        null;
      const category =
        asString(
          pickField(r, [
            /^hub_?category$/i,
            /^category$/i,
            /^folder$/i,
            /^type$/i,
          ])
        ) || "General";
      const subfolder = asString(
        pickField(r, [/^subfolder$/i, /^gallery_?folder$/i, /^album$/i])
      );
      const subfolder_visibility = normalizeGalleryVisibility(
        asString(
          pickField(r, [
            /^subfolder_?visibility$/i,
            /^gallery_?visibility$/i,
            /^folder_?visibility$/i,
          ])
        )
      );
      const rawItemVis = asString(
        pickField(r, [/^visibility$/i, /^item_?visibility$/i])
      );
      const visibility: GalleryFolderVisibility = rawItemVis.trim()
        ? normalizeGalleryVisibility(rawItemVis)
        : isGalleryCategoryName(category)
          ? subfolder_visibility
          : "internal";
      const division = normalizeMediaDivision(
        asString(pickField(r, [/^division$/i, /^department$/i, /^dept$/i]))
      );

      const internalName = name.trim();
      const publicName = publicTitle.trim();
      const display_name =
        scope === "public"
          ? publicName || internalName
          : internalName;

      return {
        id,
        name: internalName,
        public_title: publicName,
        display_name,
        category,
        subfolder: subfolder.trim(),
        subfolder_visibility,
        visibility,
        division,
        status: asString(pickField(r, [/^status$/i])) || "",
        owned_by: asString(
          pickField(r, [/^owned_?by$/i, /^owner$/i, /^assignee$/i])
        ),
        notes: asString(pickField(r, [/^notes$/i, /^description$/i])),
        document_url,
        document_link,
        files,
        cover_url: cover,
        created_at: asString(r.created_at) || null,
        updated_at: asString(r.updated_at) || null,
      } satisfies MediaListItem;
    })
    .filter((item) => {
      if (scope === "public") return isVisibleInPublicScope(item);
      if (!includeAdmin && effectiveMediaVisibility(item) === "admin") {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aCec = (a.division ?? "").toLowerCase() === "cec" ? 1 : 0;
      const bCec = (b.division ?? "").toLowerCase() === "cec" ? 1 : 0;
      if (aCec !== bCec) return aCec - bCec;
      return a.display_name.localeCompare(b.display_name);
    });

  return { items, tableName: mediaTable.name, scope, total: count ?? undefined };
}

export const MEDIA_HUB_CATEGORIES = [
  "Gallery",
  "Logos",
  "Presentations",
  "Images",
  "Documents",
  "Videos",
  "Brand Guidelines",
  "Design Assets",
  "Templates",
  "Business Cards",
  "Flyers",
  "Advertorial",
] as const;

export type MediaUploadFile = {
  url: string;
  name: string;
  type?: string;
  size?: number | null;
};

export type CreateMediaInput = {
  name: string;
  public_title?: string;
  category?: string;
  /** Folder under Gallery for sorting images. */
  subfolder?: string;
  /** public = external; internal = staff; admin = admins only. Gallery only. */
  subfolder_visibility?: GalleryFolderVisibility;
  /** Per-item visibility; defaults to folder visibility for Gallery, else internal. */
  visibility?: GalleryFolderVisibility;
  /** Business division; defaults to All (company-wide). */
  division?: string;
  document_link?: string;
  notes?: string;
  status?: string;
  /** Optional uploaded / linked file for the media jsonb column. */
  file?: MediaUploadFile;
  /** Multiple uploaded files (preferred when adding several images at once). */
  files?: MediaUploadFile[];
  /** auth.users id — required for created_by / updated_by FKs. */
  actorId: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Resolve a valid auth.users id for Core Data audit columns. */
export async function resolveMediaActorId(
  preferredId: string
): Promise<string> {
  if (isUuid(preferredId)) return preferredId;

  const tables = await listCoreTables();
  const mediaTable = findMediaTable(tables);
  if (!mediaTable) {
    throw new Error("Media Links Resources table not found");
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from(mediaTable.supabase_table)
    .select("created_by")
    .not("created_by", "is", null)
    .limit(1);

  const fallback = asString((data?.[0] as { created_by?: unknown } | undefined)?.created_by);
  if (isUuid(fallback)) return fallback;

  throw new Error(
    "Could not resolve a Supabase user for media create. Sign in with a real account."
  );
}

export async function createMediaInSupabase(
  input: CreateMediaInput
): Promise<MediaListItem> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  const tables = await listCoreTables();
  const mediaTable = findMediaTable(tables);
  if (!mediaTable) {
    throw new Error("Media Links Resources table not found");
  }

  const actorId = await resolveMediaActorId(input.actorId);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const category = (input.category?.trim() || "Documents").trim();
  const isGallery =
    category.toLowerCase() === GALLERY_CATEGORY.toLowerCase();
  const subfolder = isGallery ? (input.subfolder?.trim() || "") : "";
  const subfolder_visibility: GalleryFolderVisibility = isGallery
    ? normalizeGalleryVisibility(input.subfolder_visibility ?? "internal")
    : "internal";
  const visibility: GalleryFolderVisibility = normalizeGalleryVisibility(
    input.visibility ?? (isGallery ? subfolder_visibility : "internal")
  );
  const division = normalizeMediaDivision(input.division);
  const publicTitle = input.public_title?.trim() || "";
  const documentLink = normalizeLink(input.document_link ?? "");
  const notes = input.notes?.trim() || "";
  const status = input.status?.trim() || "Internal Resource";

  const uploadedFiles: MediaUploadFile[] = [
    ...(input.files ?? []),
    ...(input.file?.url ? [input.file] : []),
  ].filter((f) => !!f?.url);

  // Deduplicate by URL while preserving order.
  const seenUrls = new Set<string>();
  const media =
    uploadedFiles.length > 0
      ? uploadedFiles
          .filter((f) => {
            if (seenUrls.has(f.url)) return false;
            seenUrls.add(f.url);
            return true;
          })
          .map((f) => ({
            url: f.url,
            name: f.name || "File",
            type: f.type || "",
            size: typeof f.size === "number" ? f.size : null,
          }))
      : null;

  const row = {
    id,
    name,
    public_title: publicTitle || null,
    hub_category: category,
    subfolder: subfolder || null,
    subfolder_visibility: isGallery ? subfolder_visibility : null,
    visibility,
    division,
    document_link: documentLink || null,
    notes: notes || null,
    status,
    media,
    created_at: now,
    updated_at: now,
    created_by: actorId,
    updated_by: actorId,
    deleted_at: null,
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(mediaTable.supabase_table)
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const r = data as Record<string, unknown>;
  const files = parseFiles(r.media);
  return {
    id: asString(r.id),
    name,
    public_title: publicTitle,
    display_name: name,
    category,
    subfolder,
    subfolder_visibility,
    visibility,
    division,
    status,
    owned_by: asString(r.owned_by),
    notes,
    document_url: extractUrlFromDocumentField(asString(r.document)),
    document_link: documentLink,
    files,
    cover_url:
      files.find((f) => f.type.startsWith("image/"))?.url ??
      files[0]?.url ??
      null,
    created_at: now,
    updated_at: asString(r.updated_at) || now,
  };
}

/** Set public/internal/admin for every item in a Gallery subfolder (empty = Unsorted).
 *
 * Rules:
 * - Folder → admin/internal/public: every file is cascaded to match.
 * - After a public folder is set, an individual file can be set to internal or
 *   admin to override the folder.
 * - Share links are independent (see setGalleryFolderShareEnabled).
 */
export async function setGallerySubfolderVisibility(input: {
  subfolder: string;
  visibility: GalleryFolderVisibility;
  actorId: string;
}): Promise<{ updated: number }> {
  const visibility = normalizeGalleryVisibility(input.visibility);
  const subfolderKey = input.subfolder.trim();

  const tables = await listCoreTables();
  const mediaTable = findMediaTable(tables);
  if (!mediaTable) {
    throw new Error("Media Links Resources table not found");
  }

  const actorId = await resolveMediaActorId(input.actorId);
  const now = new Date().toISOString();
  const supabase = createServiceClient();

  // Always cascade folder choice onto items. Individual overrides are applied
  // afterwards via updateMediaItemInSupabase({ visibility }).
  let query = supabase
    .from(mediaTable.supabase_table)
    .update({
      subfolder_visibility: visibility,
      visibility,
      updated_at: now,
      updated_by: actorId,
    })
    .is("deleted_at", null)
    .ilike("hub_category", GALLERY_CATEGORY);

  if (subfolderKey) {
    query = query.eq("subfolder", subfolderKey);
  } else {
    query = query.or("subfolder.is.null,subfolder.eq.");
  }

  const { data, error } = await query.select("id");
  if (error) throw new Error(error.message);
  return { updated: data?.length ?? 0 };
}

/** Enable or disable the unlisted share link for a Gallery subfolder. */
export async function setGalleryFolderShareEnabled(input: {
  subfolder: string;
  enabled: boolean;
}): Promise<GalleryFolderShare> {
  return syncGalleryFolderShare({
    subfolder: input.subfolder,
    enabled: input.enabled,
  });
}

/** Upsert/disable the unlisted share row for a Gallery subfolder. */
export async function syncGalleryFolderShare(input: {
  subfolder: string;
  enabled: boolean;
}): Promise<GalleryFolderShare> {
  const subfolder = input.subfolder.trim();
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing, error: readError } = await supabase
    .from("gallery_folder_shares")
    .select("subfolder, share_token, enabled")
    .eq("subfolder", subfolder)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (existing) {
    const { data, error } = await supabase
      .from("gallery_folder_shares")
      .update({ enabled: input.enabled, updated_at: now })
      .eq("subfolder", subfolder)
      .select("subfolder, share_token, enabled")
      .single();
    if (error) throw new Error(error.message);
    return {
      subfolder: asString(data.subfolder),
      share_token: asString(data.share_token),
      enabled: Boolean(data.enabled),
    };
  }

  const share_token = generateShareToken();
  const { data, error } = await supabase
    .from("gallery_folder_shares")
    .insert({
      subfolder,
      share_token,
      enabled: input.enabled,
      created_at: now,
      updated_at: now,
    })
    .select("subfolder, share_token, enabled")
    .single();
  if (error) throw new Error(error.message);
  return {
    subfolder: asString(data.subfolder),
    share_token: asString(data.share_token),
    enabled: Boolean(data.enabled),
  };
}

/** Staff: all folder share tokens (enabled or not, so links can be re-copied). */
export async function listGalleryFolderShares(): Promise<GalleryFolderShare[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("gallery_folder_shares")
    .select("subfolder, share_token, enabled");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    subfolder: asString(row.subfolder),
    share_token: asString(row.share_token),
    enabled: Boolean(row.enabled),
  }));
}

/** Public share page: resolve token → folder + items visible on the link. */
export async function listMediaByShareToken(token: string): Promise<{
  folderName: string;
  share: GalleryFolderShare;
  items: MediaListItem[];
} | null> {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length < 16 || trimmed.length > 128) return null;

  const supabase = createServiceClient();
  const { data: shareRow, error: shareError } = await supabase
    .from("gallery_folder_shares")
    .select("subfolder, share_token, enabled")
    .eq("share_token", trimmed)
    .maybeSingle();

  if (shareError) throw new Error(shareError.message);
  if (!shareRow || !shareRow.enabled) return null;

  const share: GalleryFolderShare = {
    subfolder: asString(shareRow.subfolder),
    share_token: asString(shareRow.share_token),
    enabled: Boolean(shareRow.enabled),
  };

  const tables = await listCoreTables();
  const mediaTable = findMediaTable(tables);
  if (!mediaTable) {
    return {
      folderName: share.subfolder || "Gallery",
      share,
      items: [],
    };
  }

  let query = supabase
    .from(mediaTable.supabase_table)
    .select("*")
    .is("deleted_at", null)
    .ilike("hub_category", GALLERY_CATEGORY);

  if (share.subfolder) {
    query = query.eq("subfolder", share.subfolder);
  } else {
    query = query.or("subfolder.is.null,subfolder.eq.");
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);

  const items = ((data ?? []) as Record<string, unknown>[])
    .map((r) => mapMediaRow(r, "public"))
    // Hide items that are more restrictive than the folder (e.g. admin
    // override on an internal shared folder).
    .filter((item) => {
      const folderVis = item.subfolder_visibility;
      return moreRestrictiveVisibility(folderVis, item.visibility) === folderVis;
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  return {
    folderName: share.subfolder || "Unsorted",
    share,
    items,
  };
}

export async function softDeleteMediaInSupabase(
  id: string,
  actorId: string
): Promise<void> {
  if (!id.trim()) throw new Error("id is required");

  const tables = await listCoreTables();
  const mediaTable = findMediaTable(tables);
  if (!mediaTable) {
    throw new Error("Media Links Resources table not found");
  }

  const resolvedActor = await resolveMediaActorId(actorId);
  const supabase = createServiceClient();
  const { error } = await supabase
    .from(mediaTable.supabase_table)
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: resolvedActor,
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
}

export async function updateMediaItemInSupabase(input: {
  id: string;
  actorId: string;
  name?: string;
  public_title?: string;
  notes?: string;
  category?: string;
  subfolder?: string;
  document_link?: string;
  visibility?: GalleryFolderVisibility;
  division?: string;
}): Promise<MediaListItem> {
  const id = input.id.trim();
  if (!id) throw new Error("id is required");

  const tables = await listCoreTables();
  const mediaTable = findMediaTable(tables);
  if (!mediaTable) {
    throw new Error("Media Links Resources table not found");
  }

  const actorId = await resolveMediaActorId(input.actorId);
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actorId,
  };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    patch.name = name;
  }
  if (input.public_title !== undefined) {
    patch.public_title = input.public_title.trim() || null;
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes.trim() || null;
  }
  if (input.document_link !== undefined) {
    patch.document_link = normalizeLink(input.document_link) || null;
  }
  if (input.visibility !== undefined) {
    patch.visibility = normalizeGalleryVisibility(input.visibility);
  }
  if (input.division !== undefined) {
    patch.division = normalizeMediaDivision(input.division);
  }

  let nextCategory: string | undefined;
  if (input.category !== undefined) {
    nextCategory = input.category.trim();
    if (!nextCategory) throw new Error("Category is required");
    patch.hub_category = nextCategory;
  }

  if (nextCategory !== undefined) {
    const gallery =
      nextCategory.toLowerCase() === GALLERY_CATEGORY.toLowerCase();
    if (!gallery) {
      patch.subfolder = null;
    } else if (input.subfolder !== undefined) {
      patch.subfolder = input.subfolder.trim() || null;
    }
  } else if (input.subfolder !== undefined) {
    patch.subfolder = input.subfolder.trim() || null;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(mediaTable.supabase_table)
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapMediaRow(data as Record<string, unknown>, "all");
}

export async function renameMediaFileInSupabase(input: {
  id: string;
  fileUrl: string;
  newName: string;
  actorId: string;
}): Promise<MediaListItem> {
  const id = input.id.trim();
  const fileUrl = input.fileUrl.trim();
  const newName = input.newName.trim();
  if (!id) throw new Error("id is required");
  if (!fileUrl) throw new Error("fileUrl is required");
  if (!newName) throw new Error("File name is required");

  const tables = await listCoreTables();
  const mediaTable = findMediaTable(tables);
  if (!mediaTable) {
    throw new Error("Media Links Resources table not found");
  }

  const actorId = await resolveMediaActorId(input.actorId);
  const supabase = createServiceClient();
  const { data: existing, error: readError } = await supabase
    .from(mediaTable.supabase_table)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (readError) throw new Error(readError.message);
  const row = existing as Record<string, unknown>;
  const files = parseFiles(row.media);
  const next = files.map((f) =>
    f.url === fileUrl ? { ...f, name: newName } : f
  );
  if (!files.some((f) => f.url === fileUrl)) {
    throw new Error("File not found on this asset");
  }

  const { data, error } = await supabase
    .from(mediaTable.supabase_table)
    .update({
      media: next,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapMediaRow(data as Record<string, unknown>, "all");
}

export async function deleteMediaFileInSupabase(input: {
  id: string;
  fileUrl: string;
  actorId: string;
}): Promise<{ deletedItem: boolean; item: MediaListItem | null }> {
  const id = input.id.trim();
  const fileUrl = input.fileUrl.trim();
  if (!id) throw new Error("id is required");
  if (!fileUrl) throw new Error("fileUrl is required");

  const tables = await listCoreTables();
  const mediaTable = findMediaTable(tables);
  if (!mediaTable) {
    throw new Error("Media Links Resources table not found");
  }

  const actorId = await resolveMediaActorId(input.actorId);
  const supabase = createServiceClient();
  const { data: existing, error: readError } = await supabase
    .from(mediaTable.supabase_table)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (readError) throw new Error(readError.message);
  const row = existing as Record<string, unknown>;
  const files = parseFiles(row.media);
  if (!files.some((f) => f.url === fileUrl)) {
    throw new Error("File not found on this asset");
  }

  const next = files.filter((f) => f.url !== fileUrl);
  const documentLink = normalizeLink(asString(row.document_link));
  const documentRaw = asString(row.document);
  const hasOtherContent =
    next.length > 0 ||
    !!documentLink ||
    !!extractUrlFromDocumentField(documentRaw);

  if (!hasOtherContent) {
    await softDeleteMediaInSupabase(id, actorId);
    return { deletedItem: true, item: null };
  }

  const { data, error } = await supabase
    .from(mediaTable.supabase_table)
    .update({
      media: next.length > 0 ? next : null,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return {
    deletedItem: false,
    item: mapMediaRow(data as Record<string, unknown>, "all"),
  };
}

/** Append uploaded files to an existing media asset (keeps link + existing files). */
export async function addMediaFilesInSupabase(input: {
  id: string;
  actorId: string;
  files: MediaUploadFile[];
}): Promise<MediaListItem> {
  const id = input.id.trim();
  if (!id) throw new Error("id is required");
  const incoming = (input.files ?? []).filter((f) => !!f?.url?.trim());
  if (incoming.length === 0) throw new Error("At least one file is required");

  const tables = await listCoreTables();
  const mediaTable = findMediaTable(tables);
  if (!mediaTable) {
    throw new Error("Media Links Resources table not found");
  }

  const actorId = await resolveMediaActorId(input.actorId);
  const supabase = createServiceClient();
  const { data: existing, error: readError } = await supabase
    .from(mediaTable.supabase_table)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (readError) throw new Error(readError.message);
  const row = existing as Record<string, unknown>;
  const current = parseFiles(row.media);
  const seen = new Set(current.map((f) => f.url));
  const appended: MediaFile[] = [];
  for (const f of incoming) {
    const url = f.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    appended.push({
      url,
      name: f.name || "File",
      type: f.type || "",
      size: typeof f.size === "number" ? f.size : null,
    });
  }
  if (appended.length === 0) {
    throw new Error("Those files are already on this asset");
  }

  const next = [...current, ...appended];
  const { data, error } = await supabase
    .from(mediaTable.supabase_table)
    .update({
      media: next,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapMediaRow(data as Record<string, unknown>, "all");
}

function mapMediaRow(
  r: Record<string, unknown>,
  scope: MediaListScope
): MediaListItem {
  const name =
    asString(pickField(r, [/^name$/i, /^title$/i, /^asset$/i])) ||
    "Untitled asset";
  const publicTitle = asString(
    pickField(r, [/^public_?title$/i, /^display_?title$/i, /^public_?name$/i])
  );
  const files = parseFiles(
    pickField(r, [/^media$/i, /^attachments?/i, /^files?/i, /^images?/i])
  );
  const documentRaw = asString(
    pickField(r, [/^document$/i, /^file$/i, /^attachment$/i])
  );
  const document_url = extractUrlFromDocumentField(documentRaw);
  const document_link = normalizeLink(
    asString(
      pickField(r, [
        /^document_?link$/i,
        /^link$/i,
        /^url$/i,
        /^onedrive/i,
      ])
    )
  );
  const cover =
    files.find((f) => f.type.startsWith("image/"))?.url ??
    files[0]?.url ??
    null;
  const category =
    asString(
      pickField(r, [
        /^hub_?category$/i,
        /^category$/i,
        /^folder$/i,
        /^type$/i,
      ])
    ) || "General";
  const subfolder = asString(
    pickField(r, [/^subfolder$/i, /^gallery_?folder$/i, /^album$/i])
  );
  const subfolder_visibility = normalizeGalleryVisibility(
    asString(
      pickField(r, [/^subfolder_?visibility$/i, /^gallery_?visibility$/i])
    )
  );
  const rawItemVis = asString(
    pickField(r, [/^visibility$/i, /^item_?visibility$/i])
  );
  const visibility: GalleryFolderVisibility = rawItemVis.trim()
    ? normalizeGalleryVisibility(rawItemVis)
    : isGalleryCategoryName(category)
      ? subfolder_visibility
      : "internal";
  const division = normalizeMediaDivision(
    asString(pickField(r, [/^division$/i, /^department$/i, /^dept$/i]))
  );
  const internalName = name.trim();
  const publicName = publicTitle.trim();
  return {
    id: asString(r.id),
    name: internalName,
    public_title: publicName,
    display_name:
      scope === "public" ? publicName || internalName : internalName,
    category,
    subfolder: subfolder.trim(),
    subfolder_visibility,
    visibility,
    division,
    status: asString(pickField(r, [/^status$/i])) || "",
    owned_by: asString(
      pickField(r, [/^owned_?by$/i, /^owner$/i, /^assignee$/i])
    ),
    notes: asString(pickField(r, [/^notes$/i, /^description$/i])),
    document_url,
    document_link,
    files,
    cover_url: cover,
    created_at: asString(r.created_at) || null,
    updated_at: asString(r.updated_at) || null,
  };
}
