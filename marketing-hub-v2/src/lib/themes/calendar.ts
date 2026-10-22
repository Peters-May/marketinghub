import type { QuarterlyTheme, ThemeStatus } from "@/lib/types";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

export type ThemeQuarter = (typeof QUARTERS)[number];

/** Calendar quarter in UK time, so a late-December evening does not roll early. */
export function quarterForDate(date: Date): ThemeQuarter {
  const month = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      month: "numeric",
    }).format(date)
  );
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

export function yearForDate(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
    }).format(date)
  );
}

function quarterIndex(quarter: string): number {
  const index = QUARTERS.indexOf(quarter as ThemeQuarter);
  return index === -1 ? -1 : index;
}

/** Previous, active, or upcoming from the theme's quarter and year. */
export function statusForThemeQuarter(
  theme: { quarter: string; year: number },
  date = new Date()
): ThemeStatus {
  const year = yearForDate(date);
  const current = quarterIndex(quarterForDate(date));
  const themeQuarter = quarterIndex(theme.quarter);
  if (theme.year < year || (theme.year === year && themeQuarter < current)) {
    return "previous";
  }
  if (theme.year === year && themeQuarter === current) return "active";
  return "upcoming";
}

export function applyCalendarThemeStatuses<
  T extends { quarter: string; year: number; status: ThemeStatus },
>(themes: T[], date = new Date()): T[] {
  return themes.map((theme) => {
    const status = statusForThemeQuarter(theme, date);
    return theme.status === status ? theme : { ...theme, status };
  });
}

/** Theme for the current quarter, then any row still marked active. */
export function pickCurrentTheme<
  T extends Pick<QuarterlyTheme, "quarter" | "year" | "status">,
>(themes: T[], date = new Date()): T | null {
  const quarter = quarterForDate(date);
  const year = yearForDate(date);
  return (
    themes.find((theme) => theme.quarter === quarter && theme.year === year) ??
    themes.find((theme) => theme.status === "active") ??
    themes[0] ??
    null
  );
}
