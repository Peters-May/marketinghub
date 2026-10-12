"use client";

import { cn } from "@/lib/utils";

export type FileUploadProgress = {
  /** 1-based index of the file currently uploading. */
  current: number;
  total: number;
  name: string;
  /** 0–100 for the current file. */
  percent: number;
  loaded: number;
  size: number;
  phase: "upload" | "save";
};

export function overallUploadPercent(progress: FileUploadProgress) {
  if (progress.phase === "save") return 100;
  if (progress.total <= 0) return progress.percent;
  const completed = Math.max(0, progress.current - 1);
  return Math.min(
    100,
    Math.round(((completed + progress.percent / 100) / progress.total) * 100)
  );
}

export function formatTransferSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function UploadProgressBar({
  progress,
  className,
}: {
  progress: FileUploadProgress;
  className?: string;
}) {
  const overall = overallUploadPercent(progress);
  const label =
    progress.phase === "save"
      ? progress.total > 1
        ? `Saving ${progress.total} assets`
        : "Saving"
      : progress.total > 1
        ? `Uploading ${progress.current} of ${progress.total}`
        : "Uploading";
  const detail =
    progress.phase === "save"
      ? "Finishing save"
      : `${progress.name} · ${formatTransferSize(progress.loaded)} of ${formatTransferSize(progress.size)}`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <p className="min-w-0 truncate font-medium text-brand">{label}</p>
        <span className="shrink-0 tabular-nums text-muted">{overall}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-sand"
        role="progressbar"
        aria-valuenow={overall}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-150 ease-out"
          style={{ width: `${overall}%` }}
        />
      </div>
      <p className="truncate text-[11px] text-muted">{detail}</p>
    </div>
  );
}
