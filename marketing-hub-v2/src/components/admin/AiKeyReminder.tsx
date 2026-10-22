import Link from "next/link";
import type { AiKeyPublicStatus } from "@/lib/ai/ai-key-status";

function formatUkDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AiKeyReminder({ status }: { status: AiKeyPublicStatus }) {
  if (
    status.status !== "soon" &&
    status.status !== "urgent" &&
    status.status !== "expired"
  ) {
    return null;
  }

  const when = status.expires_on ? formatUkDate(status.expires_on) : "";
  const text =
    status.status === "expired"
      ? `The OpenAI API key ${status.days_remaining !== null && status.days_remaining < 0 ? `expired on ${when}` : "expires today"}. Replace it in Admin.`
      : `The OpenAI API key expires on ${when}. ${status.days_remaining} day${status.days_remaining === 1 ? "" : "s"} left.`;

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p>{text}</p>
      <Link href="/app/admin/ai" className="mt-1 inline-block font-medium text-brand">
        Update AI key
      </Link>
    </div>
  );
}
