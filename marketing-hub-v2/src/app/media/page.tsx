import type { Metadata } from "next";
import { MediaGallery } from "@/components/media/MediaGallery";
import { MediaPageChrome } from "@/components/media/MediaPageChrome";
import { hasMediaDownloadAccess } from "@/lib/auth/media-access";
import { getSessionUser } from "@/lib/auth/session";
import { getNewsroomSettings } from "@/lib/data/repos";

export const metadata: Metadata = {
  title: { absolute: "Media kit | Peters & May Newsroom" },
  description:
    "Logos, photography, presentations and brand guidelines from Peters & May for editorial use.",
};

export default async function PublicMediaPage() {
  const [canDownload, sessionUser, settings] = await Promise.all([
    hasMediaDownloadAccess(),
    getSessionUser().catch(() => null),
    getNewsroomSettings(),
  ]);
  const signedIn = Boolean(sessionUser);
  const isExternalGuest = sessionUser?.role === "media_guest";

  return (
    <MediaPageChrome
      settings={settings}
      canDownload={canDownload}
      signedIn={signedIn}
      userKey={sessionUser?.email || sessionUser?.full_name || ""}
      isExternalGuest={Boolean(isExternalGuest)}
    >
      <MediaGallery
        key={canDownload ? "download" : "view"}
        title="Image and logo library"
        description="Logos, presentations and photography. Sign in to download."
        showStaffChrome={false}
        initialCanDownload={canDownload}
        scope="public"
      />
    </MediaPageChrome>
  );
}
