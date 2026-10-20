import { notFound, redirect } from "next/navigation";
import { EmailDesigner } from "@/components/email/builder/EmailDesigner";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { canDeleteUnsentDraft } from "@/lib/email/display";
import { getEmailCampaign, getEmailTemplate, listEmailAudiences } from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export default async function EmailDesignPage({
  params,
}: {
  params: { kind: string; id: string };
}) {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }

  const { kind, id } = params;
  if (kind !== "template" && kind !== "campaign") notFound();

  if (kind === "template") {
    const template = await getEmailTemplate(id);
    if (!template) notFound();
    return (
      <EmailDesigner
        kind="template"
        id={template.id}
        readOnly={false}
        backHref="/app/email?tab=templates"
        initialName={template.name}
        initialSubject={template.subject_default}
        initialPreview={template.preview_text_default}
        initialDesign={template.design}
        initialHtml={template.html_body}
      />
    );
  }

  const [campaign, audiences] = await Promise.all([
    getEmailCampaign(id),
    listEmailAudiences(),
  ]);
  if (!campaign) notFound();
  if (campaign.status === "sent" || campaign.status === "sending") {
    redirect(`/app/email/campaign/${encodeURIComponent(campaign.id)}`);
  }
  return (
    <EmailDesigner
      kind="campaign"
      id={campaign.id}
      readOnly={false}
      backHref="/app/email"
      initialName={campaign.title}
      initialSubject={campaign.subject}
      initialPreview={campaign.preview_text}
      initialDesign={campaign.design}
      initialHtml={campaign.html_body}
      audiences={audiences.map((audience) => ({
        id: audience.id,
        name: audience.name,
      }))}
      initialFromName={campaign.from_name}
      initialFromEmail={campaign.from_email}
      initialAudienceId={campaign.audience_id ?? ""}
      initialExcludeAudienceId={campaign.exclude_audience_id ?? ""}
      initialBrief={campaign.brief ?? ""}
      canDelete={canDeleteUnsentDraft(campaign)}
    />
  );
}
