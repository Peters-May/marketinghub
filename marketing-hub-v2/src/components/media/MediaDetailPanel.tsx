"use client";

import {
  Download,
  ExternalLink,
  Globe,
  Lock,
  Shield,
  Trash2,
  Loader2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import {
  GALLERY_CATEGORY,
  MEDIA_HUB_CATEGORIES,
  visibilityLabel,
  type GalleryFolderVisibility,
  type MediaListItem,
} from "@/lib/supabase/media-list";
import {
  DIVISION_OPTIONS,
  divisionColor,
  normalizeDivision,
} from "@/lib/events/division-colors";
import { uploadAssetDirect } from "@/lib/upload/client-upload";
import { downloadMediaFile } from "@/lib/media/download-file";
import {
  isAllowedUpload,
  MAX_UPLOAD_BYTES_ADMIN,
  UPLOAD_ACCEPT,
} from "@/lib/upload/allowed-types";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { RelatedTasksPanel } from "@/components/tasks/RelatedTasksPanel";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import {
  UploadProgressBar,
  type FileUploadProgress,
} from "@/components/ui/UploadProgress";

const NEW_SUBFOLDER_VALUE = "__new_subfolder__";
const MEDIA_ACCEPT = UPLOAD_ACCEPT;

const VISIBILITY_CONTROL_OPTIONS = [
  { id: "public", label: "Public", icon: Globe },
  { id: "internal", label: "Internal", icon: Lock },
  { id: "admin", label: "Admin only", icon: Shield },
] as const;

function isAcceptedMediaFile(file: File) {
  return isAllowedUpload(file.name, file.type);
}

function filesFromList(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter(isAcceptedMediaFile);
}

/** Clipboard screenshots often arrive as generic `image.png` — rename for the library. */
function fileFromClipboardImage(file: File): File {
  const ext =
    file.type === "image/jpeg" || file.type === "image/jpg"
      ? "jpg"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "png";
  const name = `preview-${new Date().toISOString().slice(0, 10)}.${ext}`;
  return new File([file], name, { type: file.type || "image/png" });
}

function isImageFile(file: { url: string; name: string; type: string }) {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || file.url);
}

function formatFileSize(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatFileType(file: { name: string; type: string }) {
  const mime = (file.type || "").trim().toLowerCase();
  if (mime.startsWith("image/")) {
    const sub = mime.slice(6);
    if (sub === "jpeg") return "JPEG";
    if (sub === "svg+xml") return "SVG";
    return sub.toUpperCase() || "Image";
  }
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("video/")) {
    const sub = mime.slice(6);
    if (sub === "quicktime") return "MOV";
    return sub.toUpperCase() || "Video";
  }
  const ext = file.name.match(/\.([^.]+)$/)?.[1];
  return ext ? ext.toUpperCase() : mime || "File";
}

function formatFileDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MediaDetailPanel({
  item,
  focusedFileUrl,
  categories,
  knownSubfolders,
  canEdit = true,
  canDownload = true,
  onClose,
  onSaved,
  onFocusFile,
}: {
  item: MediaListItem;
  focusedFileUrl?: string | null;
  categories: string[];
  knownSubfolders: string[];
  /** Admin: edit + delete. Member: view + download only. */
  canEdit?: boolean;
  canDownload?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onFocusFile?: (url: string | null) => void;
}) {
  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set([...MEDIA_HUB_CATEGORIES, ...categories, item.category].filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [categories, item.category]);

  const subfolderOptions = useMemo(() => {
    return Array.from(
      new Set(
        [...knownSubfolders, item.subfolder]
          .map((s) => s?.trim())
          .filter((s): s is string => !!s)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [knownSubfolders, item.subfolder]);

  const focusedFile = useMemo(() => {
    if (!item.files.length) return null;
    if (focusedFileUrl) {
      return item.files.find((f) => f.url === focusedFileUrl) ?? item.files[0];
    }
    return item.files.find(isImageFile) ?? item.files[0];
  }, [item.files, focusedFileUrl]);

  const [itemName, setItemName] = useState(item.name);
  const [publicTitle, setPublicTitle] = useState(item.public_title);
  const [notes, setNotes] = useState(item.notes);
  const [documentLink, setDocumentLink] = useState(item.document_link);
  const [category, setCategory] = useState(item.category || GALLERY_CATEGORY);
  const [categoryMode, setCategoryMode] = useState<"existing" | "new">(
    "existing"
  );
  const [newCategory, setNewCategory] = useState("");
  const [subfolder, setSubfolder] = useState(item.subfolder || "");
  const [subfolderMode, setSubfolderMode] = useState<"existing" | "new">(
    "existing"
  );
  const [newSubfolder, setNewSubfolder] = useState("");
  const [visibility, setVisibility] = useState<GalleryFolderVisibility>(
    item.visibility || "internal"
  );
  const [division, setDivision] = useState(
    normalizeDivision(item.division) || "All"
  );
  const [fileName, setFileName] = useState(focusedFile?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress | null>(
    null
  );
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setItemName(item.name);
    setPublicTitle(item.public_title);
    setNotes(item.notes);
    setDocumentLink(item.document_link);
    setCategory(item.category || GALLERY_CATEGORY);
    setCategoryMode("existing");
    setNewCategory("");
    setSubfolder(item.subfolder || "");
    setSubfolderMode("existing");
    setNewSubfolder("");
    setVisibility(item.visibility || "internal");
    setDivision(normalizeDivision(item.division) || "All");
    setError(null);
    // Only reset when switching assets — not on every item object refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    // Keep fields in sync after save/reload for the same asset.
    setItemName(item.name);
    setPublicTitle(item.public_title);
    setNotes(item.notes);
    setDocumentLink(item.document_link);
    setVisibility(item.visibility || "internal");
    setDivision(normalizeDivision(item.division) || "All");
    if (categoryMode !== "new") {
      setCategory(item.category || GALLERY_CATEGORY);
    }
    if (subfolderMode !== "new") {
      setSubfolder(item.subfolder || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid wiping in-progress "add category"
  }, [
    item.name,
    item.public_title,
    item.notes,
    item.document_link,
    item.visibility,
    item.division,
    item.category,
    item.subfolder,
  ]);

  useEffect(() => {
    setFileName(focusedFile?.name ?? "");
  }, [focusedFile?.url, focusedFile?.name]);

  const isGallery =
    (categoryMode === "new" ? newCategory : category)
      .trim()
      .toLowerCase() === GALLERY_CATEGORY.toLowerCase();

  async function save() {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const resolvedCategory =
        categoryMode === "new" ? newCategory.trim() : category.trim();
      if (!resolvedCategory) throw new Error("Category is required");
      if (!itemName.trim()) throw new Error("Asset name is required");

      const resolvedSubfolder = isGallery
        ? subfolderMode === "new"
          ? newSubfolder.trim()
          : subfolder.trim()
        : "";

      if (
        focusedFile &&
        fileName.trim() &&
        fileName.trim() !== focusedFile.name
      ) {
        const res = await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "rename_file",
            id: item.id,
            fileUrl: focusedFile.url,
            newName: fileName.trim(),
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error || "Could not rename file");
      }

      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: item.id,
          name: itemName,
          public_title: publicTitle,
          notes,
          category: resolvedCategory,
          subfolder: resolvedSubfolder,
          document_link: documentLink,
          visibility,
          division,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not save");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFile() {
    if (!canEdit || saving || !focusedFile) return;
    if (!window.confirm("Delete this file from the asset?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_file",
          id: item.id,
          fileUrl: focusedFile.url,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        deletedItem?: boolean;
      };
      if (!res.ok) throw new Error(json.error || "Could not delete");
      await onSaved();
      if (json.deletedItem) onClose();
      else onFocusFile?.(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAsset() {
    if (!canEdit || saving) return;
    if (
      !window.confirm(
        "Delete this whole media asset (all files in this set)?"
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: item.id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not delete");
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setSaving(false);
    }
  }

  async function uploadFiles(incoming: File[]) {
    if (!canEdit || uploading || saving || incoming.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const oversized = incoming.filter((f) => f.size > MAX_UPLOAD_BYTES_ADMIN);
      if (oversized.length > 0) {
        throw new Error(
          `These files are over ${Math.round(MAX_UPLOAD_BYTES_ADMIN / (1024 * 1024))}MB: ${oversized
            .map((f) => f.name)
            .slice(0, 3)
            .join(", ")}`
        );
      }

      const uploaded: {
        url: string;
        name: string;
        type?: string;
        size?: number | null;
      }[] = [];

      if (incoming.length > 0) {
        setUploadProgress({
          current: 1,
          total: incoming.length,
          name: incoming[0].name,
          percent: 0,
          loaded: 0,
          size: incoming[0].size,
          phase: "upload",
        });
      }

      for (let i = 0; i < incoming.length; i++) {
        const file = incoming[i];
        try {
          const uploadedFile = await uploadAssetDirect(file, {
            maxBytes: MAX_UPLOAD_BYTES_ADMIN,
            onProgress: (event) => {
              setUploadProgress({
                current: i + 1,
                total: incoming.length,
                name: file.name,
                percent: event.percent,
                loaded: event.loaded,
                size: event.total || file.size,
                phase: "upload",
              });
            },
          });
          uploaded.push({
            url: uploadedFile.url,
            name: uploadedFile.name || file.name,
            type: file.type,
            size: file.size,
          });
        } catch (e) {
          throw new Error(
            e instanceof Error
              ? `${e.message} (${i + 1}/${incoming.length})`
              : `Upload failed for ${file.name}`
          );
        }
      }

      setUploadProgress((prev) =>
        prev
          ? { ...prev, phase: "save", percent: 100, loaded: prev.size }
          : null
      );

      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_files",
          id: item.id,
          files: uploaded,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        item?: MediaListItem;
      };
      if (!res.ok) throw new Error(json.error || "Could not add files");
      const firstNew = uploaded[0]?.url ?? null;
      await onSaved();
      if (firstNew) onFocusFile?.(firstNew);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload files");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setDragActive(false);
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit || uploading) return;
    setDragActive(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function onDropFiles(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!canEdit || uploading) return;
    void uploadFiles(filesFromList(e.dataTransfer.files));
  }

  function onPasteFiles(e: ClipboardEvent) {
    if (!canEdit || uploading || saving) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const images: File[] = [];
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      const raw = item.getAsFile();
      if (!raw) continue;
      images.push(fileFromClipboardImage(raw));
    }
    if (images.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    void uploadFiles(images);
  }

  const previewUrl = useMemo(() => {
    if (focusedFile && isImageFile(focusedFile)) return focusedFile.url;
    const cover = item.files.find(isImageFile);
    return cover?.url ?? null;
  }, [focusedFile, item.files]);

  const needsPreviewImage = !previewUrl && canEdit;

  return (
    <RecordDrawer
      open
      onClose={onClose}
      title={canEdit ? "Edit media" : "Media details"}
      ariaLabel={canEdit ? "Edit media" : "Media details"}
      subtitle={item.name || "Untitled asset"}
      footer={
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <button
                type="button"
                className={cn("btn-primary", (saving || uploading) && "opacity-70")}
                disabled={saving || uploading}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            ) : null}
            {focusedFile && canDownload ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  void downloadMediaFile(
                    focusedFile.url,
                    fileName || focusedFile.name
                  ).catch((e) => {
                    window.alert(
                      e instanceof Error ? e.message : "Download failed"
                    );
                  });
                }}
              >
                <Download className="h-4 w-4" />
                Download
              </button>
            ) : documentLink && canDownload ? (
              <a
                href={documentLink}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                Open link
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={onClose}
            >
              Close
            </button>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {focusedFile ? (
                <button
                  type="button"
                  className="btn-ghost text-[var(--danger)]"
                  disabled={saving}
                  onClick={() => void deleteFile()}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete file
                </button>
              ) : null}
              <button
                type="button"
                className="btn-ghost text-[var(--danger)]"
                disabled={saving}
                onClick={() => void deleteAsset()}
              >
                Delete asset
              </button>
            </div>
          ) : null}
        </div>
      }
    >
      <div onPaste={onPasteFiles}>
        <div className="min-h-0">
          {previewUrl ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-[#f0f2f3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={fileName || itemName}
                className="max-h-56 w-full object-contain"
              />
            </div>
          ) : (
            <div
              className={cn(
                "rounded-2xl border border-dashed px-4 py-8 text-center text-sm",
                needsPreviewImage
                  ? "border-amber-300 bg-amber-50/80 text-amber-950"
                  : "border-border bg-sand/40 text-muted"
              )}
            >
              <p className="font-medium">
                {focusedFile?.name ||
                  item.document_link ||
                  "No image preview for this asset"}
              </p>
              {needsPreviewImage ? (
                <p className="mt-2 text-xs text-amber-900/80">
                  Paste a screenshot (Ctrl+V) or upload an image below to use as
                  the library preview. Keep the PDF/file as well.
                </p>
              ) : null}
            </div>
          )}

          {focusedFile ? (
            <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-border bg-sand/40 px-3 py-2.5 text-xs">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Date
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {formatFileDate(item.created_at) ||
                    formatFileDate(item.updated_at) ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Type
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {formatFileType(focusedFile)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Size
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {formatFileSize(focusedFile.size) || "—"}
                </dd>
              </div>
            </dl>
          ) : item.created_at || item.updated_at ? (
            <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-border bg-sand/40 px-3 py-2.5 text-xs">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Date
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {formatFileDate(item.created_at) ||
                    formatFileDate(item.updated_at) ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Type
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">Link</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Size
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">—</dd>
              </div>
            </dl>
          ) : null}

          {item.files.length > 0 ? (
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Files in this asset
              </p>
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-border bg-sand/30 p-1.5">
                {item.files.map((file) => (
                  <li key={file.url}>
                    <button
                      type="button"
                      className={cn(
                        "w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs transition",
                        focusedFile?.url === file.url
                          ? "bg-white font-medium text-brand shadow-sm"
                          : "text-muted hover:bg-white/70 hover:text-foreground"
                      )}
                      onClick={() => onFocusFile?.(file.url)}
                    >
                      {file.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canEdit ? (
            <div className="mt-3">
              <label className="label">
                {item.files.length > 0 ? "Add files" : "Upload files"}
              </label>
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "cursor-pointer rounded-2xl border-2 border-dashed px-3 py-5 text-center transition",
                  dragActive
                    ? "border-brand bg-brand/5"
                    : "border-border bg-sand/30 hover:border-brand/40 hover:bg-sand/50",
                  (uploading || saving) && "pointer-events-none"
                )}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragEnter={onDragOver}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDropFiles}
              >
                {uploading ? (
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand" />
                ) : (
                  <Upload
                    className={cn(
                      "mx-auto h-6 w-6",
                      dragActive ? "text-brand" : "text-muted"
                    )}
                  />
                )}
                {uploading && uploadProgress ? (
                  <UploadProgressBar
                    progress={uploadProgress}
                    className="mx-auto mt-3 max-w-sm text-left"
                  />
                ) : (
                  <>
                    <p className="mt-1.5 text-sm font-medium text-brand">
                      {needsPreviewImage
                        ? "Drop, click, or paste (Ctrl+V) a preview image"
                        : "Drop files here, click, or paste (Ctrl+V)"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Images, PDF, or short video · max{" "}
                      {Math.round(MAX_UPLOAD_BYTES_ADMIN / (1024 * 1024))}MB each
                      {needsPreviewImage
                        ? " · screenshots become the gallery thumbnail"
                        : ""}
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  multiple
                  accept={MEDIA_ACCEPT}
                  disabled={uploading || saving}
                  onChange={(e) => {
                    void uploadFiles(filesFromList(e.target.files));
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {focusedFile ? (
              <div>
                <label className="label">File name</label>
                <input
                  className="field"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  readOnly={!canEdit}
                  disabled={!canEdit}
                />
              </div>
            ) : null}
            <div>
              <label className="label">Asset name (internal)</label>
              <input
                className="field"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                readOnly={!canEdit}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="label">Public title</label>
              <input
                className="field"
                value={publicTitle}
                onChange={(e) => setPublicTitle(e.target.value)}
                placeholder="Shown externally (optional)"
                readOnly={!canEdit}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="label">Category</label>
              {canEdit ? (
                <div className="space-y-2">
                  {categoryMode === "new" ? (
                    <>
                      <input
                        className="field"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="New category name"
                        autoFocus
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-ghost px-2.5 py-1.5 text-xs"
                          onClick={() => {
                            setCategoryMode("existing");
                            setNewCategory("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-xs text-muted">
                        Saves as a new category when you click Save
                      </p>
                    </>
                  ) : (
                    <>
                      <SearchSelect
                        className="field"
                        value={
                          categoryOptions.includes(category)
                            ? category
                            : category || GALLERY_CATEGORY
                        }
                        onChange={(value) => {
                          setCategory(value);
                          if (
                            value.toLowerCase() !==
                            GALLERY_CATEGORY.toLowerCase()
                          ) {
                            setSubfolder("");
                            setSubfolderMode("existing");
                            setNewSubfolder("");
                          }
                        }}
                        options={[
                          ...(!categoryOptions.includes(category) && category
                            ? [{ value: category, label: category }]
                            : []),
                          ...categoryOptions.map((c) => ({
                            value: c,
                            label: c,
                          })),
                        ]}
                      />
                      <button
                        type="button"
                        className="btn-secondary w-full px-2.5 py-1.5 text-xs"
                        onClick={() => {
                          setCategoryMode("new");
                          setNewCategory("");
                          setSubfolder("");
                          setSubfolderMode("existing");
                          setNewSubfolder("");
                        }}
                      >
                        + Add new category
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <p className="field bg-sand/40 text-sm">{category || "—"}</p>
              )}
            </div>
            {isGallery ? (
              <div>
                <label className="label">Gallery subfolder</label>
                {canEdit ? (
                  <>
                    <SearchSelect
                      className="field"
                      value={
                        subfolderMode === "new"
                          ? NEW_SUBFOLDER_VALUE
                          : subfolder || ""
                      }
                      allowEmpty
                      emptyLabel="Unsorted"
                      onChange={(value) => {
                        if (value === NEW_SUBFOLDER_VALUE) {
                          setSubfolderMode("new");
                          return;
                        }
                        setSubfolderMode("existing");
                        setSubfolder(value);
                      }}
                      options={[
                        ...subfolderOptions.map((s) => ({
                          value: s,
                          label: s,
                        })),
                        {
                          value: NEW_SUBFOLDER_VALUE,
                          label: "+ Add new subfolder…",
                        },
                      ]}
                    />
                    {subfolderMode === "new" ? (
                      <input
                        className="field mt-2"
                        value={newSubfolder}
                        onChange={(e) => setNewSubfolder(e.target.value)}
                        placeholder="e.g. Catamaran"
                        autoFocus
                      />
                    ) : null}
                  </>
                ) : (
                  <p className="field bg-sand/40 text-sm">
                    {subfolder || "Unsorted"}
                  </p>
                )}
              </div>
            ) : null}
            <div>
              <label className="label">Visibility</label>
              {canEdit ? (
                <>
                  <div
                    className="inline-flex w-full rounded-xl border border-border bg-sand/60 p-1"
                    role="group"
                    aria-label="Item visibility"
                  >
                    {VISIBILITY_CONTROL_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={cn(
                            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition",
                            visibility === option.id
                              ? "bg-white text-brand shadow-sm"
                              : "text-muted hover:text-foreground"
                          )}
                          onClick={() => setVisibility(option.id)}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {isGallery && item.subfolder_visibility === "public" ? (
                    <p className="mt-1 text-xs text-muted">
                      Overrides the folder when set to Internal or Admin only.
                      If the folder is Internal or Admin only, all files match
                      the folder. Folder Link share is separate.
                    </p>
                  ) : isGallery && item.subfolder_visibility === "internal" ? (
                    <p className="mt-1 text-xs text-muted">
                      Folder is Internal — hidden from /media. You can still set
                      this file to Admin only, and use Link share on the folder.
                    </p>
                  ) : isGallery && item.subfolder_visibility === "admin" ? (
                    <p className="mt-1 text-xs text-muted">
                      Folder is Admin only — this file stays admin-only until
                      the folder is changed. Link share can still be enabled on
                      the folder.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted">
                      Public is listed externally. Internal is staff-only. Admin
                      only is hidden from members.
                    </p>
                  )}
                </>
              ) : (
                <p className="field bg-sand/40 text-sm">
                  {visibilityLabel(visibility)}
                  {isGallery &&
                  item.subfolder_visibility === "public" &&
                  visibility !== "public"
                    ? " (overrides public folder)"
                    : ""}
                </p>
              )}
            </div>
            <div>
              <label className="label">Division</label>
              {canEdit ? (
                <>
                  <SearchSelect
                    className="field"
                    value={division}
                    onChange={setDivision}
                    options={DIVISION_OPTIONS.map((d) => ({
                      value: d,
                      label: d === "All" ? "All (shared)" : d,
                    }))}
                  />
                  <p className="mt-1 text-xs text-muted">
                    Tag the department. &quot;All&quot; appears in every
                    division filter.
                  </p>
                </>
              ) : (
                <p className="field bg-sand/40 text-sm">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: divisionColor(division).bg,
                      color: divisionColor(division).text,
                    }}
                  >
                    {normalizeDivision(division) || "All"}
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="label">Document / link</label>
              <input
                className="field"
                value={documentLink}
                onChange={(e) => setDocumentLink(e.target.value)}
                placeholder="https://…"
                readOnly={!canEdit}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="label">Notes</label>
              {canEdit ? (
                <RichTextEditor
                  value={notes}
                  onChange={setNotes}
                  placeholder="Notes…"
                  minHeight="80px"
                />
              ) : (
                <RichTextView html={notes} />
              )}
            </div>
            {error ? (
              <p className="text-sm text-[var(--danger)]">{error}</p>
            ) : null}
            <RelatedTasksPanel relatedType="asset" relatedId={item.id} />
          </div>
        </div>
      </div>
    </RecordDrawer>
  );
}
