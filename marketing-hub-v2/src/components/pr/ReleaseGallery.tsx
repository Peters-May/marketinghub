"use client";

import { useState } from "react";

export function ReleaseGallery({
  images,
}: {
  images: { src: string; alt: string }[];
}) {
  const [open, setOpen] = useState<number | null>(null);
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
              <button type="button" onClick={() => setOpen((index) => (index === null ? 0 : (index + images.length - 1) % images.length))}>
                Previous
              </button>
              <button type="button" onClick={() => setOpen(null)}>
                Close
              </button>
              <button type="button" onClick={() => setOpen((index) => (index === null ? 0 : (index + 1) % images.length))}>
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
