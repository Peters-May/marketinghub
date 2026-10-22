import { ContentSocialHub } from "@/components/content/ContentSocialHub";
import { getFieldOptionsMap } from "@/lib/data/data-admin";
import { listContent } from "@/lib/data/repos";
import { isSocialContentItem } from "@/lib/data/normalize";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const [user, content, fieldOptions] = await Promise.all([
    getSessionUser(),
    listContent(),
    getFieldOptionsMap("content"),
  ]);

  const initialContent =
    user?.role === "admin"
      ? content
      : content
          .filter(
            (c) =>
              isSocialContentItem(c) &&
              (c.status === "scheduled" || c.status === "published")
          )
          .map((c) => {
            const copy = { ...c };
            delete copy.share_token;
            return copy;
          });

  return (
    <ContentSocialHub
      initialContent={initialContent}
      fieldOptions={fieldOptions}
    />
  );
}
