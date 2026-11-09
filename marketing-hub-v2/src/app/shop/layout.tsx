import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Corporate clothing | Peters & May",
  description:
    "Browse Peters & May corporate clothing and submit a request to Marketing.",
};

/** Public standalone shop — no hub sidebar. */
export default function PublicShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
