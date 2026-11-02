import { NextRequest, NextResponse } from "next/server";
import { hasMediaDownloadAccess } from "@/lib/auth/media-access";
import { isStaffSession } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { rateLimitPublic } from "@/lib/security/rate-limit";
import {
  gallerySharePath,
  listMediaByShareToken,
  type MediaListItem,
  type ShareViewer,
} from "@/lib/supabase/media-list";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAllowedRemoteUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function safeFilename(raw: string): string {
  const cleaned = raw.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim();
  return cleaned.slice(0, 180) || "download";
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii.replace(/"/g, "")}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: NextRequest) {
  const limited = rateLimitPublic(request, "media-download", 60);
  if (!limited.ok) return limited.response;

  const url = request.nextUrl.searchParams.get("url")?.trim() || "";
  const filename = safeFilename(
    request.nextUrl.searchParams.get("filename") || "download"
  );
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";

  if (!url || !isAllowedRemoteUrl(url)) {
    return NextResponse.json({ error: "Invalid file URL" }, { status: 400 });
  }

  if (token) {
    try {
      const user = await getSessionUser();
      const viewer: ShareViewer = {
        staff: isStaffSession(user?.role),
        admin: user?.role === "admin",
      };
      const shared = await listMediaByShareToken(token, viewer);
      if (!shared) {
        return NextResponse.json(
          { error: "This share link is invalid or has been turned off." },
          { status: 404 }
        );
      }
      const fileOnShare = (items: MediaListItem[]) =>
        items.some((item) => item.files.some((file) => file.url === url));
      if (!fileOnShare(shared.items)) {
        const full = await listMediaByShareToken(token, {
          staff: true,
          admin: true,
        });
        if (!full || !fileOnShare(full.items)) {
          return NextResponse.json(
            { error: "File is not part of this shared folder." },
            { status: 403 }
          );
        }
        if (!viewer.staff) {
          return NextResponse.json(
            {
              error: "Sign in required to download this file",
              loginUrl: `/login?next=${encodeURIComponent(gallerySharePath(token))}`,
            },
            { status: 401 }
          );
        }
        return NextResponse.json(
          { error: "This file is not available on this link." },
          { status: 403 }
        );
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Share lookup failed" },
        { status: 500 }
      );
    }
  } else {
    const allowed = await hasMediaDownloadAccess();
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Sign in required to download",
          loginUrl: "/login?intent=media&next=/media",
        },
        { status: 401 }
      );
    }
  }

  try {
    const upstream = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "*/*" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Could not fetch file (${upstream.status})` },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await upstream.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "private, max-age=60",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Download failed" },
      { status: 500 }
    );
  }
}
