"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Folder } from "lucide-react";
import { groupAssetImages } from "@/lib/email/asset-images";
import { EmailImageCrop } from "@/components/email/builder/EmailImageCrop";
import { cn } from "@/lib/utils";

type GalleryImage = {
  id: string;
  name: string;
  url: string;
  folder?: string;
};

export function EmailImageField({
  src,
  onChange,
}: {
  src: string;
  onChange: (src: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [assets, setAssets] = useState<GalleryImage[]>([]);
  const [assetsNote, setAssetsNote] = useState("Loading the asset gallery…");
  const [uploading, setUploading] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/email/gallery")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.images)) setImages(data.images);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });
    void fetch("/api/email/assets")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the asset gallery");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setAssets(Array.isArray(data.images) ? data.images : []);
        setAssetsNote("No images in the asset gallery yet.");
      })
      .catch(() => {
        if (!cancelled) {
          setAssets([]);
          setAssetsNote("The asset gallery could not be loaded.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/email/gallery", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not upload the image");
      const item = data.item as GalleryImage;
      setImages((current) => [item, ...current.filter((image) => image.id !== item.id)]);
      onChange(item.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the image");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted">Image</span>
        <span className="flex gap-1">
          {src ? (
            <button
              type="button"
              className="btn-secondary px-2 py-1 text-xs"
              disabled={uploading}
              onClick={() => setCropping(true)}
            >
              Crop
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Upload new"}
          </button>
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {cropping && src ? (
        <EmailImageCrop
          src={src}
          onClose={() => setCropping(false)}
          onApply={(file) => {
            setCropping(false);
            void upload(file);
          }}
        />
      ) : null}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="max-h-28 w-full rounded border border-border object-contain"
        />
      ) : null}
      <AssetGallery
        note={assetsNote}
        images={assets}
        selected={src}
        onSelect={onChange}
      />
      <ImageChoices
        label="Uploaded for email"
        empty="Images you upload here are kept for later emails."
        images={images}
        selected={src}
        onSelect={onChange}
      />
      <label className="block text-sm">
        <span className="text-muted">Or paste a link</span>
        <input
          className="input mt-1 w-full"
          value={src}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}

function AssetGallery({
  note,
  images,
  selected,
  onSelect,
}: {
  note: string;
  images: GalleryImage[];
  selected: string;
  onSelect: (url: string) => void;
}) {
  const [folder, setFolder] = useState<string | null>(null);
  const folders = useMemo(() => groupAssetImages(images), [images]);
  const inFolder = images.filter((image) => (image.folder || "Gallery") === folder);

  return (
    <div>
      <p className="text-sm text-muted">Asset gallery</p>
      {images.length === 0 ? (
        <p className="mt-1 text-xs text-muted">{note}</p>
      ) : folder ? (
        <div className="mt-1 space-y-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-brand"
            onClick={() => setFolder(null)}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            All folders
          </button>
          <p className="truncate text-sm text-brand">{folder}</p>
          <div className="grid max-h-52 grid-cols-3 gap-1 overflow-y-auto">
            {inFolder.map((image) => (
              <button
                key={image.id}
                type="button"
                title={image.name}
                className={cn(
                  "overflow-hidden rounded border border-border bg-white",
                  image.url === selected && "ring-2 ring-brand"
                )}
                onClick={() => onSelect(image.url)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.name} className="h-14 w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-1 max-h-52 space-y-1 overflow-y-auto">
          {folders.map((entry) => (
            <button
              key={entry.name}
              type="button"
              className="flex w-full items-center gap-2 rounded border border-border bg-white p-1 text-left"
              onClick={() => setFolder(entry.name)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.coverUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm text-brand">
                  <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="text-xs text-muted">
                  {entry.count === 1 ? "1 image" : `${entry.count} images`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageChoices({
  label,
  empty,
  images,
  selected,
  onSelect,
}: {
  label: string;
  empty: string;
  images: GalleryImage[];
  selected: string;
  onSelect: (url: string) => void;
}) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      {images.length === 0 ? (
        <p className="mt-1 text-xs text-muted">{empty}</p>
      ) : (
        <div className="mt-1 grid max-h-52 grid-cols-3 gap-1 overflow-y-auto">
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              title={image.name}
              className={cn(
                "overflow-hidden rounded border border-border bg-white",
                image.url === selected && "ring-2 ring-brand"
              )}
              onClick={() => onSelect(image.url)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.name} className="h-14 w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
