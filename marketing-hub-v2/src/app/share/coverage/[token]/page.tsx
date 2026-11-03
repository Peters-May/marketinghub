import type { Metadata } from "next";
import { CoverageBookView } from "@/components/pr/CoverageBookView";
import { getPublicCoverageReportByShareToken } from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Coverage report",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> | { token: string } };

export default async function SharedCoverageReportPage({ params }: Props) {
  const resolved = await Promise.resolve(params);
  const report = await getPublicCoverageReportByShareToken(
    resolved.token || ""
  );

  if (!report) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-[#0B2545]">
        <h1 className="font-display text-2xl">Coverage report unavailable</h1>
        <p className="mt-3 text-sm text-[#1B3A5B]/80">
          This coverage book is not available. The link may be off or incorrect.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#E3E6E9]/40 print:bg-white">
      <CoverageBookView report={report} />
    </main>
  );
}
