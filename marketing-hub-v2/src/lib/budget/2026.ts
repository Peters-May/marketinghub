import type {
  BudgetLine,
  BudgetMeta,
  BudgetPayment,
  BudgetPaymentStatus,
  BudgetQuarter,
} from "@/lib/types";
import {
  createP10BudgetPayments,
  hasLegacyP6BudgetPayments,
  stripLegacyP6BudgetPayments,
} from "@/lib/budget/p10-2026";

export type BudgetAmount = number | null;

export type BudgetChild = {
  name: string;
  amount: BudgetAmount;
  note?: string;
};

export type DraftBudgetLine = {
  id: string;
  name: string;
  code: string;
  marketing: BudgetAmount;
  sponsorship: BudgetAmount;
  travel: BudgetAmount;
  total: number;
  priorYear: BudgetAmount;
  variance: BudgetAmount;
  notes: string;
  children?: BudgetChild[];
};

export type BudgetNote = {
  title: string;
  body: string;
};

type DraftQuarterLine = {
  name: string;
  code: string;
  section?: boolean;
  marketing?: BudgetAmount;
  total?: BudgetAmount;
};

type DraftQuarter = {
  id: "Q1" | "Q2" | "Q3" | "Q4";
  title: string;
  lines: DraftQuarterLine[];
};

export type MarketingBudget = {
  year: number;
  title: string;
  source: string;
  currency: "GBP";
  committedTotal: number;
  uncommittedTotal: number;
  committedPriorYearTotal: number;
  uncommittedPriorYearTotal: number;
  grandTotal: number;
  priorYearTotal: number;
  variance: number;
  committed: DraftBudgetLine[];
  uncommitted: DraftBudgetLine[];
  notes: BudgetNote[];
  extraEvents: {
    name: string;
    when: string;
    detail: string;
    people: string;
    cap: string;
  }[];
  quarters: DraftQuarter[];
};

const QUARTER_TEMPLATE: DraftQuarterLine[] = [
  { name: "Committed", code: "", section: true },
  { name: "ARC World Cruising", code: "MS1" },
  { name: "Antigua Sailing Week", code: "MS2" },
  { name: "SEO & PPC and Website Hosting & Maintenance (Uppcy)", code: "MP2" },
  { name: "Google Performance max campaigns", code: "MP3" },
  { name: "Press Services", code: "" },
  { name: "Video / Photography", code: "" },
  { name: "Google Ad Spend", code: "MP3" },
  { name: "Memberships", code: "MM" },
  { name: "Boat Show Attendance", code: "", section: true },
  { name: "Sales Trips Offices", code: "", section: true },
  { name: "USA", code: "MTX" },
  { name: "UK", code: "" },
  { name: "Italy", code: "" },
  { name: "France", code: "" },
  { name: "Netherlands", code: "" },
  { name: "Germany", code: "" },
  { name: "HQ", code: "" },
  { name: "Dubai", code: "" },
  { name: "Spain", code: "" },
  { name: "Asia", code: "" },
  { name: "Commercial Travel", code: "" },
  { name: "Commercial Shipyard Visits", code: "" },
  { name: "Racing", code: "" },
  { name: "FF & CEC Paul!", code: "" },
  { name: "Targeted Marketing", code: "", section: true },
  { name: "Marine", code: "MTG" },
  { name: "Racing", code: "" },
  { name: "Commercial", code: "" },
  { name: "Freight Forwarding & CEC", code: "" },
  { name: "Group", code: "" },
  { name: "Merchandise & Clothing", code: "", section: true },
  { name: "Merchandise", code: "MC" },
  { name: "Clothing", code: "" },
  { name: "Branded Stationery, Brochures", code: "" },
  { name: "Event Reserve", code: "", section: true },
  { name: "Group Event Winter 2026", code: "ME", marketing: 6000, total: 6000 },
];

function quarter(
  id: DraftQuarter["id"],
  inserts: Record<string, DraftQuarterLine[]> = {}
): DraftQuarter {
  const lines: DraftQuarterLine[] = [];
  for (const line of QUARTER_TEMPLATE) {
    lines.push(line);
    const extra = inserts[line.name];
    if (extra) lines.push(...extra);
  }
  return {
    id,
    title: `Budget Quarter ${id.slice(1)}`,
    lines,
  };
}

export const BUDGET_2026: MarketingBudget = {
  year: 2026,
  title: "Marketing Budget 2026",
  source: "Budget draft 2026.xlsx",
  currency: "GBP",
  committedTotal: 178076,
  uncommittedTotal: 151400,
  committedPriorYearTotal: 191478,
  uncommittedPriorYearTotal: 79000,
  grandTotal: 329476,
  priorYearTotal: 270478,
  variance: -58998,
  committed: [
    {
      id: "ms1",
      name: "ARC World Cruising",
      code: "MS1",
      marketing: 1800,
      sponsorship: 4000,
      travel: 5500,
      total: 11300,
      priorYear: 11300,
      variance: 0,
      notes:
        "Plus £1k credit on airfreight / FF sector. ARC+ Sundowner drinks included now, additional travel (contract includes ARC sundowner up to EUR 500. It was EUR 750 in 2025 for ARC Sundowner and in addition for ARC+ Sundowner).",
    },
    {
      id: "ms2",
      name: "Antigua Sailing Week",
      code: "MS2",
      marketing: null,
      sponsorship: null,
      travel: null,
      total: 0,
      priorYear: 23000,
      variance: 23000,
      notes: "Remove for 2026",
    },
    {
      id: "mp2",
      name: "SEO & PPC, web hosting + maintenance",
      code: "MP2",
      marketing: 19680,
      sponsorship: null,
      travel: null,
      total: 19680,
      priorYear: 19680,
      variance: 0,
      notes: "Uppcy Ltd £1,390 pm + website costs (plugins etc) approx. £250 a month",
    },
    {
      id: "nyyc",
      name: "NYYC RA",
      code: "",
      marketing: null,
      sponsorship: null,
      travel: null,
      total: 0,
      priorYear: 16100,
      variance: 16100,
      notes: "Not continued in 2026",
    },
    {
      id: "class31",
      name: "Class 31",
      code: "",
      marketing: null,
      sponsorship: null,
      travel: null,
      total: 0,
      priorYear: 8950,
      variance: 8950,
      notes: "Not continued in 2026",
    },
    {
      id: "saltwater",
      name: "Retainer Saltwater",
      code: "",
      marketing: null,
      sponsorship: null,
      travel: null,
      total: 0,
      priorYear: 49176,
      variance: 49176,
      notes: "Not continued in 2026",
    },
    {
      id: "press",
      name: "Press Service",
      code: "",
      marketing: 7500,
      sponsorship: null,
      travel: null,
      total: 7500,
      priorYear: null,
      variance: -7500,
      notes: "Prowly £299 a month. Distribution of our own press releases.",
    },
    {
      id: "video",
      name: "Video / Photography",
      code: "",
      marketing: 14400,
      sponsorship: null,
      travel: null,
      total: 14400,
      priorYear: null,
      variance: -14400,
      notes: "Drone filming £1,200 a month (maritime filming retainer).",
      children: [
        {
          name: "Drone filming £1,200 a month",
          amount: 14400,
        },
      ],
    },
    {
      id: "google-ads",
      name: "Google Ad Spend",
      code: "MP3",
      marketing: 84000,
      sponsorship: null,
      travel: null,
      total: 84000,
      priorYear: 42000,
      variance: -42000,
      notes: "Double Google ad spend",
    },
    {
      id: "pmax",
      name: "Google Performance Max campaigns",
      code: "",
      marketing: 12000,
      sponsorship: null,
      travel: null,
      total: 12000,
      priorYear: null,
      variance: -12000,
      notes: "",
    },
    {
      id: "memberships",
      name: "Memberships",
      code: "MM",
      marketing: null,
      sponsorship: 9196,
      travel: 20000,
      total: 29196,
      priorYear: 21272,
      variance: -7924,
      notes: "T&E covers membership-related travel. Named association fees below are part of this line.",
      children: [
        {
          name: "Port Everglades Association USD 1800",
          amount: 1600,
        },
        {
          name: "Marine Industries Associations USD 525",
          amount: 450,
        },
        {
          name: "Young Professionals in Yachting USD 150 pp",
          amount: 350,
        },
      ],
    },
  ],
  uncommitted: [
    {
      id: "mbx",
      name: "Boat Show Attendance",
      code: "MBX",
      marketing: 5000,
      sponsorship: 0,
      travel: 53860,
      total: 58860,
      priorYear: 40000,
      variance: -18860,
      notes: "",
      children: [
        { name: "Düsseldorf", amount: 7000 },
        { name: "Cannes", amount: 7000 },
        { name: "Miami", amount: 860 },
        { name: "FLIBS", amount: 2000 },
        { name: "Genoa", amount: 600 },
        { name: "Monaco", amount: 1000 },
        { name: "METS", amount: 1000 },
        { name: "La Rochelle", amount: 500 },
        { name: "Annapolis", amount: 3000 },
        { name: "West Palm Beach", amount: 2000 },
        { name: "Palma", amount: 1000 },
        { name: "Poland", amount: 1000 },
        {
          name: "Various Scandinavian",
          amount: 1000,
          note: "£750 Stockholm + Copenhagen",
        },
        {
          name: "Singapore boat show 23–26 (Darren, Ai Xing, Luke, agent's dinner)",
          amount: 6000,
        },
        { name: "Thailand Phuket January USD 800", amount: 600 },
        {
          name: "Shanghai China 29.03–01.04 USD 200",
          amount: 200,
        },
        {
          name: "Asia Pacific Superyacht Summit, Kobe, Japan 7–8 May 2026",
          amount: 2500,
        },
        { name: "Hong Kong December USD 800", amount: 600 },
        { name: "APM commercial Singapore", amount: 500 },
        { name: "Seawork — Charles, June", amount: 1000 },
        { name: "BBK Singapore", amount: 500 },
        { name: "Sanctuary Cove — Charles / Luke", amount: 4000 },
        { name: "Office local show attendance", amount: 2000 },
        { name: "Commercial Wind Energy HH", amount: 2000 },
        { name: "Commercial Interferry", amount: 4000 },
        { name: "Europort", amount: 2000 },
      ],
    },
    {
      id: "mtx",
      name: "Sales Trips Offices",
      code: "MTX",
      marketing: 0,
      sponsorship: 0,
      travel: 28500,
      total: 28500,
      priorYear: null,
      variance: -28500,
      notes: "",
      children: [
        { name: "USA", amount: 2500 },
        { name: "UK", amount: 1000 },
        { name: "Italy", amount: 1000 },
        { name: "France", amount: 1000 },
        { name: "Netherlands", amount: 1000 },
        { name: "Germany", amount: 1000 },
        { name: "HQ", amount: 2000 },
        { name: "Dubai", amount: 1000 },
        { name: "Spain", amount: 1000 },
        { name: "Asia", amount: 2000 },
        { name: "Commercial Travel", amount: 10000 },
        { name: "Commercial Shipyard Visits", amount: 2000 },
        { name: "Racing", amount: 3000 },
      ],
    },
    {
      id: "mtg",
      name: "Targeted Marketing",
      code: "MTG",
      marketing: 19040,
      sponsorship: 0,
      travel: 5000,
      total: 24040,
      priorYear: 10000,
      variance: -14040,
      notes: "",
      children: [
        {
          name: "Nautique Dealer Meeting Sponsorship US USD 2000",
          amount: 1800,
        },
        { name: "Oceanskies P&M Cannes Drinks Event", amount: 500 },
        { name: "Seahorse Ad £290 a month", amount: 3480 },
        { name: "Social Media Campaigns", amount: 600 },
        { name: "Yachtworld Ad or similar", amount: 1500 },
        {
          name: "HubSpot (replacing Campaign Monitor & Zoho) £90 a month / per user",
          amount: 2160,
        },
        {
          name: "Marine — seminars, displays, digital ads, event attendance, editorials",
          amount: 5000,
        },
        {
          name: "Racing — race attendance, goodie bags, champagne",
          amount: 2000,
        },
        { name: "Commercial — PR, marketing, brochures", amount: 2000 },
      ],
    },
    {
      id: "mc",
      name: "Merchandise & Clothing",
      code: "MC",
      marketing: 16000,
      sponsorship: 0,
      travel: 0,
      total: 16000,
      priorYear: 5000,
      variance: -11000,
      notes: "",
      children: [
        {
          name: "Merchandise: snoods, biscuits, diaries, keytags",
          amount: 6000,
        },
        {
          name: "Clothing: for sales staff — polo shirts, formal shirts, jackets, rucksacks",
          amount: 5000,
        },
        {
          name: "Branded stationery: name tags, business cards, brochures, leaflets",
          amount: 5000,
        },
      ],
    },
    {
      id: "me",
      name: "Event Reserve",
      code: "ME",
      marketing: 24000,
      sponsorship: 0,
      travel: 0,
      total: 24000,
      priorYear: 24000,
      variance: 0,
      notes: "Fixed £6,000 per quarter for Group Event Winter 2026",
    },
  ],
  notes: [
    {
      title: "Google Ads",
      body: "Double the budget — double the leads. Recommendation: double the monthly budget and use any remainder for LinkedIn, social media, and Performance Max campaigns (pop-up ads on other websites). Google Ads and digital presence is trial and error.",
    },
    {
      title: "Drone filming",
      body: "£1,200 a month for drone filming (maritime filming retainer). £14,400 for the year, under Video / Photography.",
    },
    {
      title: "Yachtworld Ad",
      body: "Sophie looking into where the clicks came from and possibly a digital ad there.",
    },
    {
      title: "HubSpot",
      body: "Replace Campaign Monitor and Zoho (online chat) with HubSpot.",
    },
    {
      title: "Posters",
      body: "Posters for marina offices and yacht clubs. Posters for guides, less salesy.",
    },
    {
      title: "AI / SEO",
      body: "We cannot control AI, but we need to ensure the website has question-based answers and more guides so AI finds us via SEO. German language page update.",
    },
    {
      title: "Saltwater editorials",
      body: "Any editorials / content Saltwater arranged did not provide clicks or conversions. Not measurable — simply brand awareness.",
    },
    {
      title: "E-shots",
      body: "E-shots increasing conversions.",
    },
    {
      title: "Yacht sponsorship",
      body: "Sponsor a yacht (Volvo)? Craig said not possible — GAC is official logistics supplier of The Ocean Race so they will not allow another sponsor like us.",
    },
    {
      title: "Ideas",
      body: "Webinars? Partner with someone? Add local sales trip for Italy (MC). Crew kit.",
    },
  ],
  extraEvents: [
    {
      name: "St. Petersburg, FL",
      when: "15–18 Jan 2026",
      detail:
        "Local FL market engagement. Connect with regional / local brokers and dealers. Strengthen our presence in West Florida.",
      people:
        "Atlas Yacht Sales, Bavaria, Black Label Marine Group, Coastal Marine, Clearwater Marine, East Marine Boats, Edgewater Yacht Sales",
      cap: "Max USD 1,500. Chris trying to reduce it by shortening the trip and driving.",
    },
    {
      name: "Antigua",
      when: "February",
      detail: "Racing team / Steve sales trip Antigua after RORC.",
      people: "Teams, flying P&M flag.",
      cap: "",
    },
  ],
  quarters: [
    quarter("Q1", {
      "Boat Show Attendance": [
        { name: "Düsseldorf", code: "MB1" },
        { name: "Miami", code: "MB6" },
        { name: "West Palm Beach", code: "MB8" },
        { name: "Singapore", code: "MB8" },
        { name: "Other Reserve", code: "MB8" },
      ],
    }),
    quarter("Q2"),
    quarter("Q3"),
    quarter("Q4"),
  ],
};

function toStoredLine(
  line: DraftBudgetLine,
  group: BudgetLine["group"],
  sortOrder: number,
  now: string
): BudgetLine {
  return {
    id: `bln_${line.id}`,
    name: line.name,
    code: line.code,
    group,
    planned: line.total,
    marketing: line.marketing,
    sponsorship: line.sponsorship,
    travel: line.travel,
    prior_year: line.priorYear,
    notes: line.notes,
    sort_order: sortOrder,
    children: (line.children ?? []).map((child) => ({
      name: child.name,
      amount: child.amount,
      note: child.note,
    })),
    created_at: now,
    updated_at: now,
  };
}

export function createDefaultBudgetLines(): BudgetLine[] {
  const now = new Date().toISOString();
  return [
    ...BUDGET_2026.committed.map((line, index) =>
      toStoredLine(line, "committed", index, now)
    ),
    ...BUDGET_2026.uncommitted.map((line, index) =>
      toStoredLine(line, "uncommitted", 100 + index, now)
    ),
  ];
}

export function createDefaultBudgetMeta(): BudgetMeta {
  return {
    year: BUDGET_2026.year,
    title: BUDGET_2026.title,
    source: BUDGET_2026.source,
    currency: BUDGET_2026.currency,
    notes: BUDGET_2026.notes,
    extra_events: BUDGET_2026.extraEvents,
    quarters: BUDGET_2026.quarters as BudgetQuarter[],
  };
}

export const GOOGLE_ADS_LINE_ID = "bln_google-ads";

type GoogleAdsStatementMonth = {
  id: string;
  paid_at: string;
  netCost: number;
  payments: number;
  status: BudgetPaymentStatus;
  description: string;
};

/** Google Ads billing statement — amount posted is monthly net cost (ad spend). */
const GOOGLE_ADS_2026_STATEMENTS: GoogleAdsStatementMonth[] = [
  {
    id: "pay_google_ads_2026_01",
    paid_at: "2026-01-31",
    netCost: 3087.51,
    payments: 3385.93,
    status: "paid",
    description: "January 2026 statement. Net cost £3,087.51. Payments £3,385.93.",
  },
  {
    id: "pay_google_ads_2026_02",
    paid_at: "2026-02-28",
    netCost: 3109.12,
    payments: 3087.51,
    status: "paid",
    description: "February 2026 statement. Net cost £3,109.12. Payments £3,087.51.",
  },
  {
    id: "pay_google_ads_2026_03",
    paid_at: "2026-03-31",
    netCost: 3147.19,
    payments: 3109.12,
    status: "paid",
    description: "March 2026 statement. Net cost £3,147.19. Payments £3,109.12.",
  },
  {
    id: "pay_google_ads_2026_04",
    paid_at: "2026-04-30",
    netCost: 3168.91,
    payments: 3147.19,
    status: "paid",
    description: "April 2026 statement. Net cost £3,168.91. Payments £3,147.19.",
  },
  {
    id: "pay_google_ads_2026_05",
    paid_at: "2026-05-31",
    netCost: 4145.06,
    payments: 4168.91,
    status: "paid",
    description: "May 2026 statement. Net cost £4,145.06. Payments £4,168.91.",
  },
  {
    id: "pay_google_ads_2026_06",
    paid_at: "2026-06-30",
    netCost: 4292.27,
    payments: 4145.06,
    status: "paid",
    description: "June 2026 statement. Net cost £4,292.27. Payments £4,145.06.",
  },
  {
    id: "pay_google_ads_2026_07",
    paid_at: "2026-07-31",
    netCost: 4417.06,
    payments: 4292.27,
    status: "paid",
    description: "July 2026 statement. Net cost £4,417.06. Payments £4,292.27.",
  },
  {
    id: "pay_google_ads_2026_08",
    paid_at: "2026-08-20",
    netCost: 2725.98,
    payments: 2917.06,
    status: "pending",
    description:
      "August 2026 snapshot — figures are not updated in real time. Balance from July £417.06 + net cost £2,725.98 − payments £2,917.06 = current balance £225.98.",
  },
];

export function resolveGoogleAdsLineId(lines: BudgetLine[]): string {
  return (
    lines.find((line) => line.id === GOOGLE_ADS_LINE_ID)?.id ??
    lines.find(
      (line) =>
        line.code === "MP3" && /google ad spend/i.test(line.name)
    )?.id ??
    lines.find((line) => /google ad spend/i.test(line.name))?.id ??
    GOOGLE_ADS_LINE_ID
  );
}

export const PRESS_LINE_ID = "bln_press";

const PRESS_SERVICE_2026_INVOICES = [
  {
    id: "pay_press_vat_508910283",
    paid_at: "2026-05-29",
    invoice: "VAT/508910283",
    amount: 299,
  },
  {
    id: "pay_press_vat_523893873",
    paid_at: "2026-06-29",
    invoice: "VAT/523893873",
    amount: 299,
  },
  {
    id: "pay_press_vat_541849987",
    paid_at: "2026-08-03",
    invoice: "VAT/541849987",
    amount: 299,
  },
] as const;

export function resolvePressLineId(lines: BudgetLine[]): string {
  return (
    lines.find((line) => line.id === PRESS_LINE_ID)?.id ??
    lines.find((line) => /^press service$/i.test(line.name))?.id ??
    PRESS_LINE_ID
  );
}

function createGoogleAdsPayments(
  lines: BudgetLine[],
  now: string
): BudgetPayment[] {
  const lineId = resolveGoogleAdsLineId(lines);
  return GOOGLE_ADS_2026_STATEMENTS.map((month) => ({
    id: month.id,
    budget_line_id: lineId,
    paid_at: month.paid_at,
    supplier: "Google Ads",
    description: month.description,
    amount: month.netCost,
    status: month.status,
    invoice_url: "",
    created_by: "Google Ads statement",
    created_by_user_id: null,
    created_at: now,
    updated_at: now,
  }));
}

function createPressServicePayments(
  lines: BudgetLine[],
  now: string
): BudgetPayment[] {
  const lineId = resolvePressLineId(lines);
  return PRESS_SERVICE_2026_INVOICES.map((invoice) => ({
    id: invoice.id,
    budget_line_id: lineId,
    paid_at: invoice.paid_at,
    supplier: "Prowly",
    description: `Press Service invoice ${invoice.invoice}. Charge £299.00.`,
    amount: invoice.amount,
    status: "paid" as const,
    invoice_url: "",
    created_by: "Prowly billing history",
    created_by_user_id: null,
    created_at: now,
    updated_at: now,
  }));
}

export function createDefaultBudgetPayments(
  lines: BudgetLine[] = createDefaultBudgetLines(),
  now = new Date().toISOString()
): BudgetPayment[] {
  return [
    ...createGoogleAdsPayments(lines, now),
    ...createPressServicePayments(lines, now),
    ...createP10BudgetPayments(lines, now),
  ];
}

/** Add seeded payments that are not already in the store. Replaces legacy P6 rows with P10. */
export function mergeDefaultBudgetPayments(
  payments: BudgetPayment[],
  lines: BudgetLine[]
): BudgetPayment[] {
  const cleaned = stripLegacyP6BudgetPayments(payments);
  const seeded = createDefaultBudgetPayments(lines);
  const existingIds = new Set(cleaned.map((payment) => payment.id));
  const missing = seeded.filter((payment) => !existingIds.has(payment.id));
  if (missing.length === 0) return cleaned;
  return [...cleaned, ...missing];
}

export function needsDefaultBudgetPaymentMigration(
  payments: BudgetPayment[] | undefined
): boolean {
  const list = payments ?? [];
  if (hasLegacyP6BudgetPayments(list)) return true;
  const ids = new Set(list.map((payment) => payment.id));
  return createDefaultBudgetPayments().some((payment) => !ids.has(payment.id));
}

export const VIDEO_LINE_ID = "bln_video";
export const DRONE_FILMING_MONTHLY = 1200;
export const DRONE_FILMING_ANNUAL = 14400;
const DRONE_FILMING_NOTE =
  "Drone filming £1,200 a month (maritime filming retainer).";
const DRONE_FILMING_CHILD = {
  name: "Drone filming £1,200 a month",
  amount: DRONE_FILMING_ANNUAL,
};

function isVideoPhotographyLine(line: BudgetLine) {
  return line.id === VIDEO_LINE_ID || /^video \/ photography$/i.test(line.name);
}

function hasDroneFilming(line: BudgetLine) {
  return (
    /drone filming/i.test(line.notes) ||
    (line.children ?? []).some((child) => /drone filming/i.test(child.name))
  );
}

export function applyDroneFilmingBudget(lines: BudgetLine[]): BudgetLine[] {
  const now = new Date().toISOString();
  const idx = lines.findIndex(isVideoPhotographyLine);

  if (idx === -1) {
    const video = createDefaultBudgetLines().find(isVideoPhotographyLine);
    return video ? [...lines, video] : lines;
  }

  const line = lines[idx];
  const alreadyNoted = hasDroneFilming(line);
  const childOk = (line.children ?? []).some((child) =>
    /drone filming/i.test(child.name)
  );
  const amountOk =
    line.planned === DRONE_FILMING_ANNUAL &&
    line.marketing === DRONE_FILMING_ANNUAL;
  if (alreadyNoted && childOk && amountOk) return lines;

  const next = [...lines];
  next[idx] = {
    ...line,
    planned: DRONE_FILMING_ANNUAL,
    marketing: DRONE_FILMING_ANNUAL,
    notes: alreadyNoted
      ? line.notes
      : line.notes.trim()
        ? `${line.notes.trim()} ${DRONE_FILMING_NOTE}`
        : DRONE_FILMING_NOTE,
    children: childOk
      ? line.children
      : [...(line.children ?? []), DRONE_FILMING_CHILD],
    updated_at: now,
  };
  return next;
}

export function applyDroneFilmingMeta(meta: BudgetMeta): BudgetMeta {
  if (meta.notes.some((note) => /drone filming/i.test(note.title))) return meta;
  const droneNote = BUDGET_2026.notes.find((note) => note.title === "Drone filming");
  if (!droneNote) return meta;
  const notes = [...meta.notes];
  const googleIdx = notes.findIndex((note) => note.title === "Google Ads");
  if (googleIdx >= 0) notes.splice(googleIdx + 1, 0, droneNote);
  else notes.unshift(droneNote);
  return { ...meta, notes };
}

export function needsDroneFilmingBudgetMigration(
  lines: BudgetLine[] | undefined,
  meta?: BudgetMeta | null
): boolean {
  const line = (lines ?? []).find(isVideoPhotographyLine);
  if (!line) return true;
  if (line.planned !== DRONE_FILMING_ANNUAL) return true;
  if (!hasDroneFilming(line)) return true;
  if (meta && !meta.notes.some((note) => /drone filming/i.test(note.title))) {
    return true;
  }
  return false;
}
