"use client";

import { useState } from "react";
import { useDialog } from "@/components/pr/useDialog";

export function ReleaseGallery({
  images,
}: {
  images: { src: string; alt: string }[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useDialog(open !== null, () => setOpen(null));
  if (!images.length) return null;
  const current = open === null ? null : images[open];

  return (
    <>
      <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((image, index) => (
          <button
            key={`${image.src}-${index}`}
            type="button"
            className="overflow-hidden rounded-lg border border-brand/10"
            aria-label={image.alt || `Open image ${index + 1}`}
            onClick={() => setOpen(index)}
          >
            {/* Staff uploads and pasted image URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.src} alt={image.alt} className="aspect-[4/3] w-full object-cover" />
          </button>
        ))}
      </div>
      {current ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(null)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={current.alt || "Image"}
            className="max-h-[90vh] max-w-4xl"
            onClick={(event) => event.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.src}
              alt={current.alt}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
            <div className="mt-3 flex items-center justify-between gap-3 text-sm text-white">
              <button type="button" aria-label="Previous image" onClick={() => setOpen((index) => (index === null ? 0 : (index + images.length - 1) % images.length))}>
                Previous
              </button>
              <button type="button" aria-label="Close gallery" onClick={() => setOpen(null)}>
                Close
              </button>
              <button type="button" aria-label="Next image" onClick={() => setOpen((index) => (index === null ? 0 : (index + 1) % images.length))}>
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
