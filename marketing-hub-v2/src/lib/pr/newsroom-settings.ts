import type { NewsroomSettings } from "@/lib/types";

export const NEWSROOM_TITLE_MAX = 150;
export const NEWSROOM_SEO_DESC_MAX = 150;

export const DEFAULT_NEWSROOM_SETTINGS: Omit<NewsroomSettings, "updated_at"> = {
  title: "Peters & May News",
  language: "en",
  homepage_greetings:
    "Welcome to our newsroom, the latest updates, stories and insights from Peters & May.",
  description:
    "Peters & May is a global specialist in bespoke logistics, providing yacht transport, freight forwarding, commercial marine transport and project cargo solutions by sea, road and air. Our newsroom shares the latest company updates, press releases, case studies, expert insights and media resources from across the Peters & May Group. For more information about our services, visit our main website: www.petersandmay.com",
  seo_title:
    "Peters & May Newsroom | Global Yacht Transport, Freight Forwarding & Marine Logistics",
  seo_keywords:
    "Peters & May, yacht transport, boat shipping, marine logistics, freight forwarding, global logistics, commercial marine transport, superyacht transport, customs clearance, project cargo, international shipping",
  seo_description:
    "Latest news and insights from Peters & May, covering yacht transport, freight forwarding, commercial marine logistics and project cargo.",
  theme_color: "#007DC5",
  logo_url: "",
  favicon_url: "",
  background_url: "",
  release_library_version: 0,
};

export function normalizeNewsroomSettings(
  input?: Partial<NewsroomSettings> | null
): NewsroomSettings {
  const title = String(input?.title ?? DEFAULT_NEWSROOM_SETTINGS.title)
    .trim()
    .slice(0, NEWSROOM_TITLE_MAX);
  return {
    title: title || DEFAULT_NEWSROOM_SETTINGS.title,
    language: input?.language === "pl" ? "pl" : "en",
    homepage_greetings: String(
      input?.homepage_greetings ?? DEFAULT_NEWSROOM_SETTINGS.homepage_greetings
    ),
    description: String(
      input?.description ?? DEFAULT_NEWSROOM_SETTINGS.description
    ),
    seo_title: String(input?.seo_title ?? DEFAULT_NEWSROOM_SETTINGS.seo_title),
    seo_keywords: String(
      input?.seo_keywords ?? DEFAULT_NEWSROOM_SETTINGS.seo_keywords
    ),
    seo_description: String(
      input?.seo_description ?? DEFAULT_NEWSROOM_SETTINGS.seo_description
    ).slice(0, NEWSROOM_SEO_DESC_MAX),
    theme_color:
      String(input?.theme_color ?? DEFAULT_NEWSROOM_SETTINGS.theme_color).trim() ||
      DEFAULT_NEWSROOM_SETTINGS.theme_color,
    logo_url: String(input?.logo_url ?? "").trim(),
    favicon_url: String(input?.favicon_url ?? "").trim(),
    background_url: String(input?.background_url ?? "").trim(),
    release_library_version: Math.max(
      0,
      Number(input?.release_library_version) || 0
    ),
    updated_at: input?.updated_at || new Date().toISOString(),
  };
}
