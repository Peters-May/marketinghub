"use client";

import { useRef, useState } from "react";

type Crop = { x: number; y: number; w: number; h: number };

const ASPECTS: { id: string; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "wide", label: "Wide", ratio: 16 / 9 },
  { id: "square", label: "Square", ratio: 1 },
];

function clampCrop(crop: Crop): Crop {
  const w = Math.min(100, Math.max(8, crop.w));
  const h = Math.min(100, Math.max(8, crop.h));
  return {
    w,
    h,
    x: Math.min(100 - w, Math.max(0, crop.x)),
    y: Math.min(100 - h, Math.max(0, crop.y)),
  };
}

function cropForRatio(ratio: number | null, current: Crop): Crop {
  if (!ratio) return current;
  const w = current.w;
  const h = Math.min(100, w / ratio);
  return clampCrop({
    x: current.x,
    y: current.y,
    w: h * ratio > 100 ? 100 : w,
    h: h * ratio > 100 ? 100 / ratio : h,
  });
}

export function EmailImageCrop({
  src,
  onClose,
  onApply,
}: {
  src: string;
  onClose: () => void;
  onApply: (file: File) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>({ x: 8, y: 8, w: 84, h: 84 });
  const [aspect, setAspect] = useState<string>("free");
  const [error, setError] = useState("");
  const drag = useRef<
    | { mode: "move" | "resize"; startX: number; startY: number; crop: Crop }
    | null
  >(null);

  function ratio() {
    return ASPECTS.find((item) => item.id === aspect)?.ratio ?? null;
  }

  function point(event: React.PointerEvent) {
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - frame.left) / frame.width) * 100,
      y: ((event.clientY - frame.top) / frame.height) * 100,
    };
  }

  function onPointerDown(event: React.PointerEvent, mode: "move" | "resize") {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = point(event);
    drag.current = { mode, startX: at.x, startY: at.y, crop };
  }

  function onPointerMove(event: React.PointerEvent) {
    const active = drag.current;
    if (!active) return;
    const at = point(event);
    const dx = at.x - active.startX;
    const dy = at.y - active.startY;
    if (active.mode === "move") {
      setCrop(clampCrop({ ...active.crop, x: active.crop.x + dx, y: active.crop.y + dy }));
      return;
    }
    const next = clampCrop({
      ...active.crop,
      w: active.crop.w + dx,
      h: active.crop.h + dy,
    });
    setCrop(cropForRatio(ratio(), next));
  }

  function onPointerUp() {
    drag.current = null;
  }

  function apply() {
    const image = imageRef.current;
    if (!image || !image.naturalWidth) {
      setError("The image has not loaded yet.");
      return;
    }
    const sx = (crop.x / 100) * image.naturalWidth;
    const sy = (crop.y / 100) * image.naturalHeight;
    const sw = (crop.w / 100) * image.naturalWidth;
    const sh = (crop.h / 100) * image.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Cropping is not available in this browser.");
      return;
    }
    try {
      context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    } catch {
      setError("This image cannot be cropped. Upload it, then crop the copy.");
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Could not crop that image.");
          return;
        }
        onApply(new File([blob], "cropped-image.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/25 md:left-sidebar"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Crop image"
        className="fixed inset-x-4 top-16 z-50 mx-auto max-w-lg rounded-xl border border-border bg-white p-4 shadow-soft md:left-sidebar"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-brand">Crop image</h2>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {ASPECTS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                aspect === item.id
                  ? "btn-primary px-2 py-1 text-xs"
                  : "btn-secondary px-2 py-1 text-xs"
              }
              onClick={() => {
                setAspect(item.id);
                setCrop((current) => cropForRatio(item.ratio, current));
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          ref={frameRef}
          className="relative mx-auto max-h-80 overflow-hidden bg-slate-100"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={src}
            alt=""
            crossOrigin="anonymous"
            className="max-h-80 w-full object-contain"
            draggable={false}
          />
          <div
            className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(7,26,46,0.45)]"
            style={{
              left: `${crop.x}%`,
              top: `${crop.y}%`,
              width: `${crop.w}%`,
              height: `${crop.h}%`,
              cursor: "move",
            }}
            onPointerDown={(event) => onPointerDown(event, "move")}
          >
            <span
              className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-white"
              onPointerDown={(event) => {
                event.stopPropagation();
                onPointerDown(event, "resize");
              }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Drag the frame to move it. Drag the corner to resize. The original stays in the gallery.
        </p>
        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={apply}>
            Use crop
          </button>
        </div>
      </div>
    </>
  );
}
