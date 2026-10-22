export function enquiryRoutingGap(enquiry: {
  status: string;
  selected_office?: string | null;
  needs_manual_review?: boolean;
}): "needs review" | "no office" | null {
  if (enquiry.status === "done") return null;
  if (enquiry.needs_manual_review) return "needs review";
  if (!(enquiry.selected_office ?? "").trim()) return "no office";
  return null;
}
