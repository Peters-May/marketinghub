import { applyEmailMerge, type MergeOptions } from "@/lib/email/merge";
import type { Contact } from "@/lib/types";

const SAMPLE_CONTACT: Contact = {
  id: "preview",
  kind: "person",
  name: "Alex Example",
  organisation: "Example Yacht Co",
  role: "",
  email: "alex@example.com",
  phone: "",
  website: "",
  services: "",
  tags: [],
  notes: "",
  user_id: null,
  is_press: false,
  beat: "",
  outlet: "",
  country: "United Kingdom",
  preferred_topics: "",
  last_contacted_at: null,
  marketing_consent: true,
  created_at: "",
  updated_at: "",
};

export function previewMerge(
  template: string,
  opts?: MergeOptions & {
    unsubscribeUrl?: string;
    preferencesUrl?: string;
    viewInBrowserUrl?: string;
  }
): string {
  return applyEmailMerge(
    template,
    {
      contact: SAMPLE_CONTACT,
      unsubscribeUrl:
        opts?.unsubscribeUrl ??
        "https://example.com/unsubscribe?view=unsubscribe",
      preferencesUrl:
        opts?.preferencesUrl ??
        "https://example.com/unsubscribe?view=preferences",
      viewInBrowserUrl:
        opts?.viewInBrowserUrl ?? "https://example.com/email/view",
    },
    opts
  );
}
