import type { NewsroomSettings } from "@/lib/types";

export const NEWSROOM_TITLE_MAX = 150;
export const NEWSROOM_SEO_DESC_MAX = 150;

export const DEFAULT_NEWSROOM_SETTINGS: Omit<NewsroomSettings, "updated_at"> = {
  title: "Peters & May News",
  language: "en",
  homepage_greetings:
    "Welcome to our newsroom, the latest updates, stories and insights from Peters & May.",
  description:
    "Peters & May is a global specialist in bespoke logistics. This newsroom shares press releases, expert insights and media contacts for journalists.",
  seo_title:
    "Peters & May Newsroom | Global Yacht Transport, Freight Forwarding & Marine Logistics",
  seo_keywords:
    "Peters & May, yacht transport, boat shipping, marine logistics, freight forwarding",
  seo_description:
    "Latest news and insights from Peters & May, covering yacht transport, freight forwarding, commercial marine logistics and project cargo.",
  theme_color: "#007DC5",
  logo_url: "",
  background_url: "",
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
    background_url: String(input?.background_url ?? "").trim(),
    updated_at: input?.updated_at || new Date().toISOString(),
  };
}
