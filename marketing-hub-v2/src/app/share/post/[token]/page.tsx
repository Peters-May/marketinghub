import type { Metadata } from "next";
import { SharePostClient } from "@/components/social/SharePostClient";
import { getPublicPostByShareToken } from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Social preview",
  robots: { index: false, follow: false },
};

type Props = { params: { token: string } };

export default async function SharedPostPage({ params }: Props) {
  const preview = await getPublicPostByShareToken(params.token || "");
  return <SharePostClient preview={preview} />;
}
