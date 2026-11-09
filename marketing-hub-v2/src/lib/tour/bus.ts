/** Lightweight bus so tour steps can prepare in-page UI (tabs, selection). */

export const TOUR_PREPARE_EVENT = "mh-hub-tour-prepare";

export type TourPrepareAction =
  | { type: "click"; selector: string }
  | { type: "events-list-view" }
  | { type: "events-select-first" }
  | { type: "media-root" }
  | { type: "media-open"; category: string }
  | { type: "requests-tab"; tab: "asset" | "social_form" | "other" }
  | { type: "requests-open-order-form" };

export function dispatchTourPrepare(actions: TourPrepareAction | TourPrepareAction[]) {
  if (typeof window === "undefined") return;
  const list = Array.isArray(actions) ? actions : [actions];
  for (const action of list) {
    if (action.type === "click") {
      const el = document.querySelector(action.selector) as HTMLElement | null;
      el?.click();
      continue;
    }
    window.dispatchEvent(
      new CustomEvent<TourPrepareAction>(TOUR_PREPARE_EVENT, { detail: action })
    );
  }
}

export function onTourPrepare(
  handler: (action: TourPrepareAction) => void
): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<TourPrepareAction>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(TOUR_PREPARE_EVENT, listener);
  return () => window.removeEventListener(TOUR_PREPARE_EVENT, listener);
}

export function mediaCategoryTourId(name: string) {
  return `media-category-${name.trim().toLowerCase().replace(/\s+/g, "-")}`;
}
