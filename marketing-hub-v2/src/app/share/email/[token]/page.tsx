import type { Metadata } from "next";
import { ShareEmailClient } from "@/components/email/ShareEmailClient";
import { getPublicEmailByShareToken } from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Share for approval",
  robots: { index: false, follow: false },
};

type Props = { params: { token: string } };

export default async function SharedEmailPage({ params }: Props) {
  const token = params.token || "";
  const draft = await getPublicEmailByShareToken(token);
  return <ShareEmailClient draft={draft} token={token} />;
}
