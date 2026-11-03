import { redirect } from "next/navigation";
import { AssistantReviewsClient } from "@/components/admin/AssistantReviewsClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { listAssistantReviews } from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export default async function AdminAssistantReviewsPage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }

  const reviews = await listAssistantReviews();

  return (
    <div>
      <PageHeader
        title="Assistant review"
        description="Recent hub assistant asks, command outcomes, and thumbs feedback — use these to tighten prompts and commands."
      />
      <AssistantReviewsClient initial={reviews} />
    </div>
  );
}
