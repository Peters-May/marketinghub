"use client";

import { useEffect, useState } from "react";
import { ShareCopyDiff } from "@/components/share/ShareCopyDiff";
import { byLabelForDecision } from "@/lib/share/review";
import type { ShareReviewResponse, ShareReviewTargetType } from "@/lib/types";

export function ShareReviewPanel({
  targetType,
  targetId,
  onApplied,
}: {
  targetType: ShareReviewTargetType;
  targetId: string;
  onApplied?: (payload: {
    caption?: string;
    subject?: string;
    asset_url?: string;
  }) => void;
}) {
  const [reviews, setReviews] = useState<ShareReviewResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/share/reviews?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load reviews");
        if (!cancelled) {
          setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load reviews");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [targetType, targetId]);

  async function apply(
    review: ShareReviewResponse,
    opts: { applyCopy: boolean; applyImages: boolean }
  ) {
    setBusyId(review.id);
    setError(null);
    try {
      const res = await fetch("/api/share/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          review_id: review.id,
          apply_copy: opts.applyCopy,
          apply_images: opts.applyImages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not apply review");
      if (data.content) {
        onApplied?.({
          caption: data.content.caption,
          asset_url: data.content.asset_url,
        });
      } else if (data.campaign) {
        onApplied?.({ subject: data.campaign.subject });
      } else if (data.template) {
        onApplied?.({ subject: data.template.subject_default });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply review");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading approval responses…</p>;
  }

  if (!reviews.length) {
    return (
      <p className="text-sm text-muted">
        No share-for-approval responses yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-brand">Approval responses</h3>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      {reviews.map((review, index) => {
        const decisionLabel =
          review.decision === "approved" ? "Approved" : "Changes requested";
        const byLabel = byLabelForDecision(review.decision);
        const isLatest = index === 0;
        return (
          <div
            key={review.id}
            className={`rounded-xl border px-3 py-3 ${
              isLatest ? "border-brand/30 bg-white" : "border-border bg-slate-50"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-brand">
                {decisionLabel}
                {isLatest ? " · latest" : ""}
              </p>
              <p className="text-xs text-muted">
                {review.audience === "client" ? "Client" : "Staff"} ·{" "}
                {new Date(review.created_at).toLocaleString()}
              </p>
            </div>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-medium">{byLabel}:</span>{" "}
              {review.approved_by_name}
              {review.approved_by_role ? ` · ${review.approved_by_role}` : ""}
              {review.approved_by_email ? ` · ${review.approved_by_email}` : ""}
            </p>

            {review.target_type === "content" ? (
              <div className="mt-3">
                <ShareCopyDiff
                  original={review.original_caption}
                  amended={review.amended_caption}
                  label="Caption"
                />
              </div>
            ) : (
              <div className="mt-3">
                <ShareCopyDiff
                  original={review.original_subject}
                  amended={review.amended_subject}
                  label="Subject"
                />
              </div>
            )}

            {review.notes ? (
              <p className="mt-2 text-sm text-slate-700">
                <span className="font-medium">Notes:</span> {review.notes}
              </p>
            ) : null}

            {review.tagged_people.length ? (
              <p className="mt-2 text-sm text-slate-700">
                <span className="font-medium">Tagged:</span>{" "}
                {review.tagged_people
                  .map((p) => (p.email ? `${p.name} (${p.email})` : p.name))
                  .join(", ")}
              </p>
            ) : null}

            {review.added_image_urls.length ? (
              <ul className="mt-2 space-y-1 text-xs">
                {review.added_image_urls.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={busyId === review.id}
                onClick={() =>
                  void apply(review, { applyCopy: true, applyImages: false })
                }
              >
                Apply copy
              </button>
              {review.added_image_urls.length &&
              review.target_type === "content" ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busyId === review.id}
                  onClick={() =>
                    void apply(review, { applyCopy: false, applyImages: true })
                  }
                >
                  Apply images
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
