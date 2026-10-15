"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contact, MerchOrder, MerchStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";
import {
  CLOTHING_BRAND,
  CLOTHING_FITS,
  CLOTHING_LOGOS,
  CLOTHING_PRODUCTS,
  CLOTHING_SIZES,
  DEFAULT_CLOTHING_LOGO,
  clothingProductByLabel,
  clothingLogoHint,
  coloursForItem,
  defaultColourForItem,
  normalizeClothingLogo,
  type ClothingFit,
  type ClothingLogo,
} from "@/lib/merch/north-sails";
import {
  MERCH_FOR_OTHER,
  contactMerchForOptions,
} from "@/lib/merch/requested-for";
import { createPersonContact } from "@/lib/contacts/create-person";
import {
  getMerchOrderItems,
  merchOrderItemLabels,
  merchOrderSearchText,
  OTHER_ITEM_LABEL,
} from "@/lib/merch/order-items";
import {
  ClothingProductCards,
  type ClothingProductCardItem,
} from "@/components/merch/ClothingProductCards";
import { onTourPrepare } from "@/lib/tour/bus";

const STATUSES: { id: MerchStatus; label: string }[] = [
  { id: "requested", label: "Requested" },
  { id: "approved", label: "Approved" },
  { id: "ordered", label: "Ordered" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
];

const MEMBER_STATUSES: { id: MerchStatus; label: string }[] = [
  { id: "requested", label: "Requested" },
  { id: "cancelled", label: "Cancelled" },
];

const DEFAULT_ITEM = CLOTHING_PRODUCTS[0]!.label;

type ForMode = "me" | "other";

/** A single item line within a multi-item order form. */
export type OrderItemRow = {
  id: string;
  item: string;
  fit: ClothingFit | "";
  size: string;
  quantity: string;
  colour: string;
  logo: ClothingLogo;
  is_other: boolean;
  other_description: string;
};

function itemRowsToPayload(rows: OrderItemRow[]) {
  return rows
    .map((row) => ({
      id: row.id,
      item: row.is_other ? OTHER_ITEM_LABEL : row.item,
      fit: row.is_other ? ("" as const) : ((row.fit || "male") as ClothingFit),
      size: row.is_other ? "" : row.size,
      quantity: Number(row.quantity) || 1,
      colour: row.is_other ? "" : row.colour,
      logo: row.is_other ? "" : row.logo,
      is_other: row.is_other,
      other_description: row.is_other ? row.other_description.trim() : "",
    }))
    .filter((line) => (line.is_other ? line.other_description : line.item));
}

function orderToItemRows(order: MerchOrder): OrderItemRow[] {
  return getMerchOrderItems(order).map((line) => ({
    id: line.id,
    item: line.is_other ? OTHER_ITEM_LABEL : line.item,
    fit: (line.fit as ClothingFit | "") || "male",
    size: line.size,
    quantity: String(line.quantity),
    colour: line.colour,
    logo: normalizeClothingLogo(line.logo) as ClothingLogo,
    is_other: Boolean(line.is_other),
    other_description: line.other_description ?? "",
  }));
}

function buildEmptyItemRow(
  products: ClothingProductCardItem[] = CLOTHING_PRODUCTS.map((p) => ({
    ...p,
    image_url: "",
  }))
): OrderItemRow {
  return {
    id: Math.random().toString(36).slice(2),
    item: DEFAULT_ITEM,
    fit: "male",
    size: "M",
    quantity: "1",
    colour: defaultColourForItem(DEFAULT_ITEM, products),
    logo: DEFAULT_CLOTHING_LOGO as ClothingLogo,
    is_other: false,
    other_description: "",
  };
}

/** Shared fields for the whole order (header). */
function buildEmptyOrderHeader(
  viewerName = "",
  viewerContactId: string | null = null
) {
  return {
    requested_for: viewerName,
    requested_for_contact_id: viewerContactId,
    for_mode: "me" as ForMode,
    office: "Southampton",
    needed_by: "",
    notes: "",
    created_by: viewerName,
  };
}

type OrderHeader = ReturnType<typeof buildEmptyOrderHeader>;
type OrderHeaderWithStatus = OrderHeader & { status: MerchStatus };

type RequestedForForm = {
  requested_for: string;
  requested_for_contact_id: string | null;
  for_mode: ForMode;
};

function orderToEditHeader(
  order: MerchOrder,
  viewerName: string,
  viewerContactId: string | null
): OrderHeaderWithStatus {
  const isMe =
    (viewerContactId &&
      order.requested_for_contact_id === viewerContactId) ||
    (!order.requested_for_contact_id &&
      order.requested_for.trim().toLowerCase() ===
        viewerName.trim().toLowerCase());
  return {
    requested_for: order.requested_for,
    requested_for_contact_id: order.requested_for_contact_id ?? null,
    for_mode: isMe ? "me" : "other",
    office: order.office,
    needed_by: order.needed_by ?? "",
    notes: order.notes,
    created_by: order.created_by,
    status: order.status,
  };
}

function statusLabel(status: MerchStatus) {
  return STATUSES.find((s) => s.id === status)?.label ?? status;
}

function statusTone(status: MerchStatus) {
  switch (status) {
    case "approved":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "ordered":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "delivered":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "cancelled":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-violet-50 text-violet-800 border-violet-200";
  }
}

function fitLabel(fit: string) {
  if (fit === "female") return "Female";
  if (fit === "male") return "Male";
  return "";
}

function RequestedForField<T extends RequestedForForm>({
  form,
  onChange,
  canManageAll,
  viewerName,
  viewerContactId,
}: {
  form: T;
  onChange: (next: T) => void;
  canManageAll: boolean;
  viewerName: string;
  viewerContactId: string | null;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!canManageAll) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/contacts");
        if (!res.ok) return;
        const data = (await res.json()) as { contacts?: Contact[] };
        if (!cancelled) setContacts(data.contacts ?? []);
      } catch {
        /* keep empty */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageAll]);

  const selectedContact = useMemo(
    () =>
      contacts.find((c) => c.id === form.requested_for_contact_id) ?? null,
    [contacts, form.requested_for_contact_id]
  );

  if (canManageAll) {
    const selectValue = form.requested_for_contact_id || MERCH_FOR_OTHER;
    return (
      <div className="md:col-span-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">For</label>
          <SearchSelect
            className="field"
            value={selectValue}
            disabled={!loaded}
            aria-label="Allocate order to contact"
            placeholder={loaded ? "Choose contact…" : "Loading…"}
            searchPlaceholder="Search or add a person…"
            noResultsLabel="No matches — add them below"
            options={contactMerchForOptions(
              contacts,
              form.requested_for_contact_id,
              form.requested_for
            )}
            allowCreate
            createLabel={(name) => `Add “${name}” as a contact`}
            onCreate={async (name) => {
              const item = await createPersonContact(name);
              setContacts((prev) =>
                prev.some((c) => c.id === item.id) ? prev : [...prev, item]
              );
              onChange({
                ...form,
                requested_for_contact_id: item.id,
                requested_for: item.name,
                for_mode: "other",
              });
            }}
            onChange={(value) => {
              if (value === MERCH_FOR_OTHER) {
                onChange({
                  ...form,
                  requested_for_contact_id: null,
                  requested_for: form.requested_for_contact_id
                    ? ""
                    : form.requested_for,
                  for_mode: "other",
                });
                return;
              }
              const contact = contacts.find((c) => c.id === value);
              onChange({
                ...form,
                requested_for_contact_id: value,
                requested_for: contact?.name ?? form.requested_for,
                for_mode: "other",
              });
            }}
          />
          {selectedContact?.user_id ? (
            <p className="mt-1 text-xs text-muted">
              Linked hub member — order will appear in their clothing requests.
            </p>
          ) : !form.requested_for_contact_id ? (
            <p className="mt-1 text-xs text-muted">
              Type a name for now; you can reallocate to a contact later.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Not linked to a hub user yet — link them in Contacts to allocate.
            </p>
          )}
        </div>
        {!form.requested_for_contact_id ? (
          <div>
            <label className="label">Name</label>
            <input
              className="field"
              placeholder="Name or team"
              value={form.requested_for}
              onChange={(e) =>
                onChange({
                  ...form,
                  requested_for: e.target.value,
                  for_mode: "other",
                })
              }
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="md:col-span-2 grid gap-2 sm:grid-cols-2">
      <div>
        <label className="label">For</label>
        <SearchSelect
          className="field"
          value={form.for_mode}
          aria-label="Who is this order for"
          options={[
            {
              value: "me",
              label: viewerName.trim()
                ? `Myself (${viewerName.trim()})`
                : "Myself",
            },
            { value: "other", label: "Someone else" },
          ]}
          onChange={(mode) => {
            if (mode === "me") {
              onChange({
                ...form,
                for_mode: "me",
                requested_for: viewerName,
                requested_for_contact_id: viewerContactId,
              });
              return;
            }
            onChange({
              ...form,
              for_mode: "other",
              requested_for:
                form.for_mode === "me" ? "" : form.requested_for,
              requested_for_contact_id: null,
            });
          }}
        />
      </div>
      {form.for_mode === "other" ? (
        <div>
          <label className="label">Name</label>
          <input
            className="field"
            placeholder="Name or team"
            value={form.requested_for}
            onChange={(e) =>
              onChange({ ...form, requested_for: e.target.value })
            }
          />
          <p className="mt-1 text-xs text-muted">
            Marketing can reallocate this to a contact later.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Fields for a single item row in the multi-item new order form. */
function ItemRowFields({
  row,
  onChange,
  onRemove,
  canRemove,
  productCards,
}: {
  row: OrderItemRow;
  onChange: (next: OrderItemRow) => void;
  onRemove: () => void;
  canRemove: boolean;
  productCards: ClothingProductCardItem[];
}) {
  const product = clothingProductByLabel(row.item, productCards);
  const colours = coloursForItem(row.item, productCards);
  const fit = (row.fit || "male") as ClothingFit;
  const productUrl = fit === "female" ? product?.links?.female : product?.links?.male;

  function applyItem(item: string) {
    if (item === OTHER_ITEM_LABEL) {
      onChange({
        ...row,
        item: OTHER_ITEM_LABEL,
        is_other: true,
        fit: "",
        size: "",
        colour: "",
        logo: DEFAULT_CLOTHING_LOGO,
      });
      return;
    }
    const cs = coloursForItem(item, productCards);
    const colour = cs.includes(row.colour)
      ? row.colour
      : defaultColourForItem(item, productCards);
    onChange({
      ...row,
      item,
      is_other: false,
      other_description: "",
      colour,
      fit: row.fit || "male",
    });
  }

  const itemOptions = [
    ...productCards.map((p) => ({ value: p.label, label: p.label })),
    { value: OTHER_ITEM_LABEL, label: OTHER_ITEM_LABEL },
  ];

  return (
    <div className="rounded-xl border border-border bg-white p-3 grid gap-2 sm:grid-cols-2 relative">
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-3 top-3 text-xs text-muted hover:text-danger transition"
          aria-label="Remove item"
          title="Remove this item"
        >
          ✕ Remove
        </button>
      )}
      {!row.is_other ? (
        <div className="sm:col-span-2">
          <ClothingProductCards
            products={productCards}
            value={row.item}
            onChange={applyItem}
          />
        </div>
      ) : null}
      {!row.is_other ? (
        <div className="sm:col-span-2 rounded-xl border border-border bg-sand/40 px-3 py-2 text-xs text-muted">
          Supplier:{" "}
          <span className="font-medium text-foreground">
            {product?.brand || CLOTHING_BRAND}
          </span>
          {product?.material ? ` · ${product.material}` : ""}
          {product?.brand === "Henbury"
            ? " · shirt via Henbury / promotional store"
            : ""}
          {productUrl ? (
            <>
              {" · "}
              <a
                href={productUrl}
                target="_blank"
                rel="noreferrer"
                className="text-brand underline-offset-2 hover:underline"
              >
                View product
              </a>
            </>
          ) : null}
        </div>
      ) : null}
      <div className={row.is_other ? "sm:col-span-2" : ""}>
        <label className="label">Item</label>
        <SearchSelect
          className="field"
          value={row.is_other ? OTHER_ITEM_LABEL : row.item}
          onChange={applyItem}
          options={itemOptions}
        />
      </div>
      {row.is_other ? (
        <>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea
              className="field min-h-[88px] resize-y"
              placeholder="Describe the item — e.g. Navy jumper ordered externally for show season"
              value={row.other_description}
              onChange={(e) =>
                onChange({ ...row, other_description: e.target.value })
              }
            />
            <p className="mt-1.5 text-xs text-muted">
              Use this for clothing ordered outside the standard catalogue.
            </p>
          </div>
          <div>
            <label className="label">Quantity</label>
            <input
              className="field"
              type="number"
              min={1}
              value={row.quantity}
              onChange={(e) => onChange({ ...row, quantity: e.target.value })}
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="label">Fit</label>
            <SearchSelect
              className="field"
              value={row.fit || "male"}
              onChange={(f) => onChange({ ...row, fit: f as ClothingFit })}
              options={CLOTHING_FITS.map((f) => ({
                value: f.id,
                label: f.label,
              }))}
            />
          </div>
          <div>
            <label className="label">Size</label>
            <SearchSelect
              className="field"
              value={row.size}
              onChange={(size) => onChange({ ...row, size })}
              options={CLOTHING_SIZES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div>
            <label className="label">Colour</label>
            <SearchSelect
              className="field"
              value={row.colour}
              onChange={(colour) => onChange({ ...row, colour })}
              options={colours.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div>
            <label className="label">Logo</label>
            <SearchSelect
              className="field"
              value={row.logo}
              onChange={(logo) =>
                onChange({ ...row, logo: logo as ClothingLogo })
              }
              options={CLOTHING_LOGOS.map((l) => ({
                value: l.id,
                label: l.label,
              }))}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {clothingLogoHint(row.logo) ??
                "Use Bespoke Logistics when unsure; pick a division logo only when the item is clearly for that team."}
            </p>
          </div>
          <div>
            <label className="label">Quantity</label>
            <input
              className="field"
              type="number"
              min={1}
              value={row.quantity}
              onChange={(e) => onChange({ ...row, quantity: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}

function OrderItemsList({ order }: { order: MerchOrder }) {
  const lines = getMerchOrderItems(order);
  return (
    <ul className="mt-2 space-y-1.5">
      {lines.map((line) => (
        <li key={line.id} className="text-sm text-muted">
          {line.is_other ? (
            <span className="text-foreground">
              {line.other_description || OTHER_ITEM_LABEL}
              {line.quantity > 1 ? ` · ×${line.quantity}` : ""}
            </span>
          ) : (
            <span className="text-foreground">
              {line.item}
              {line.fit ? ` · ${fitLabel(line.fit)}` : ""}
              {line.size ? ` · ${line.size}` : ""}
              {line.quantity > 1 ? ` · ×${line.quantity}` : ""}
              {line.colour ? ` · ${line.colour}` : ""}
              {line.logo
                ? ` · ${normalizeClothingLogo(line.logo)} logo`
                : ""}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function MerchClient({
  initial,
  hideHeader = false,
  canManageAll = false,
  viewerName = "",
  viewerContactId = null,
}: {
  initial: MerchOrder[];
  hideHeader?: boolean;
  /** Admins see every order; members only receive their own from the API. */
  canManageAll?: boolean;
  viewerName?: string;
  viewerContactId?: string | null;
}) {
  const statusOptions = canManageAll ? STATUSES : MEMBER_STATUSES;
  const [orders, setOrders] = useState(initial);
  const [productCards, setProductCards] = useState<ClothingProductCardItem[]>(
    () => CLOTHING_PRODUCTS.map((p) => ({ ...p, image_url: "" }))
  );
  const [showForm, setShowForm] = useState(false);
  // Multi-item new order state
  const [orderHeader, setOrderHeader] = useState<OrderHeader>(() =>
    buildEmptyOrderHeader(viewerName, viewerContactId)
  );
  const [itemRows, setItemRows] = useState<OrderItemRow[]>(() => [
    buildEmptyItemRow(),
  ]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHeader, setEditHeader] = useState<OrderHeaderWithStatus | null>(
    null
  );
  const [editItemRows, setEditItemRows] = useState<OrderItemRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return onTourPrepare((action) => {
      if (action.type === "requests-open-order-form") {
        setShowForm(true);
      }
    });
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/merch");
    const data = await res.json();
    setOrders(data.orders ?? []);
  }, []);

  const refreshCatalogue = useCallback(async () => {
    try {
      const res = await fetch("/api/merch/catalogue");
      if (!res.ok) return;
      const data = (await res.json()) as {
        products?: ClothingProductCardItem[];
      };
      if (data.products?.length) setProductCards(data.products);
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshCatalogue();
  }, [refresh, refreshCatalogue]);

  useEffect(() => {
    setOrderHeader(buildEmptyOrderHeader(viewerName, viewerContactId));
  }, [viewerName, viewerContactId]);

  const itemTypes = useMemo(() => {
    const set = new Set([
      ...productCards.map((p) => p.label),
      OTHER_ITEM_LABEL,
      ...orders.flatMap((o) => merchOrderItemLabels(o)),
    ]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orders, productCards]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (!matchesSearch(search, merchOrderSearchText(o))) {
        return false;
      }
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (itemFilter !== "all") {
        const labels = merchOrderItemLabels(o);
        if (!labels.includes(itemFilter)) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter, itemFilter]);

  const editingOrder = editingId
    ? orders.find((o) => o.id === editingId) ?? null
    : null;

  async function create() {
    const items = itemRowsToPayload(itemRows);
    if (items.length === 0) {
      window.alert("Add at least one item to the order.");
      return;
    }
    const { for_mode, ...header } = orderHeader;
    void for_mode;
    const res = await fetch("/api/merch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...header,
        items,
        needed_by: orderHeader.needed_by || null,
        requested_for_contact_id: orderHeader.requested_for_contact_id,
        created_by: orderHeader.created_by || orderHeader.requested_for || "Staff",
        status: "requested",
      }),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<MerchOrder>(data);
    if (!res.ok || !item) return;
    setOrders((prev) => upsertById(prev, item));
    setShowForm(false);
    setOrderHeader(buildEmptyOrderHeader(viewerName, viewerContactId));
    setItemRows([buildEmptyItemRow(productCards)]);
  }

  function openEdit(order: MerchOrder) {
    setEditingId(order.id);
    setEditHeader(orderToEditHeader(order, viewerName, viewerContactId));
    setEditItemRows(orderToItemRows(order));
  }

  function closeEdit() {
    setEditingId(null);
    setEditHeader(null);
    setEditItemRows([]);
  }

  async function saveEdit() {
    if (!editingId || !editHeader) return;
    const items = itemRowsToPayload(editItemRows);
    if (items.length === 0) {
      window.alert("Add at least one item to the order.");
      return;
    }
    setSaving(true);
    try {
      const { for_mode, status, ...header } = editHeader;
      void for_mode;
      const res = await fetch("/api/merch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          patch: {
            ...header,
            items,
            status,
            needed_by: editHeader.needed_by || null,
            requested_for_contact_id: editHeader.requested_for_contact_id,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      const item = rowFromResponse<MerchOrder>(data);
      if (!res.ok || !item) return;
      setOrders((prev) => upsertById(prev, item));
      closeEdit();
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: MerchStatus) {
    const res = await fetch("/api/merch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, patch: { status } }),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<MerchOrder>(data);
    if (!res.ok || !item) return;
    setOrders((prev) => upsertById(prev, item));
    if (editingId === id && editHeader) {
      setEditHeader({ ...editHeader, status: item.status });
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this merch order?")) return;
    const res = await fetch("/api/merch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      window.alert(data?.error || "Could not delete this order.");
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== id));
    if (editingId === id) closeEdit();
  }

  return (
    <div>
      {hideHeader ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-brand">
              {canManageAll ? "Corporate clothing" : "My clothing orders"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {canManageAll
                ? `${CLOTHING_BRAND} · all staff orders`
                : `${CLOTHING_BRAND} · only your requests are shown`}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            data-tour="requests-new-order"
            onClick={() => setShowForm(true)}
          >
            New order
          </button>
        </div>
      ) : (
        <PageHeader
          title="Corporate clothing"
          description={`${CLOTHING_BRAND} kit — Regatta or Pique polo (navy/white), navy gilet, navy sailor jacket, white collared shirt. Choose male or female fit.`}
          actions={
            <button
              type="button"
              className="btn-primary"
              data-tour="requests-new-order"
              onClick={() => setShowForm(true)}
            >
              New order
            </button>
          }
        />
      )}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search item, person, office…"
        resultCount={filtered.length}
        totalCount={orders.length}
        selects={[
          {
            id: "status",
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "all", label: "All statuses" },
              ...statusOptions.map((s) => ({ value: s.id, label: s.label })),
            ],
          },
          {
            id: "item",
            label: "Item",
            value: itemFilter,
            onChange: setItemFilter,
            options: [
              { value: "all", label: "All items" },
              ...itemTypes.map((i) => ({ value: i, label: i })),
            ],
          },
        ]}
      />

      {showForm ? (
        <div
          className="surface-card mb-6 p-5 space-y-4"
          data-tour="requests-order-form"
        >
          {/* Shared order details */}
          <div className="grid gap-3 md:grid-cols-2">
            <RequestedForField
              form={orderHeader}
              onChange={(next) =>
                setOrderHeader((h) => ({
                  ...h,
                  requested_for: next.requested_for,
                  requested_for_contact_id: next.requested_for_contact_id,
                  for_mode: next.for_mode,
                }))
              }
              canManageAll={canManageAll}
              viewerName={viewerName}
              viewerContactId={viewerContactId}
            />
            <div>
              <label className="label">Office</label>
              <input
                className="field"
                value={orderHeader.office}
                onChange={(e) =>
                  setOrderHeader((h) => ({ ...h, office: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">Needed by</label>
              <input
                className="field"
                type="date"
                value={orderHeader.needed_by}
                onChange={(e) =>
                  setOrderHeader((h) => ({ ...h, needed_by: e.target.value }))
                }
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Notes</label>
              <RichTextEditor
                value={orderHeader.notes}
                onChange={(notes) =>
                  setOrderHeader((h) => ({ ...h, notes }))
                }
                placeholder="Any additional notes for this order…"
                minHeight="70px"
              />
            </div>
          </div>

          {/* Item rows */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted uppercase tracking-wide">
              Items ({itemRows.length})
            </p>
            {itemRows.map((row) => (
              <ItemRowFields
                key={row.id}
                row={row}
                onChange={(next) =>
                  setItemRows((rows) =>
                    rows.map((r) => (r.id === row.id ? next : r))
                  )
                }
                onRemove={() =>
                  setItemRows((rows) => rows.filter((r) => r.id !== row.id))
                }
                canRemove={itemRows.length > 1}
                productCards={productCards}
              />
            ))}
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() =>
                setItemRows((rows) => [
                  ...rows,
                  buildEmptyItemRow(productCards),
                ])
              }
            >
              + Add another item
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void create()}
            >
              Submit order
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowForm(false);
                setOrderHeader(buildEmptyOrderHeader(viewerName, viewerContactId));
                setItemRows([buildEmptyItemRow(productCards)]);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {filtered.map((order) => {
          const lineCount = getMerchOrderItems(order).length;
          return (
          <article key={order.id} className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl text-brand">
                  {order.requested_for || "Clothing order"}
                  <span className="ml-2 text-base font-sans font-normal text-muted">
                    · {lineCount} item{lineCount === 1 ? "" : "s"}
                  </span>
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {order.office ? `${order.office}` : "—"}
                  {order.needed_by ? ` · needed ${order.needed_by}` : ""}
                  {order.created_by ? ` · requested by ${order.created_by}` : ""}
                </p>
                <OrderItemsList order={order} />
              </div>
              <span
                className={cn(
                  "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  statusTone(order.status)
                )}
              >
                {statusLabel(order.status)}
              </span>
            </div>
            {plainTextFromHtml(order.notes) ? (
              <div className="mt-3 text-sm text-muted">
                <RichTextView html={order.notes} />
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary px-2.5 py-1.5 text-xs"
                onClick={() => openEdit(order)}
              >
                Edit
              </button>
              {canManageAll ||
              order.status === "requested" ||
              order.status === "cancelled" ? (
                <SearchSelect
                  className="field !w-auto py-1.5 text-xs"
                  value={order.status}
                  onChange={(status) =>
                    void setStatus(order.id, status as MerchStatus)
                  }
                  aria-label="Change status"
                  options={[
                    ...(!statusOptions.some((s) => s.id === order.status)
                      ? [
                          {
                            value: order.status,
                            label: statusLabel(order.status),
                          },
                        ]
                      : []),
                    ...statusOptions.map((s) => ({
                      value: s.id,
                      label: s.label,
                    })),
                  ]}
                />
              ) : null}
            </div>
          </article>
        )})}
        {filtered.length === 0 ? (
          <p className="text-sm text-muted">
            {canManageAll
              ? "No clothing orders match your filters."
              : "You have no clothing orders yet. Submit a request to get started."}
          </p>
        ) : null}
      </div>

      {editHeader && editingOrder ? (
        <RecordDrawer
          open
          onClose={closeEdit}
          title="Edit order"
          ariaLabel="Edit clothing order"
          className="max-w-lg"
          footer={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={closeEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-ghost text-[var(--danger)]"
                disabled={saving}
                onClick={() => void remove(editingOrder.id)}
              >
                Delete
              </button>
            </div>
          }
        >
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <RequestedForField
                  form={editHeader}
                  onChange={setEditHeader}
                  canManageAll={canManageAll}
                  viewerName={viewerName}
                  viewerContactId={viewerContactId}
                />
                <div>
                  <label className="label">Office</label>
                  <input
                    className="field"
                    value={editHeader.office}
                    onChange={(e) =>
                      setEditHeader((h) =>
                        h ? { ...h, office: e.target.value } : h
                      )
                    }
                  />
                </div>
                <div>
                  <label className="label">Needed by</label>
                  <input
                    className="field"
                    type="date"
                    value={editHeader.needed_by}
                    onChange={(e) =>
                      setEditHeader((h) =>
                        h ? { ...h, needed_by: e.target.value } : h
                      )
                    }
                  />
                </div>
                <div>
                  <label className="label">Status</label>
                  <SearchSelect
                    className="field"
                    value={editHeader.status}
                    onChange={(status) =>
                      setEditHeader((h) =>
                        h ? { ...h, status: status as MerchStatus } : h
                      )
                    }
                    options={[
                      ...(!statusOptions.some(
                        (s) => s.id === editHeader.status
                      )
                        ? [
                            {
                              value: editHeader.status,
                              label: statusLabel(editHeader.status),
                            },
                          ]
                        : []),
                      ...statusOptions.map((s) => ({
                        value: s.id,
                        label: s.label,
                      })),
                    ]}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Notes</label>
                  <RichTextEditor
                    value={editHeader.notes}
                    onChange={(notes) =>
                      setEditHeader((h) => (h ? { ...h, notes } : h))
                    }
                    placeholder="Any additional notes for this order…"
                    minHeight="70px"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Items ({editItemRows.length})
                </p>
                {editItemRows.map((row) => (
                  <ItemRowFields
                    key={row.id}
                    row={row}
                    onChange={(next) =>
                      setEditItemRows((rows) =>
                        rows.map((r) => (r.id === row.id ? next : r))
                      )
                    }
                    onRemove={() =>
                      setEditItemRows((rows) =>
                        rows.filter((r) => r.id !== row.id)
                      )
                    }
                    canRemove={editItemRows.length > 1}
                    productCards={productCards}
                  />
                ))}
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() =>
                    setEditItemRows((rows) => [
                      ...rows,
                      buildEmptyItemRow(productCards),
                    ])
                  }
                >
                  + Add another item
                </button>
              </div>
            </div>
        </RecordDrawer>
      ) : null}
    </div>
  );
}
