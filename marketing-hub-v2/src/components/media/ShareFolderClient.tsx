"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Lock,
  X,
} from "lucide-react";
import { downloadMediaFile } from "@/lib/media/download-file";
import {
  classifySharePresentation,
  type ShareAction,
  type ShareHeroImage,
} from "@/lib/media/share-presentation";
import type { MediaListItem } from "@/lib/supabase/media-list";
import { cn } from "@/lib/utils";

type ShareResponse = {
  folderName?: string;
  shareKind?: "item" | "folder";
  canDownload?: boolean;
  needsSignIn?: boolean;
  loginPath?: string;
  items?: MediaListItem[];
  error?: string;
};

export function ShareFolderClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("Shared folder");
  const [singleFile, setSingleFile] = useState(false);
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [loginPath, setLoginPath] = useState("/login");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/media/share/${encodeURIComponent(token)}`);
        const json = (await res.json()) as ShareResponse;
        if (!res.ok) {
          throw new Error(json.error || "This share link is unavailable.");
        }
        if (cancelled) return;
        setSingleFile(json.shareKind === "item");
        setFolderName(
          json.folderName ||
            (json.shareKind === "item" ? "Shared file" : "Shared folder")
        );
        setItems(json.items || []);
        setNeedsSignIn(json.needsSignIn === true);
        setLoginPath(json.loginPath || "/login");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load folder");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const presentation = useMemo(
    () => classifySharePresentation(items),
    [items]
  );
  const { files, links, heroImages, galleryImages } = presentation;
  const actions: ShareAction[] = useMemo(
    () => [...files, ...links],
    [files, links]
  );
  const hero = heroImages[0] ?? null;
  const lightboxPhoto =
    lightboxIndex != null ? galleryImages[lightboxIndex] ?? null : null;
  const isEmpty =
    files.length === 0 &&
    links.length === 0 &&
    heroImages.length === 0 &&
    galleryImages.length === 0;

  async function handleDownload(file: {
    id: string;
    url: string;
    name: string;
  }) {
    if (downloadingId) return;
    setDownloadingId(file.id);
    try {
      await downloadMediaFile(file.url, file.name, { shareToken: token });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  useEffect(() => {
    if (lightboxIndex == null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxIndex(null);
      if (event.key === "ArrowLeft") {
        setLightboxIndex((current) =>
          current == null || current <= 0 ? current : current - 1
        );
      }
      if (event.key === "ArrowRight") {
        setLightboxIndex((current) => {
          if (current == null) return current;
          return current >= galleryImages.length - 1 ? current : current + 1;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, galleryImages.length]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-foreground">
      {hero ? (
        <div className="relative isolate overflow-hidden border-b border-border bg-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand via-brand/70 to-brand/30" />
          <div className="relative mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
              Peters &amp; May
            </p>
            <h1 className="mt-2 max-w-3xl font-display text-3xl text-white md:text-5xl">
              {folderName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80">
              {singleFile
                ? "Choose how you want to open or download this asset."
                : "Download files or open links from this shared folder."}
            </p>
          </div>
        </div>
      ) : (
        <header className="border-b border-border bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 md:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                Peters &amp; May
              </p>
              <h1 className="mt-1 font-display text-3xl text-brand md:text-4xl">
                {folderName}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {singleFile
                  ? "This link is for this file only. Public files are open. Internal files need a staff sign-in."
                  : "Public files are open. Internal files need a staff sign-in."}
              </p>
            </div>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {loading ? (
          <p className="text-sm text-muted">
            {singleFile ? "Loading file…" : "Loading shared folder…"}
          </p>
        ) : error ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <h2 className="font-display text-2xl text-brand">Link unavailable</h2>
            <p className="mt-2 text-sm text-muted">{error}</p>
          </div>
        ) : isEmpty && needsSignIn ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <Lock className="mx-auto h-5 w-5 text-brand" />
            <h2 className="mt-3 font-display text-2xl text-brand">
              Sign in to see internal files
            </h2>
            <p className="mt-2 text-sm text-muted">
              This link includes internal files. Staff need to sign in before
              those files appear.
            </p>
            <Link
              href={loginPath}
              className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
            >
              Sign in
            </Link>
          </div>
        ) : isEmpty ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <h2 className="font-display text-2xl text-brand">Nothing here yet</h2>
            <p className="mt-2 text-sm text-muted">
              {singleFile
                ? "This file is not available on this link."
                : "This shared folder does not contain any downloadable files."}
            </p>
          </div>
        ) : (
          <>
            {needsSignIn ? (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 py-3">
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <Lock className="h-4 w-4 text-brand" />
                  Internal files on this link need a staff sign-in.
                </p>
                <Link
                  href={loginPath}
                  className="inline-flex rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white"
                >
                  Sign in
                </Link>
              </div>
            ) : null}

            {actions.length > 0 ? (
              <section className="mb-8">
                <p className="mb-3 text-sm text-muted">
                  {actions.length} option{actions.length === 1 ? "" : "s"}
                </p>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white">
                  {actions.map((action) => (
                    <li
                      key={action.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        {action.kind === "link" ? (
                          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                        ) : (
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {action.itemName}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {action.name}
                          </p>
                        </div>
                      </div>
                      {action.kind === "link" ? (
                        <a
                          href={action.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-sand/60"
                        >
                          Open
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-sand/60 disabled:opacity-60"
                          disabled={downloadingId === action.id}
                          onClick={() => void handleDownload(action)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          {downloadingId === action.id ? "…" : "Download"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {galleryImages.length > 0 ? (
              <>
                <p className="mb-4 text-sm text-muted">
                  {galleryImages.length} image
                  {galleryImages.length === 1 ? "" : "s"} · click to view or
                  download
                </p>
                <div className="columns-2 gap-2 sm:columns-3 lg:columns-4 lg:gap-3">
                  {galleryImages.map((photo, index) => (
                    <GalleryTile
                      key={photo.id}
                      photo={photo}
                      downloading={downloadingId === photo.id}
                      onOpen={() => setLightboxIndex(index)}
                      onDownload={() => void handleDownload(photo)}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </main>

      {lightboxPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {lightboxIndex != null && lightboxIndex > 0 ? (
            <button
              type="button"
              className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 md:left-6"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex - 1);
              }}
              aria-label="Previous"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}
          {lightboxIndex != null &&
          lightboxIndex < galleryImages.length - 1 ? (
            <button
              type="button"
              className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 md:right-6"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex + 1);
              }}
              aria-label="Next"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}
          <div
            className={cn("relative max-h-[85vh] max-w-5xl")}
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.itemName || lightboxPhoto.name}
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
            />
            <div className="mt-3 flex items-center justify-between gap-3 text-white">
              <p className="truncate text-sm">
                {lightboxPhoto.itemName || lightboxPhoto.name}
              </p>
              <button
                type="button"
                disabled={downloadingId === lightboxPhoto.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-brand disabled:opacity-60"
                onClick={() => void handleDownload(lightboxPhoto)}
              >
                <Download className="h-4 w-4" />
                {downloadingId === lightboxPhoto.id
                  ? "Downloading…"
                  : "Download"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GalleryTile({
  photo,
  downloading,
  onOpen,
  onDownload,
}: {
  photo: ShareHeroImage;
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="group relative mb-2 break-inside-avoid overflow-hidden rounded-lg bg-[#f0f2f3] lg:mb-3">
      <button type="button" className="block w-full text-left" onClick={onOpen}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.itemName || photo.name}
          className="w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
      </button>
      <button
        type="button"
        className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-black/70 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-60"
        disabled={downloading}
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
      >
        <Download className="h-3 w-3" />
        {downloading ? "…" : "Download"}
      </button>
    </div>
  );
}
