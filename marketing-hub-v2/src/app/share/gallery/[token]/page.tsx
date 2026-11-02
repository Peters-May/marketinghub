import type { Metadata } from "next";
import { ShareFolderClient } from "@/components/media/ShareFolderClient";

export const metadata: Metadata = {
  title: "Shared folder",
  robots: { index: false, follow: false },
};

type Props = { params: { token: string } };

export default function SharedGalleryPage({ params }: Props) {
  return <ShareFolderClient token={params.token} />;
}
