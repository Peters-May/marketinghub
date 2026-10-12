"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import {
  joinAssetUrls,
  parseAssetUrls,
  primaryCanvaUrl,
  primaryImageUrl,
} from "@/lib/data/normalize";
import { isCanvaUrl, isImageUrl } from "@/lib/social/platforms";
import { uploadAssetDirect } from "@/lib/upload/client-upload";
import {
  isAllowedUpload,
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT,
} from "@/lib/upload/allowed-types";
import { cn } from "@/lib/utils";
import { CanvaPreviewTile } from "@/components/content/CanvaPreviewTile";
import {
  UploadProgressBar,
  type FileUploadProgress,
} from "@/components/ui/UploadProgress";

type SingleProps = {
  multiple?: false;
  value: string;
  onChange: (url: string) => void;
};

type MultiProps = {
  multiple: true;
  value: string;
  onChange: (urlsJoined: string) => void;
};

function filesFromList(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => isAllowedUpload(file.name, file.type));
}

function filesFromDrop(dt: DataTransfer): File[] {
  if (dt.files?.length) return filesFromList(dt.files);
  const fromItems: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) fromItems.push(file);
  }
  return filesFromList(fromItems);
}

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

export function AssetUploadField({
  value,
  onChange,
  multiple = false,
  label,
  hint,
}: {
  label?: string;
  hint?: string;
} & (SingleProps | MultiProps)) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<FileUploadProgress | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [reorderFrom, setReorderFrom] = useState<number | null>(null);
  const [reorderOver, setReorderOver] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");

  const fieldLabel = label ?? (multiple ? "Assets" : "Asset");
  const urls = multiple ? parseAssetUrls(value) : value ? [value] : [];
  const hasCanva = Boolean(primaryCanvaUrl(value));
  const hasImage = Boolean(primaryImageUrl(value));
  const needsPreviewImage = hasCanva && !hasImage;
  const resolvedHint =
    hint ??
    (needsPreviewImage
      ? "Canva link saved — also drop, upload, or paste a PNG or JPG so the calendar can show the real design."
      : multiple
        ? `Drop several files at once, click to pick, or paste (Ctrl+V). Drag to reorder — 1 is first in the carousel. Images, PDF, Word, Excel, PowerPoint, CSV or short video · max ${MAX_MB}MB each.`
        : `Drop a file, click to pick, or paste (Ctrl+V). Images, PDF, Word, Excel, PowerPoint, CSV or short video · max ${MAX_MB}MB.`);

  function commit(next: string[]) {
    const cleaned = parseAssetUrls(next);
    if (multiple) {
      (onChange as MultiProps["onChange"])(joinAssetUrls(cleaned));
    } else {
      (onChange as SingleProps["onChange"])(cleaned[0] ?? "");
    }
  }

  async function onFiles(incoming: File[]) {
    if (uploading) return;
    const accepted = filesFromList(incoming);
    if (accepted.length === 0) {
      if (incoming.length > 0) {
        setError(
          "Use images, PDF, Word, Excel, PowerPoint, CSV or short video"
        );
      }
      return;
    }

    const toUpload = multiple ? accepted : accepted.slice(0, 1);
    setUploading(true);
    setError(
      !multiple && accepted.length > 1
        ? "This field takes one file — using the first dropped file."
        : null
    );
    setProgress({
      current: 1,
      total: toUpload.length,
      name: toUpload[0]?.name ?? "file",
      percent: 0,
      loaded: 0,
      size: toUpload[0]?.size ?? 0,
      phase: "upload",
    });
    try {
      const added: string[] = [];
      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i];
        setProgress({
          current: i + 1,
          total: toUpload.length,
          name: file.name,
          percent: 0,
          loaded: 0,
          size: file.size,
          phase: "upload",
        });
        const data = await uploadAssetDirect(file, {
          onProgress: (event) => {
            setProgress({
              current: i + 1,
              total: toUpload.length,
              name: file.name,
              percent: event.percent,
              loaded: event.loaded,
              size: event.total || file.size,
              phase: "upload",
            });
          },
        });
        added.push(data.url);
      }
      commit(multiple ? [...urls, ...added] : added);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(null);
      setDragActive(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (uploading || reorderFrom !== null) return;
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.dataTransfer.dropEffect = "copy";
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
    if (uploading || reorderFrom !== null) return;
    void onFiles(filesFromDrop(e.dataTransfer));
  }

  async function onPasteImage(e: ClipboardEvent) {
    if (uploading) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const images: File[] = [];
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) images.push(file);
    }
    if (images.length === 0) return;
    e.preventDefault();
    await onFiles(images);
  }

  function addPastedUrl() {
    const next = pasteUrl.trim();
    if (!next) return;
    commit(multiple ? [...urls, next] : [next]);
    if (multiple) setPasteUrl("");
  }

  function removeAt(index: number) {
    commit(urls.filter((_, i) => i !== index));
  }

  function moveAt(from: number, to: number) {
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= urls.length ||
      to >= urls.length
    ) {
      return;
    }
    const next = [...urls];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  }

  function clearReorder() {
    setReorderFrom(null);
    setReorderOver(null);
  }

  function openPicker() {
    if (uploading) return;
    inputRef.current?.click();
  }

  const dropTitle = uploading
    ? "Uploading…"
    : needsPreviewImage
      ? "Drop, click, or paste (Ctrl+V) a preview image"
      : multiple
        ? urls.length
          ? "Drop files here or click to add"
          : "Drop files here, click, or paste (Ctrl+V)"
        : urls.length
          ? "Drop to replace, click, or paste (Ctrl+V)"
          : "Drop a file here, click, or paste (Ctrl+V)";

  const dropHint = multiple
    ? `Images, PDF, or documents · max ${MAX_MB}MB each · several files at once`
    : `Images, PDF, or documents · max ${MAX_MB}MB`;

  const dropZone = (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "cursor-pointer rounded-2xl border-2 border-dashed px-3 py-5 text-center transition",
        dragActive
          ? "border-brand bg-brand/5"
          : "border-border bg-sand/30 hover:border-brand/40 hover:bg-sand/50",
        uploading && "pointer-events-none"
      )}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
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
          className={cn("mx-auto h-6 w-6", dragActive ? "text-brand" : "text-muted")}
        />
      )}
      {uploading && progress ? (
        <UploadProgressBar progress={progress} className="mx-auto mt-3 max-w-sm text-left" />
      ) : (
        <>
          <p className="mt-1.5 text-sm font-medium text-brand">{dropTitle}</p>
          <p className="mt-1 text-xs text-muted">{dropHint}</p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={UPLOAD_ACCEPT}
        multiple={multiple}
        disabled={uploading}
        onChange={(e) => {
          void onFiles(filesFromList(e.target.files));
          e.target.value = "";
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );

  if (!multiple) {
    const single = urls[0] ?? "";
    return (
      <div className="space-y-2" onPaste={(e) => void onPasteImage(e)}>
        <label className="label">{fieldLabel}</label>
        {single && isImageUrl(single) ? (
          <a
            href={single}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-xl border border-border bg-sand/40 transition hover:border-brand/40"
            title="Open asset"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={single}
              alt=""
              className="max-h-40 w-full object-contain"
            />
          </a>
        ) : single && isCanvaUrl(single) ? (
          <a
            href={single}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-xl border border-border transition hover:border-brand/40"
            title="Open in Canva"
          >
            <CanvaPreviewTile url={single} compact={false} />
          </a>
        ) : single ? (
          <a
            href={single}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate rounded-xl border border-border bg-sand/40 px-3 py-2 text-xs text-brand underline-offset-2 hover:underline"
            title="Open asset"
          >
            {single}
          </a>
        ) : null}

        {needsPreviewImage ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
            Private Canva links can’t be previewed automatically. Drop, upload or
            paste (Ctrl+V) a PNG/JPG export for the calendar thumbnail.
          </p>
        ) : null}

        {dropZone}

        {single ? (
          <button
            type="button"
            className="btn-ghost text-[var(--danger)]"
            disabled={uploading}
            onClick={() => commit([])}
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        ) : null}

        <input
          className="field text-xs"
          value={value}
          onChange={(e) =>
            (onChange as SingleProps["onChange"])(e.target.value)
          }
          placeholder="Or paste an asset URL…"
        />
        {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
        {resolvedHint ? (
          <p className="text-[11px] text-muted">{resolvedHint}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2" onPaste={(e) => void onPasteImage(e)}>
      <label className="label">{fieldLabel}</label>

      {needsPreviewImage ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
          Private Canva links can’t be previewed automatically. Keep the Canva
          link and also drop, upload, or paste (Ctrl+V) a PNG/JPG — the calendar
          uses the image.
        </p>
      ) : null}

      {urls.length > 0 ? (
        <ul className="space-y-2">
          {urls.map((url, index) => {
            const canReorder = urls.length > 1 && !uploading;
            return (
            <li
              key={`${url}-${index}`}
              className={cn(
                "flex items-start gap-2 rounded-xl border border-border bg-sand/40 p-2",
                reorderOver === index &&
                  reorderFrom !== index &&
                  "ring-2 ring-brand/30 bg-brand/5",
                reorderFrom === index && "opacity-50"
              )}
              onDragOver={(e) => {
                if (!canReorder || reorderFrom === null) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                if (reorderOver !== index) setReorderOver(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!canReorder) return;
                const fromStr = e.dataTransfer.getData("text/plain");
                const from = Number.parseInt(fromStr, 10);
                if (Number.isFinite(from)) moveAt(from, index);
                clearReorder();
              }}
              onDragLeave={() => {
                if (reorderOver === index) setReorderOver(null);
              }}
            >
              {canReorder ? (
                <button
                  type="button"
                  className="mt-3 shrink-0 cursor-grab select-none rounded p-1 text-muted hover:bg-white hover:text-foreground active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(index));
                    e.dataTransfer.effectAllowed = "move";
                    setReorderFrom(index);
                  }}
                  onDragEnd={clearReorder}
                  aria-label={`Drag to reorder asset ${index + 1}`}
                  title="Drag to reorder"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              ) : null}
              <span
                className="mt-4 w-4 shrink-0 text-center text-[11px] font-semibold text-muted"
                title={index === 0 ? "First in carousel" : `Position ${index + 1}`}
              >
                {index + 1}
              </span>
              {isImageUrl(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-white"
                  title="Open asset"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </a>
              ) : isCanvaUrl(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border"
                  title="Open in Canva"
                >
                  <CanvaPreviewTile
                    url={url}
                    compact
                    className="aspect-auto h-full rounded-lg"
                  />
                </a>
              ) : (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-brand"
                  title="Open asset"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate pt-1 text-xs text-brand underline-offset-2 hover:underline"
                title={url}
              >
                {url}
              </a>
              {canReorder ? (
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted hover:bg-white hover:text-foreground disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => moveAt(index, index - 1)}
                    title="Move up"
                    aria-label={`Move asset ${index + 1} up`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted hover:bg-white hover:text-foreground disabled:opacity-30"
                    disabled={index === urls.length - 1}
                    onClick={() => moveAt(index, index + 1)}
                    title="Move down"
                    aria-label={`Move asset ${index + 1} down`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="btn-ghost shrink-0 text-[var(--danger)]"
                disabled={uploading}
                onClick={() => removeAt(index)}
                title="Remove asset"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
            );
          })}
        </ul>
      ) : null}

      {dropZone}

      <div className="flex gap-2">
        <input
          className="field flex-1 text-xs"
          value={pasteUrl}
          onChange={(e) => setPasteUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPastedUrl();
            }
          }}
          placeholder="Or paste an asset URL and press Enter…"
        />
        <button
          type="button"
          className="btn-secondary shrink-0"
          disabled={!pasteUrl.trim() || uploading}
          onClick={addPastedUrl}
        >
          Add
        </button>
      </div>

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      {resolvedHint ? (
        <p className="text-[11px] text-muted">{resolvedHint}</p>
      ) : null}
    </div>
  );
}
