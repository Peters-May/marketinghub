"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import { FormAlert } from "@/components/ui/FormAlert";
import { ColourSwatches } from "@/components/merch/ColourSwatches";
import {
  ClothingThumb,
  type ClothingProductCardItem,
} from "@/components/merch/ClothingProductCards";
import { CLOTHING_SIZES } from "@/lib/merch/north-sails";
import { hexForColourName } from "@/lib/merch/colour-swatches";
import type {
  MerchCatalogueColour,
  MerchCatalogueImageAsset,
} from "@/lib/types";

type EditState = {
  product_id?: string;
  label: string;
  brand: string;
  material: string;
  description: string;
  supplier_url: string;
  unit_cost: string;
  colours: MerchCatalogueColour[];
  default_colour: string;
  sizes: string[];
  images: MerchCatalogueImageAsset[];
  image_url: string;
  create: boolean;
};

function formatCost(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toFixed(2);
}

const emptyEdit = (): EditState => ({
  label: "",
  brand: "North Sails",
  material: "",
  description: "",
  supplier_url: "",
  unit_cost: "",
  colours: [
    { name: "Navy", hex: hexForColourName("Navy") },
    { name: "White", hex: hexForColourName("White") },
  ],
  default_colour: "Navy",
  sizes: [...CLOTHING_SIZES],
  images: [],
  image_url: "",
  create: true,
});

function productToEdit(product: ClothingProductCardItem): EditState {
  const colours =
    product.colourSwatches?.length
      ? product.colourSwatches.map((c) => ({
          name: c.name,
          hex: c.hex || hexForColourName(c.name),
        }))
      : product.colours.map((name) => ({
          name,
          hex: hexForColourName(name),
        }));
  return {
    product_id: product.id,
    label: product.label,
    brand: String(product.brand || ""),
    material: product.material || "",
    description: product.description || "",
    supplier_url: product.supplier_url || product.links?.male || "",
    unit_cost: formatCost(product.unit_cost),
    colours,
    default_colour: product.defaultColour || colours[0]?.name || "",
    sizes: product.sizes?.length ? [...product.sizes] : [...CLOTHING_SIZES],
    images: product.images?.length
      ? [...product.images]
      : product.image_url
        ? [{ url: product.image_url, sort: 0 }]
        : [],
    image_url: product.image_url || "",
    create: false,
  };
}

export function CatalogueManager() {
  const [products, setProducts] = useState<ClothingProductCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [colourDraft, setColourDraft] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/merch/catalogue?include_hidden=1");
      if (!res.ok) return;
      const data = (await res.json()) as {
        products?: ClothingProductCardItem[];
      };
      setProducts(data.products ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save(patch?: { hidden?: boolean }) {
    if (!edit) return;
    const name = edit.label.trim();
    if (!name) {
      setError("Item name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const images = edit.images.filter((img) => img.url?.trim());
      const primary = images[0]?.url || edit.image_url;
      const res = await fetch("/api/merch/catalogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          create: edit.create,
          product_id: edit.product_id,
          label: name,
          brand: edit.brand.trim(),
          material: edit.material.trim(),
          description: edit.description.trim(),
          supplier_url: edit.supplier_url.trim(),
          unit_cost: edit.unit_cost.trim() === "" ? null : edit.unit_cost.trim(),
          colour_swatches: edit.colours,
          colours: edit.colours.map((c) => c.name),
          default_colour: edit.default_colour || edit.colours[0]?.name,
          sizes: edit.sizes,
          images,
          image_url: primary,
          hidden: patch?.hidden,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        products?: ClothingProductCardItem[];
      };
      if (!res.ok) {
        setError(data.error || "Could not save");
        return;
      }
      if (data.products) setProducts(data.products);
      if (patch?.hidden === undefined) setEdit(null);
      else void refresh();
    } finally {
      setSaving(false);
    }
  }

  const visible = products.filter((p) => !p.hidden);
  const removed = products.filter((p) => p.hidden);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-brand">Catalogue</h2>
          <p className="mt-0.5 text-sm text-muted">
            Upload clothing with photos, colours, and details. New items appear
            in the shop for staff to request.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setError("");
            setEdit(emptyEdit());
          }}
        >
          Add product
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading catalogue…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...visible, ...removed].map((product) => (
            <article
              key={product.id}
              className={cn(
                "flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm",
                product.hidden ? "opacity-70" : ""
              )}
            >
              <ClothingThumb
                src={product.image_url}
                label={product.label}
                size="lg"
              />
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="font-display text-lg leading-snug text-brand">
                  {product.label}
                </h3>
                <p className="text-xs text-muted">
                  {product.brand}
                  {product.custom ? " · Custom" : ""}
                  {product.hidden ? " · Hidden" : ""}
                </p>
                {typeof product.unit_cost === "number" ? (
                  <p className="text-sm font-medium text-foreground">
                    £{product.unit_cost.toFixed(2)}
                    <span className="ml-1 text-xs font-normal text-muted">
                      unit cost
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-muted">No unit cost set</p>
                )}
                {product.colourSwatches?.length || product.colours.length ? (
                  <ColourSwatches
                    colours={
                      product.colourSwatches?.length
                        ? product.colourSwatches
                        : product.colours
                    }
                    value={product.defaultColour}
                    onChange={() => undefined}
                    size="sm"
                  />
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    className="btn-secondary px-2.5 py-1.5 text-xs"
                    onClick={() => {
                      setError("");
                      setEdit(productToEdit(product));
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={
                      product.hidden
                        ? "btn-primary px-2.5 py-1.5 text-xs"
                        : "btn-ghost px-2.5 py-1.5 text-xs text-[var(--danger)]"
                    }
                    disabled={saving}
                    onClick={() => {
                      const message = product.hidden
                        ? "Restore this item to the clothing catalogue?"
                        : "Hide this item from the shop? You can restore it later.";
                      if (!window.confirm(message)) return;
                      void (async () => {
                        setSaving(true);
                        setError("");
                        try {
                          const res = await fetch("/api/merch/catalogue", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              product_id: product.id,
                              hidden: !product.hidden,
                            }),
                          });
                          const data = (await res.json()) as {
                            error?: string;
                            products?: ClothingProductCardItem[];
                          };
                          if (!res.ok) {
                            setError(data.error || "Could not update visibility");
                            return;
                          }
                          if (data.products) setProducts(data.products);
                          else void refresh();
                        } finally {
                          setSaving(false);
                        }
                      })();
                    }}
                  >
                    {product.hidden ? "Restore" : "Hide"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {edit ? (
        <div className="fixed inset-0 z-50 md:left-sidebar">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close editor"
            onClick={() => setEdit(null)}
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-display text-lg text-brand">
                {edit.create ? "Add product" : "Edit product"}
              </h3>
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-sm"
                onClick={() => setEdit(null)}
              >
                Close
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              <div>
                <label className="label">Name</label>
                <input
                  className="field"
                  value={edit.label}
                  onChange={(e) => setEdit({ ...edit, label: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Brand</label>
                  <input
                    className="field"
                    value={edit.brand}
                    onChange={(e) =>
                      setEdit({ ...edit, brand: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">Material</label>
                  <input
                    className="field"
                    value={edit.material}
                    onChange={(e) =>
                      setEdit({ ...edit, material: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="field min-h-[88px] resize-y"
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Supplier URL</label>
                <input
                  className="field"
                  value={edit.supplier_url}
                  onChange={(e) =>
                    setEdit({ ...edit, supplier_url: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Unit cost (£)</label>
                <input
                  className="field"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="e.g. 28.50"
                  value={edit.unit_cost}
                  onChange={(e) =>
                    setEdit({ ...edit, unit_cost: e.target.value })
                  }
                />
                <p className="mt-1 text-[11px] text-muted">
                  Admin-only — used to track kit cost. Not shown on the public
                  or staff shop.
                </p>
              </div>
              <div>
                <label className="label">Colours</label>
                <div className="mb-2">
                  <ColourSwatches
                    colours={edit.colours}
                    value={edit.default_colour}
                    onChange={(colour) =>
                      setEdit({ ...edit, default_colour: colour })
                    }
                  />
                </div>
                <ul className="mb-2 space-y-2">
                  {edit.colours.map((c, i) => (
                    <li key={`${c.name}-${i}`} className="flex items-center gap-2">
                      <input
                        className="field flex-1"
                        value={c.name}
                        onChange={(e) => {
                          const colours = edit.colours.map((row, idx) =>
                            idx === i
                              ? {
                                  name: e.target.value,
                                  hex:
                                    row.hex ||
                                    hexForColourName(e.target.value),
                                }
                              : row
                          );
                          setEdit({ ...edit, colours });
                        }}
                      />
                      <input
                        type="color"
                        className="h-9 w-12 cursor-pointer rounded border border-border bg-white p-1"
                        value={
                          /^#[0-9A-Fa-f]{6}$/.test(c.hex)
                            ? c.hex
                            : hexForColourName(c.name)
                        }
                        onChange={(e) => {
                          const colours = edit.colours.map((row, idx) =>
                            idx === i ? { ...row, hex: e.target.value } : row
                          );
                          setEdit({ ...edit, colours });
                        }}
                        title="Swatch colour"
                      />
                      <button
                        type="button"
                        className="text-xs text-[var(--danger)]"
                        onClick={() =>
                          setEdit({
                            ...edit,
                            colours: edit.colours.filter((_, idx) => idx !== i),
                          })
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <input
                    className="field flex-1"
                    placeholder="Add colour name"
                    value={colourDraft}
                    onChange={(e) => setColourDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => {
                      const name = colourDraft.trim();
                      if (!name) return;
                      setEdit({
                        ...edit,
                        colours: [
                          ...edit.colours,
                          { name, hex: hexForColourName(name) },
                        ],
                        default_colour: edit.default_colour || name,
                      });
                      setColourDraft("");
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Sizes</label>
                <div className="flex flex-wrap gap-1.5">
                  {[...CLOTHING_SIZES, "S-M", "N/A"].map((size) => {
                    const on = edit.sizes.includes(size);
                    return (
                      <button
                        key={size}
                        type="button"
                        className={cn(
                          "border px-2 py-1 text-xs",
                          on
                            ? "border-[#0B2545] bg-[#0B2545] text-white"
                            : "border-border bg-white"
                        )}
                        onClick={() =>
                          setEdit({
                            ...edit,
                            sizes: on
                              ? edit.sizes.filter((s) => s !== size)
                              : [...edit.sizes, size],
                          })
                        }
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">Images</label>
                <p className="mb-2 text-[11px] text-muted">
                  Add multiple photos. Optionally tag an image to a colour so
                  swatches swap the shop photo.
                </p>
                <div className="space-y-3">
                  {edit.images.map((img, i) => (
                    <div
                      key={`${img.url}-${i}`}
                      className="rounded-xl border border-border p-3"
                    >
                      <AssetUploadField
                        value={img.url}
                        onChange={(url) => {
                          const images = edit.images.map((row, idx) =>
                            idx === i ? { ...row, url } : row
                          );
                          setEdit({
                            ...edit,
                            images,
                            image_url: images[0]?.url || "",
                          });
                        }}
                        label={`Photo ${i + 1}`}
                        hint="Images preferred · max 25MB."
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          className="field"
                          value={img.colour || ""}
                          onChange={(e) => {
                            const images = edit.images.map((row, idx) =>
                              idx === i
                                ? {
                                    ...row,
                                    colour: e.target.value || undefined,
                                  }
                                : row
                            );
                            setEdit({ ...edit, images });
                          }}
                        >
                          <option value="">Any colour</option>
                          {edit.colours.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="text-xs text-[var(--danger)]"
                          onClick={() => {
                            const images = edit.images.filter(
                              (_, idx) => idx !== i
                            );
                            setEdit({
                              ...edit,
                              images,
                              image_url: images[0]?.url || "",
                            });
                          }}
                        >
                          Remove photo
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() =>
                      setEdit({
                        ...edit,
                        images: [
                          ...edit.images,
                          { url: "", sort: edit.images.length },
                        ],
                      })
                    }
                  >
                    Add photo
                  </button>
                </div>
              </div>
              <FormAlert message={error || null} />
            </div>
            <div className="flex gap-2 border-t border-border p-4">
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
