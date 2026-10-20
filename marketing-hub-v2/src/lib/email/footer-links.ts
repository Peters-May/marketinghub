import type { EmailDesignStyles, FooterBlock } from "@/lib/email/design/types";

export type FooterLinkSettings = {
  showUnsubscribe: boolean;
  showPreferences: boolean;
  unsubscribeLabel: string;
  preferencesLabel: string;
};

export function resolveFooterLinkSettings(
  styles: EmailDesignStyles,
  block?: Pick<
    FooterBlock,
    "showPreferences" | "showUnsubscribe" | "unsubscribeLabel" | "preferencesLabel"
  > | null,
  /** Hub Email → Settings (source of truth when provided). */
  global?: FooterLinkSettings | null
): FooterLinkSettings {
  if (global) {
    return {
      showUnsubscribe: global.showUnsubscribe,
      showPreferences: global.showPreferences,
      unsubscribeLabel: global.unsubscribeLabel.trim() || "Unsubscribe",
      preferencesLabel: global.preferencesLabel.trim() || "Manage preferences",
    };
  }
  return {
    showUnsubscribe: styles.showUnsubscribeLink !== false,
    showPreferences: styles.showPreferencesLink !== false,
    unsubscribeLabel:
      (block?.unsubscribeLabel || styles.unsubscribeLabel || "Unsubscribe").trim() ||
      "Unsubscribe",
    preferencesLabel:
      (block?.preferencesLabel ||
        styles.preferencesLabel ||
        "Manage preferences"
      ).trim() || "Manage preferences",
  };
}

/** Plain parts for inspector / canvas preview (not sent HTML). */
export function footerLinkPreviewParts(settings: FooterLinkSettings): string[] {
  const parts: string[] = [];
  if (settings.showUnsubscribe) parts.push(settings.unsubscribeLabel);
  if (settings.showPreferences) parts.push(settings.preferencesLabel);
  return parts;
}
