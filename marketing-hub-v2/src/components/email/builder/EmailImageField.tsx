"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type GalleryImage = {
  id: string;
  name: string;
  url: string;
};

type AssetFile = { url?: string; name?: string; type?: string };
type AssetItem = {
  id?: string;
  name?: string;
  display_name?: string;
  cover_url?: string | null;
  document_url?: string;
  document_link?: string;
  files?: AssetFile[];
};

function isRasterImage(name: string, type: string) {
  if (type.startsWith("image/") && type !== "image/svg+xml") return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

function driveThumb(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (!parsed.hostname.toLowerCase().includes("google.com")) return null;
    const pathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const id = pathMatch?.[1] || parsed.searchParams.get("id");
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w800` : null;
  } catch {
    return null;
  }
}

function assetImages(items: AssetItem[]): GalleryImage[] {
  const images: GalleryImage[] = [];
  const seen = new Set<string>();
  const add = (id: string, name: string, url: string | null | undefined) => {
    const next = url?.trim() || "";
    if (!next || seen.has(next) || images.length >= 48) return;
    seen.add(next);
    images.push({ id, name: name || "Image", url: next });
  };

  items.forEach((item, index) => {
    const label = item.display_name?.trim() || item.name?.trim() || "Image";
    const itemId = item.id || `asset-${index}`;
    for (const file of item.files ?? []) {
      const name = file.name || label;
      const raw = file.url?.trim() || "";
      if (!raw || !isRasterImage(name, file.type || "")) continue;
      const url = raw.includes("google.com") ? driveThumb(raw) || raw : raw;
      add(`${itemId}-${raw}`, name, url);
    }
    const cover = item.cover_url?.trim() || "";
    if (cover && isRasterImage(cover, "")) {
      add(`${itemId}-cover`, label, cover.includes("google.com") ? driveThumb(cover) || cover : cover);
    }
  });
  return images;
}

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
  const [uploading, setUploading] = useState(false);
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
    void fetch("/api/media/list?scope=all&limit=200")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.items)) setAssets(assetImages(data.items));
      })
      .catch(() => {
        if (!cancelled) setAssets([]);
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
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-xs"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Upload image"}
        </button>
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
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="max-h-28 w-full rounded border border-border object-contain"
        />
      ) : null}
      <ImageChoices
        label="Email gallery"
        empty="Images you upload here are kept for later emails."
        images={images}
        selected={src}
        onSelect={onChange}
      />
      <ImageChoices
        label="Asset gallery"
        empty="Images from the library will appear here."
        images={assets}
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
        <div className="mt-1 grid max-h-36 grid-cols-3 gap-1 overflow-y-auto">
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
