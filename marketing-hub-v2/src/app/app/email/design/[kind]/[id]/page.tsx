import { notFound, redirect } from "next/navigation";
import { EmailDesigner } from "@/components/email/builder/EmailDesigner";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { isStaffSession } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { emailCampaignHome } from "@/lib/email/category";
import { canDeleteUnsentDraft } from "@/lib/email/display";
import { getEmailCampaign, getEmailTemplate, listEmailAudiences } from "@/lib/data/repos";
import { emailSharePath } from "@/lib/email/share";

export const dynamic = "force-dynamic";

export default async function EmailDesignPage({
  params,
}: {
  params: { kind: string; id: string };
}) {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || !isStaffSession(user.role)) {
    redirect("/app");
  }
  if (user.role !== "admin") {
    redirect("/app/email");
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
        initialShareEnabled={template.share_enabled === true}
        initialSharePath={
          template.share_enabled
            ? emailSharePath(template.share_token ?? "")
            : ""
        }
        initialClientShareEnabled={template.client_share_enabled === true}
        initialClientSharePath={
          template.client_share_enabled
            ? emailSharePath(template.client_share_token ?? "")
            : ""
        }
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
      backHref={emailCampaignHome(campaign)}
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
      initialShareEnabled={campaign.share_enabled === true}
      initialSharePath={
        campaign.share_enabled ? emailSharePath(campaign.share_token ?? "") : ""
      }
      initialClientShareEnabled={campaign.client_share_enabled === true}
      initialClientSharePath={
        campaign.client_share_enabled
          ? emailSharePath(campaign.client_share_token ?? "")
          : ""
      }
    />
  );
}
