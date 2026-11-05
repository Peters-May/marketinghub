import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShareFolderClient } from "@/components/media/ShareFolderClient";
import { isStaffSession } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import {
  classifySharePresentation,
  mediaDownloadPath,
  shouldDirectDownloadShare,
  shouldDirectOpenShareLink,
  type SharePresentation,
} from "@/lib/media/share-presentation";
import { listMediaByShareToken } from "@/lib/supabase/media-list";

export const metadata: Metadata = {
  title: "Shared folder",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { params: { token: string } };

export default async function SharedGalleryPage({ params }: Props) {
  const token = params.token || "";
  let presentation: SharePresentation | null = null;

  try {
    const user = await getSessionUser();
    const result = await listMediaByShareToken(token, {
      staff: isStaffSession(user?.role),
      admin: user?.role === "admin",
    });
    if (result) {
      presentation = classifySharePresentation(result.items);
    }
  } catch {
    presentation = null;
  }

  if (presentation) {
    const directFile = shouldDirectDownloadShare(presentation);
    if (directFile) {
      redirect(
        mediaDownloadPath({
          url: directFile.url,
          filename: directFile.name,
          token,
        })
      );
    }
    const directLink = shouldDirectOpenShareLink(presentation);
    if (directLink) {
      redirect(directLink.url);
    }
  }

  return <ShareFolderClient token={token} />;
}
