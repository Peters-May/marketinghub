import { ContentSocialHub } from "@/components/content/ContentSocialHub";
import { getFieldOptionsMap } from "@/lib/data/data-admin";
import {
  listContent,
  listEventContentLinks,
  listEvents,
  listThemes,
} from "@/lib/data/repos";
import { isSocialContentItem } from "@/lib/data/normalize";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const user = await getSessionUser();
  const isAdmin = user?.role === "admin";
  const [content, fieldOptions, themes, events, eventContentLinks] =
    await Promise.all([
      listContent(),
      getFieldOptionsMap("content"),
      isAdmin ? listThemes() : Promise.resolve([]),
      isAdmin ? listEvents() : Promise.resolve([]),
      isAdmin ? listEventContentLinks() : Promise.resolve([]),
    ]);

  const initialContent = isAdmin
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
      themes={themes.map((theme) => ({ id: theme.id, title: theme.title }))}
      events={events.map((event) => ({ id: event.id, title: event.title }))}
      eventContentLinks={eventContentLinks}
    />
  );
}
