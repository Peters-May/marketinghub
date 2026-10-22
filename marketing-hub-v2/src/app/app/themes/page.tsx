import { ThemesClient } from "@/components/themes/ThemesClient";
import { getFieldOptionsMap } from "@/lib/data/data-admin";
import {
  listContent,
  listThemeMains,
  listThemeOffshoots,
  listThemes,
} from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const [themes, mains, offshoots, content, contentFieldOptions] =
    await Promise.all([
      listThemes(),
      listThemeMains(),
      listThemeOffshoots(),
      listContent(),
      getFieldOptionsMap("content"),
    ]);
  return (
    <ThemesClient
      initialThemes={themes}
      initialMains={mains}
      initialOffshoots={offshoots}
      initialContent={content}
      contentFieldOptions={contentFieldOptions}
    />
  );
}
