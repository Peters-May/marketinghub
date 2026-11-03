import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  addItemsToPrCoverageReport,
  createPrCoverageReport,
  deletePrCoverageReport,
  listPrCoverageReports,
  refreshPrCoverageReportItem,
  removeItemFromPrCoverageReport,
  reorderPrCoverageReportItems,
  setPrCoverageReportShare,
  updatePrCoverageReport,
  updatePrCoverageReportItem,
} from "@/lib/data/repos";
import {
  coverageReportSharePath,
  normalizePrCoverageReportItem,
} from "@/lib/pr/coverage-report";
import type { PrCoverageReportItem } from "@/lib/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return jsonOk({ reports: await listPrCoverageReports() });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "delete") {
    await deletePrCoverageReport(String(body.id ?? ""));
    return jsonOk({ ok: true });
  }

  if (action === "update") {
    const updated = await updatePrCoverageReport(
      String(body.id ?? ""),
      (body.patch ?? {}) as Parameters<typeof updatePrCoverageReport>[1]
    );
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "add_items") {
    const ids = Array.isArray(body.coverage_ids)
      ? body.coverage_ids.map((id: unknown) => String(id))
      : [];
    const updated = await addItemsToPrCoverageReport(String(body.id ?? ""), ids);
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "remove_item") {
    const updated = await removeItemFromPrCoverageReport(
      String(body.id ?? ""),
      String(body.coverage_id ?? "")
    );
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "reorder") {
    const ids = Array.isArray(body.coverage_ids)
      ? body.coverage_ids.map((id: unknown) => String(id))
      : [];
    const updated = await reorderPrCoverageReportItems(
      String(body.id ?? ""),
      ids
    );
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "refresh_item") {
    const updated = await refreshPrCoverageReportItem(
      String(body.id ?? ""),
      String(body.coverage_id ?? "")
    );
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "update_item") {
    const patch = normalizePrCoverageReportItem({
      coverage_id: String(body.coverage_id ?? ""),
      ...((body.patch ?? {}) as Partial<PrCoverageReportItem>),
    });
    const updated = await updatePrCoverageReportItem(
      String(body.id ?? ""),
      String(body.coverage_id ?? ""),
      patch
    );
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "set_share") {
    const result = await setPrCoverageReportShare(
      String(body.id ?? ""),
      body.enabled === true
    );
    if (!result) return jsonError("Not found", 404);
    return jsonOk({
      ...result,
      path: coverageReportSharePath(result.share_token),
    });
  }

  const item = await createPrCoverageReport({
    title: String(body.title ?? ""),
    summary: String(body.summary ?? ""),
    status: body.status === "published" ? "published" : "draft",
    coverage_ids: Array.isArray(body.coverage_ids)
      ? body.coverage_ids.map((id: unknown) => String(id))
      : [],
  });
  return jsonOk({ item }, { status: 201 });
}
