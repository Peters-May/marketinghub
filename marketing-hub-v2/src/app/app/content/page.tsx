import { ContentSocialHub } from "@/components/content/ContentSocialHub";
import { getFieldOptionsMap } from "@/lib/data/data-admin";
import {
  listContent,
  listEventContentLinks,
  listEvents,
  listThemes,
} from "@/lib/data/repos";
import { getSessionUser } from "@/lib/auth/session";
import { contentVisibleToMember } from "@/lib/social/suggest";

export const dynamic = "force-dynamic";

export default async function ContentPage({
  searchParams,
}: {
  searchParams?: { open?: string };
}) {
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
    : contentVisibleToMember(content, user?.id ?? "");

  return (
    <ContentSocialHub
      viewerId={user?.id ?? null}
      initialOpenId={searchParams?.open ?? null}
      initialContent={initialContent}
      fieldOptions={fieldOptions}
      themes={themes.map((theme) => ({ id: theme.id, title: theme.title }))}
      events={events.map((event) => ({ id: event.id, title: event.title }))}
      eventContentLinks={eventContentLinks}
    />
  );
}
