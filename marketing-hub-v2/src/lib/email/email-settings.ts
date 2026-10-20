import type { EmailSettings } from "@/lib/types";
import type { FooterLinkSettings } from "@/lib/email/footer-links";

export const DEFAULT_EMAIL_SETTINGS: Omit<EmailSettings, "updated_at"> = {
  show_unsubscribe_link: true,
  show_preferences_link: true,
  unsubscribe_label: "Unsubscribe",
  preferences_label: "Manage preferences",
};

export function normalizeEmailSettings(
  input?: Partial<EmailSettings> | null
): EmailSettings {
  return {
    show_unsubscribe_link: input?.show_unsubscribe_link !== false,
    show_preferences_link: input?.show_preferences_link !== false,
    unsubscribe_label:
      String(input?.unsubscribe_label ?? DEFAULT_EMAIL_SETTINGS.unsubscribe_label)
        .trim()
        .slice(0, 80) || DEFAULT_EMAIL_SETTINGS.unsubscribe_label,
    preferences_label:
      String(input?.preferences_label ?? DEFAULT_EMAIL_SETTINGS.preferences_label)
        .trim()
        .slice(0, 80) || DEFAULT_EMAIL_SETTINGS.preferences_label,
    updated_at: input?.updated_at || new Date().toISOString(),
  };
}

export function footerLinksFromEmailSettings(
  settings: EmailSettings
): FooterLinkSettings {
  return {
    showUnsubscribe: settings.show_unsubscribe_link,
    showPreferences: settings.show_preferences_link,
    unsubscribeLabel: settings.unsubscribe_label,
    preferencesLabel: settings.preferences_label,
  };
}
