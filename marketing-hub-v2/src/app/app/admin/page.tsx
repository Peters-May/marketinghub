import { Database, KeyRound, Users, Wallet } from "lucide-react";
import { ModuleCard, PageHeader } from "@/components/ui/PageHeader";
import { getAiKeyPublicStatus } from "@/lib/ai/ai-key";

function aiKeyDescription(days: number | null, expiresOn: string): string {
  if (!expiresOn || days === null) {
    return "OpenAI key for the assistant. Set the 90-day expiry so the hub can remind you.";
  }
  if (days < 0) return "The OpenAI key has expired. Replace it.";
  if (days === 0) return "The OpenAI key expires today. Replace it.";
  return `OpenAI key for the assistant. ${days} day${days === 1 ? "" : "s"} until it expires.`;
}

export default async function AdminPage() {
  const ai = await getAiKeyPublicStatus();

  return (
    <div>
      <PageHeader
        title="Admin"
        description="Manage hub users, the AI key, and raw data tables."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ModuleCard
          href="/app/admin/users"
          title="Users"
          description="See who’s on Supabase — Admin, Member, or External — and invite people."
          icon={Users}
        />
        <ModuleCard
          href="/app/admin/ai"
          title="AI key"
          description={aiKeyDescription(ai.days_remaining, ai.expires_on)}
          icon={KeyRound}
        />
        <ModuleCard
          href="/app/admin/data"
          title="Data tables"
          description="Spreadsheet view of events, content, contacts, and other collections."
          icon={Database}
        />
        <ModuleCard
          href="/app/budget"
          title="Budget"
          description="2026 marketing budget — admins, plus Simon, Tom, and Michael."
          icon={Wallet}
        />
      </div>
    </div>
  );
}
