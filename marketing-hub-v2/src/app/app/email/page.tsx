import { EmailMarketingHub } from "@/components/email/EmailMarketingHub";
import {
  listContent,
  listEmailAudiences,
  listEmailCampaigns,
  listEmailTemplates,
  listMediaLists,
  listThemes,
  resolveEmailRecipients,
} from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export default async function EmailPage({
  searchParams,
}: {
  searchParams?: { campaign?: string };
}) {
  const [campaigns, templates, audiences, lists, themes, content] =
    await Promise.all([
      listEmailCampaigns(),
      listEmailTemplates(),
      listEmailAudiences(),
      listMediaLists(),
      listThemes(),
      listContent(),
    ]);

  const audiencesWithCounts = await Promise.all(
    audiences.map(async (a) => {
      const recipients = await resolveEmailRecipients({ audienceId: a.id });
      return { ...a, recipient_count: recipients.length };
    })
  );

  const marketingLists = lists.filter(
    (l) => l.list_kind === "marketing" || l.list_kind === "mixed"
  );

  const newsletters = content.filter(
    (c) =>
      (c.content_type ?? "").toLowerCase().includes("newsletter") ||
      (c.channel ?? []).some((ch) =>
        String(ch).toLowerCase().includes("newsletter")
      )
  );

  return (
    <EmailMarketingHub
      initialCampaigns={campaigns}
      initialTemplates={templates}
      initialAudiences={audiencesWithCounts}
      initialLists={marketingLists}
      initialThemes={themes}
      initialNewsletters={newsletters}
      initialCampaignId={searchParams?.campaign}
    />
  );
}
