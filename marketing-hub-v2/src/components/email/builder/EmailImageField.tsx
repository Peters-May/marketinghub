"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type GalleryImage = {
  id: string;
  name: string;
  url: string;
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
      <div>
        <p className="text-sm text-muted">Email gallery</p>
        {images.length === 0 ? (
          <p className="mt-1 text-xs text-muted">Uploaded images are kept here.</p>
        ) : (
          <div className="mt-1 grid grid-cols-3 gap-1">
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                title={image.name}
                className={cn(
                  "overflow-hidden rounded border border-border bg-white",
                  image.url === src && "ring-2 ring-brand"
                )}
                onClick={() => onChange(image.url)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.name} className="h-14 w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
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
