import type { TourAudience } from "@/lib/tour/storage";
import type { TourPrepareAction } from "@/lib/tour/bus";

export type TourStep = {
  id: string;
  /** CSS selector — prefer [data-tour="…"] */
  selector: string;
  title: string;
  body: string;
  /** Navigate here before highlighting (optional). */
  href?: string;
  /** Prefer desktop sidebar target; falls back to mobile. */
  placement?: "auto" | "right" | "left" | "top" | "bottom";
  /** Switch tabs / select records before highlighting. */
  prepare?: TourPrepareAction[];
};

const WELCOME_SIDEBAR: TourStep = {
  id: "sidebar",
  selector: '[data-tour="sidebar"]',
  title: "Welcome to Marketing Hub",
  body: "Use the left menu to move around. We’ll walk through the main areas — each step opens the real page.",
  href: "/app",
  placement: "right",
};

const ACCOUNT_STEP: TourStep = {
  id: "account",
  selector: '[data-tour="account-menu"]',
  title: "Your account",
  body: "Open this menu for My details (your contact card) and Sign out. You can replay this tour from here anytime.",
  placement: "right",
};

/** Shared deep-dives used by member + admin tours */
const EVENTS_DEEP: TourStep[] = [
  {
    id: "events-nav",
    selector: '[data-tour="nav-events"]',
    title: "Events",
    body: "Shows, meetings, and ceremonies. Next we’ll look at adding events and marking attendance.",
    href: "/app/events",
    placement: "right",
  },
  {
    id: "events-add",
    selector: '[data-tour="events-add"]',
    title: "Add an event",
    body: "Use Add event for anything you’re organising or want on the team calendar.",
    href: "/app/events",
    placement: "bottom",
  },
  {
    id: "events-calendar",
    selector: '[data-tour="events-calendar"]',
    title: "Browse events",
    body: "Switch between calendar and list. Click any event to open its details on the right.",
    href: "/app/events",
    placement: "left",
    prepare: [{ type: "events-list-view" }],
  },
  {
    id: "events-attendance",
    selector:
      '[data-tour="events-attendance"], [data-tour="events-detail"]',
    title: "Your attendance",
    body: "Open an event, then mark Attending, Maybe, Not attending, or Interested so others know who’s going.",
    href: "/app/events",
    placement: "left",
    prepare: [{ type: "events-select-first" }],
  },
  {
    id: "events-attending-list",
    selector:
      '[data-tour="events-attending-list"], [data-tour="events-detail"]',
    title: "Who’s attending",
    body: "See who else has marked Attending for this event.",
    href: "/app/events",
    placement: "left",
    prepare: [{ type: "events-select-first" }],
  },
];

const LIBRARY_DEEP: TourStep[] = [
  {
    id: "library-nav",
    selector: '[data-tour="nav-library"]',
    title: "Library",
    body: "Brand assets live here. We’ll flick through Logos, Images, and Presentations.",
    href: "/app/library",
    placement: "right",
  },
  {
    id: "library-categories",
    selector: '[data-tour="media-categories"]',
    title: "Media categories",
    body: "Pick a category card to browse that folder. Start with Logos, Images, or Presentations.",
    href: "/app/library",
    placement: "top",
    prepare: [
      { type: "click", selector: '[data-tour="library-tab-media"]' },
      { type: "media-root" },
    ],
  },
  {
    id: "library-logos",
    selector: '[data-tour="media-category-logos"]',
    title: "Logos",
    body: "Official logos and lockups — open this folder when you need brand marks.",
    href: "/app/library",
    placement: "top",
    prepare: [
      { type: "click", selector: '[data-tour="library-tab-media"]' },
      { type: "media-root" },
    ],
  },
  {
    id: "library-images",
    selector:
      '[data-tour="media-category-images"], [data-tour="media-category-gallery"]',
    title: "Images & Gallery",
    body: "Photo and image assets — open Images or Gallery. Headshots live in Gallery → Headshots.",
    href: "/app/library",
    placement: "top",
    prepare: [{ type: "media-root" }],
  },
  {
    id: "library-presentations",
    selector: '[data-tour="media-category-presentations"]',
    title: "Presentations",
    body: "Slide decks and presentation files ready to download.",
    href: "/app/library",
    placement: "top",
    prepare: [
      { type: "media-root" },
    ],
  },
  {
    id: "library-open-logos",
    selector: '[data-tour="media-back"]',
    title: "Inside a folder",
    body: "Open a category to browse files. Use ← All categories to jump back to the grid.",
    href: "/app/library",
    placement: "bottom",
    prepare: [{ type: "media-open", category: "Logos" }],
  },
];

const REQUESTS_DEEP: TourStep[] = [
  {
    id: "requests-nav",
    selector: '[data-tour="nav-requests"]',
    title: "Requests",
    body: "Clothes, assets, and social forms. Next — Corporate clothing, where you order kit.",
    href: "/app/requests",
    placement: "right",
  },
  {
    id: "requests-clothing-tab",
    selector: '[data-tour="requests-tab-merch"]',
    title: "Corporate clothing",
    body: "This tab is where you order North Sails clothing and track your requests.",
    href: "/app/requests",
    placement: "bottom",
    prepare: [{ type: "requests-tab", tab: "merch" }],
  },
  {
    id: "requests-new-order",
    selector: '[data-tour="requests-new-order"]',
    title: "New order",
    body: "Click New order to request polo shirts, gilets, jackets, and more.",
    href: "/app/requests",
    placement: "bottom",
    prepare: [{ type: "requests-tab", tab: "merch" }],
  },
  {
    id: "requests-order-form",
    selector: '[data-tour="requests-order-form"]',
    title: "Order form",
    body: "Pick products, size, fit, and who it’s for, then submit. Your orders appear in the list below.",
    href: "/app/requests",
    placement: "top",
    prepare: [
      { type: "requests-tab", tab: "merch" },
      { type: "requests-open-order-form" },
    ],
  },
];

export const MEMBER_TOUR_STEPS: TourStep[] = [
  WELCOME_SIDEBAR,
  {
    id: "home",
    selector: '[data-tour="nav-home"]',
    title: "Home",
    body: "Your overview — shortcuts into the areas you use day to day.",
    href: "/app",
    placement: "right",
  },
  ...EVENTS_DEEP,
  {
    id: "content",
    selector: '[data-tour="nav-content"]',
    title: "Content & Social",
    body: "The social calendar — what’s scheduled and what’s already published.",
    href: "/app/content",
    placement: "right",
  },
  {
    id: "partners",
    selector: '[data-tour="nav-partners"]',
    title: "Partners",
    body: "Sponsorships and industry memberships. Members can add and manage their memberships.",
    href: "/app/partners",
    placement: "right",
  },
  {
    id: "awards",
    selector: '[data-tour="nav-awards"]',
    title: "Awards",
    body: "Track awards you’re watching, entering, shortlisted for, or have won.",
    href: "/app/awards",
    placement: "right",
  },
  ...LIBRARY_DEEP,
  ...REQUESTS_DEEP,
  {
    id: "enquiries",
    selector: '[data-tour="nav-enquiries"]',
    title: "Enquiries",
    body: "Website quote form and WhatsApp tracker — use the Web and WhatsApp tabs.",
    href: "/app/enquiries",
    placement: "right",
  },
  ACCOUNT_STEP,
];

export const ADMIN_TOUR_STEPS: TourStep[] = [
  WELCOME_SIDEBAR,
  {
    id: "view-toggle",
    selector: '[data-tour="view-toggle"]',
    title: "View modes",
    body: "Switch between Admin, Member, and External to preview what each audience sees. Your real access stays Admin.",
    href: "/app",
    placement: "right",
  },
  {
    id: "home",
    selector: '[data-tour="nav-home"]',
    title: "Home",
    body: "Hub overview for the marketing team.",
    href: "/app",
    placement: "right",
  },
  ...EVENTS_DEEP,
  {
    id: "content",
    selector: '[data-tour="nav-content"]',
    title: "Content & Social",
    body: "Full content pipeline and social calendar — more detail than Member view.",
    href: "/app/content",
    placement: "right",
  },
  {
    id: "tasks",
    selector: '[data-tour="nav-tasks"]',
    title: "Tasks",
    body: "Marketing to-dos with owners, deadlines, and status — Admin only.",
    href: "/app/tasks",
    placement: "right",
  },
  {
    id: "partners",
    selector: '[data-tour="nav-partners"]',
    title: "Partners",
    body: "Sponsorships and memberships. Admins can manage everything here.",
    href: "/app/partners",
    placement: "right",
  },
  {
    id: "awards",
    selector: '[data-tour="nav-awards"]',
    title: "Awards",
    body: "Industry awards tracking across the pipeline.",
    href: "/app/awards",
    placement: "right",
  },
  ...LIBRARY_DEEP,
  {
    id: "themes",
    selector: '[data-tour="nav-themes"]',
    title: "Themes",
    body: "Quarterly themes → main pieces → offshoots. Admin planning view.",
    href: "/app/themes",
    placement: "right",
  },
  ...REQUESTS_DEEP,
  {
    id: "enquiries",
    selector: '[data-tour="nav-enquiries"]',
    title: "Enquiries",
    body: "Website quote form and WhatsApp tracker — use the Web and WhatsApp tabs.",
    href: "/app/enquiries",
    placement: "right",
  },
  {
    id: "reports",
    selector: '[data-tour="nav-reports"]',
    title: "Reporting",
    body: "Analytics, ads, SEO, Looker Studio links, and print advertisements — Admin only.",
    href: "/app/reports",
    placement: "right",
  },
  {
    id: "budget",
    selector: '[data-tour="nav-budget"]',
    title: "Budget",
    body: "2026 marketing budget — visible to Hub admins, plus Simon, Tom, and Michael.",
    href: "/app/budget",
    placement: "right",
  },
  {
    id: "contacts",
    selector: '[data-tour="nav-contacts"]',
    title: "Contacts",
    body: "People, press, and supplier companies (printers, clothing, and similar) in one place.",
    href: "/app/contacts",
    placement: "right",
  },
  {
    id: "logins",
    selector: '[data-tour="nav-logins"]',
    title: "Logins",
    body: "Shared marketing platform credentials — Admin only. Treat this as an internal vault.",
    href: "/app/logins",
    placement: "right",
  },
  {
    id: "admin",
    selector: '[data-tour="nav-admin"]',
    title: "Admin",
    body: "Invite users, set Admin / Member / External roles, and manage data tables.",
    href: "/app/admin",
    placement: "right",
  },
  ACCOUNT_STEP,
];

export const EXTERNAL_TOUR_STEPS: TourStep[] = [
  {
    id: "media-header",
    selector: '[data-tour="media-header"]',
    title: "Media gallery",
    body: "Browse logos, presentations, and gallery images. You can view freely — downloads need a signed-in guest account.",
    href: "/media",
    placement: "bottom",
  },
  {
    id: "media-categories",
    selector: '[data-tour="media-categories"]',
    title: "Categories",
    body: "Open Logos, Presentations, or Gallery to find the assets you need.",
    href: "/media",
    placement: "top",
    prepare: [{ type: "media-root" }],
  },
  {
    id: "media-logos",
    selector: '[data-tour="media-category-logos"]',
    title: "Logos",
    body: "Brand logos and lockups — click to open the folder.",
    href: "/media",
    placement: "top",
    prepare: [{ type: "media-root" }],
  },
  {
    id: "media-presentations",
    selector: '[data-tour="media-category-presentations"]',
    title: "Presentations",
    body: "Slide decks and presentation files.",
    href: "/media",
    placement: "top",
    prepare: [{ type: "media-root" }],
  },
  {
    id: "media-download",
    selector: '[data-tour="media-auth"]',
    title: "Downloads",
    body: "Use Sign in to download when you’re ready to save files. Staff use Staff login for the full Marketing Hub.",
    href: "/media",
    placement: "bottom",
  },
];

const SEO_TOUR_STEPS: TourStep[] = [
  {
    id: "seo-enquiries-nav",
    selector: '[data-tour="nav-enquiries"]',
    title: "Enquiries",
    body: "This is your Hub view — web and WhatsApp enquiries, with source and campaign attribution.",
    href: "/app/enquiries",
    placement: "right",
  },
  {
    id: "seo-enquiries-list",
    selector: '[data-tour="enquiries-tab-list"], [data-tour="enquiries-tab-web"]',
    title: "Filter and export",
    body: "Search, filter by source, and export CSV. Open a row for the full enquiry.",
    href: "/app/enquiries",
    placement: "bottom",
  },
];

export function tourStepsFor(audience: TourAudience): TourStep[] {
  if (audience === "admin") return ADMIN_TOUR_STEPS;
  if (audience === "external") return EXTERNAL_TOUR_STEPS;
  if (audience === "seo") return SEO_TOUR_STEPS;
  return MEMBER_TOUR_STEPS;
}

export function tourWelcomeCopy(audience: TourAudience): {
  title: string;
  body: string;
} {
  if (audience === "admin") {
    return {
      title: "Quick admin tour",
      body: "A walkthrough of Admin tools plus key pages — Events attendance, Library folders, and clothing orders.",
    };
  }
  if (audience === "external") {
    return {
      title: "Welcome to the media gallery",
      body: "A quick look at Logos, Presentations, and downloads. You can skip anytime.",
    };
  }
  if (audience === "seo") {
    return {
      title: "Enquiries access",
      body: "You can view web and WhatsApp enquiries, including where they came from. Other Hub areas stay with the marketing team.",
    };
  }
  return {
    title: "Welcome to Marketing Hub",
    body: "We’ll open each area and show useful bits — adding events, Library folders, and ordering clothes.",
  };
}
