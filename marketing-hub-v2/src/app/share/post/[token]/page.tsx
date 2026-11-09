import type { Metadata } from "next";
import { SharePostClient } from "@/components/social/SharePostClient";
import { getPublicPostByShareToken } from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Share for approval",
  robots: { index: false, follow: false },
};

type Props = { params: { token: string } };

export default async function SharedPostPage({ params }: Props) {
  const token = params.token || "";
  const preview = await getPublicPostByShareToken(token);
  return <SharePostClient preview={preview} token={token} />;
}
