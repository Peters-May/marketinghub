import { redirect } from "next/navigation";
import { AiKeyClient } from "@/components/admin/AiKeyClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAiKeyPublicStatus } from "@/lib/ai/ai-key";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminAiKeyPage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }

  const status = await getAiKeyPublicStatus();

  return (
    <div>
      <PageHeader
        title="AI key"
        description="OpenAI key for the hub assistant, email drafts, and website chat. Update it here when OpenAI issues a new one."
      />
      <AiKeyClient initial={status} />
    </div>
  );
}
