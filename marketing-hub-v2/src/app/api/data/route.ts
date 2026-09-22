import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin, requireStaff } from "@/lib/api";
import {
  addField,
  addRow,
  addSelectOption,
  bulkDelete,
  bulkUpdate,
  deleteRow,
  getFieldOptionsMap,
  getTable,
  listCollectionSummaries,
  removeField,
  updateCell,
  updateField,
} from "@/lib/data/data-admin";
import { getCollection, isCollectionKey } from "@/lib/data/collections";

function collectionRequiresAdmin(collection: string): boolean {
  if (!isCollectionKey(collection)) return false;
  return getCollection(collection)?.adminOnly === true;
}

export async function GET(request: NextRequest) {
  const collection = request.nextUrl.searchParams.get("collection");

  if (collection && collectionRequiresAdmin(collection)) {
    const { error } = await requireAdmin();
    if (error) return error;
  } else {
    const { error } = await requireStaff();
    if (error) return error;
  }

  if (!collection) {
    return jsonOk({ collections: listCollectionSummaries() });
  }

  try {
    if (request.nextUrl.searchParams.get("fieldsOnly") === "1") {
      return jsonOk({
        collection,
        fieldOptions: await getFieldOptionsMap(collection),
      });
    }
    return jsonOk(await getTable(collection));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed", 400);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action as string;
  const collection = body.collection as string | undefined;

  if (collection && collectionRequiresAdmin(collection)) {
    const { error } = await requireAdmin();
    if (error) return error;
  } else {
    const adminOnly = new Set([
      "bulkDelete",
      "deleteRow",
      "addField",
      "updateField",
      "removeField",
    ]);
    const gate = adminOnly.has(action) ? await requireAdmin() : await requireStaff();
    if (gate.error) return gate.error;
  }

  try {
    if (action === "updateCell") {
      const row = await updateCell(
        body.collection,
        body.id,
        body.field,
        body.value
      );
      return jsonOk({ row });
    }
    if (action === "bulkUpdate") {
      const result = await bulkUpdate(
        body.collection,
        Array.isArray(body.ids) ? body.ids : [],
        body.field,
        body.value
      );
      return jsonOk(result);
    }
    if (action === "bulkDelete") {
      const result = await bulkDelete(
        body.collection,
        Array.isArray(body.ids) ? body.ids : []
      );
      return jsonOk(result);
    }
    if (action === "addRow") {
      const row = await addRow(body.collection, body.patch ?? {});
      return jsonOk({ row }, { status: 201 });
    }
    if (action === "deleteRow") {
      await deleteRow(body.collection, body.id);
      return jsonOk({ ok: true });
    }
    if (action === "addField") {
      const field = await addField(body.collection, body.name, {
        label: body.label,
        type: body.type,
        options: body.options,
      });
      return jsonOk({ field }, { status: 201 });
    }
    if (action === "updateField") {
      const field = await updateField(body.collection, body.key ?? body.name, {
        label: body.label,
        type: body.type,
        options: body.options,
        newKey: body.newKey,
      });
      return jsonOk({ field });
    }
    if (action === "addSelectOption") {
      const result = await addSelectOption(
        body.collection,
        body.key ?? body.name,
        body.value ?? body.label ?? ""
      );
      return jsonOk(result);
    }
    if (action === "removeField") {
      await removeField(body.collection, body.name ?? body.key);
      return jsonOk({ ok: true });
    }
    return jsonError("Unknown action");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed", 400);
  }
}
