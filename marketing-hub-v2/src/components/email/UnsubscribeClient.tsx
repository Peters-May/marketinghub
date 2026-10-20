"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  EMAIL_PREFERENCE_TOPICS,
  UNSUBSCRIBE_FEEDBACK_REASONS,
  type EmailPreferenceTopic,
  type UnsubscribeFeedbackReason,
} from "@/lib/email/preferences";

type CentreView = "unsubscribe" | "preferences";

function topicLabel(id: EmailPreferenceTopic | null): string {
  if (!id) return "these marketing emails";
  return (
    EMAIL_PREFERENCE_TOPICS.find((topic) => topic.id === id)?.label ??
    "these marketing emails"
  );
}

export function UnsubscribeClient() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const viewParam = params.get("view");
  const view: CentreView =
    viewParam === "preferences" ? "preferences" : "unsubscribe";

  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "done" | "error">(
    token ? "loading" : "error"
  );
  const [message, setMessage] = useState(token ? "" : "This link is missing a token.");
  const [email, setEmail] = useState("");
  /** Topics the person is opted OUT of (API shape). */
  const [optOuts, setOptOuts] = useState<EmailPreferenceTopic[]>([]);
  const [all, setAll] = useState(false);
  const [locked, setLocked] = useState(false);
  const [campaignTopic, setCampaignTopic] = useState<EmailPreferenceTopic | null>(
    null
  );
  const [arrivedOptedOut, setArrivedOptedOut] = useState(false);
  /** Preferences UI: topics the person wants to receive. */
  const [subscribed, setSubscribed] = useState<EmailPreferenceTopic[]>([]);
  /** Unsubscribe UI: stop this list vs stop everything. */
  const [unsubScope, setUnsubScope] = useState<"list" | "all">("list");
  const [feedbackReason, setFeedbackReason] = useState<UnsubscribeFeedbackReason | "">(
    ""
  );
  const [feedbackOther, setFeedbackOther] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/unsubscribe?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setMessage(data.error || "This link is not valid.");
          return;
        }
        setEmail(typeof data.email === "string" ? data.email : "");
        const nextOptOuts = Array.isArray(data.topics) ? data.topics : [];
        const nextAll = Boolean(data.all);
        const topic =
          typeof data.campaign_topic === "string" &&
          EMAIL_PREFERENCE_TOPICS.some((item) => item.id === data.campaign_topic)
            ? (data.campaign_topic as EmailPreferenceTopic)
            : null;
        setOptOuts(nextOptOuts);
        setAll(nextAll);
        setCampaignTopic(topic);
        setArrivedOptedOut(nextAll || nextOptOuts.length > 0);
        setLocked(Boolean(data.locked));
        setUnsubScope(topic ? "list" : "all");
        setSubscribed(
          nextAll
            ? []
            : EMAIL_PREFERENCE_TOPICS.map((item) => item.id).filter(
                (id) => !nextOptOuts.includes(id)
              )
        );
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Something went wrong. Please try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const prefsHref = useMemo(() => {
    const next = new URLSearchParams(params.toString());
    next.set("view", "preferences");
    return `?${next.toString()}`;
  }, [params]);

  const unsubHref = useMemo(() => {
    const next = new URLSearchParams(params.toString());
    next.set("view", "unsubscribe");
    return `?${next.toString()}`;
  }, [params]);

  function toggleSubscribe(id: EmailPreferenceTopic) {
    setSubscribed((current) =>
      current.includes(id) ? current.filter((topic) => topic !== id) : [...current, id]
    );
  }

  const prefsOptOuts = EMAIL_PREFERENCE_TOPICS.map((topic) => topic.id).filter(
    (id) => !subscribed.includes(id)
  );
  const prefsAllOff = subscribed.length === 0;
  const prefsNewlyOptingOut =
    view === "preferences" &&
    ((prefsAllOff && !all) ||
      prefsOptOuts.some((id) => !optOuts.includes(id)));

  const unsubNeedsFeedback =
    view === "unsubscribe" && status === "ready" && !arrivedOptedOut;
  const prefsNeedsFeedback =
    view === "preferences" && prefsNewlyOptingOut && !arrivedOptedOut;

  async function savePreferences() {
    setStatus("saving");
    setMessage("");
    if (prefsNeedsFeedback) {
      if (!feedbackReason) {
        setStatus("ready");
        setMessage("Please choose a reason if you are turning lists off.");
        return;
      }
      if (feedbackReason === "other" && !feedbackOther.trim()) {
        setStatus("ready");
        setMessage("Please tell us a little more.");
        return;
      }
    }
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          topics: prefsOptOuts,
          all: prefsAllOff,
          unsubscribe_reason: prefsNeedsFeedback ? feedbackReason : "",
          unsubscribe_other: prefsNeedsFeedback ? feedbackOther : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("ready");
        setMessage(data.error || "Could not save your preferences.");
        return;
      }
      const nextOptOuts = Array.isArray(data.topics) ? data.topics : prefsOptOuts;
      const nextAll = Boolean(data.all);
      const nextSubscribed = nextAll
        ? []
        : EMAIL_PREFERENCE_TOPICS.map((item) => item.id).filter(
            (id) => !nextOptOuts.includes(id)
          );
      setOptOuts(nextOptOuts);
      setAll(nextAll);
      setSubscribed(nextSubscribed);
      setStatus("done");
      setMessage(
        nextAll
          ? "You are unsubscribed from all Peters & May marketing emails."
          : nextSubscribed.length === EMAIL_PREFERENCE_TOPICS.length
            ? "You are subscribed to all marketing lists."
            : "Your email preferences are saved. You will receive the lists you ticked."
      );
    } catch {
      setStatus("ready");
      setMessage("Something went wrong. Please try again.");
    }
  }

  async function saveUnsubscribe() {
    setStatus("saving");
    setMessage("");
    if (unsubNeedsFeedback) {
      if (!feedbackReason) {
        setStatus("ready");
        setMessage("Please choose a reason for unsubscribing.");
        return;
      }
      if (feedbackReason === "other" && !feedbackOther.trim()) {
        setStatus("ready");
        setMessage("Please tell us a little more.");
        return;
      }
    }
    const wantsAll = unsubScope === "all" || !campaignTopic;
    const topics: EmailPreferenceTopic[] = wantsAll
      ? EMAIL_PREFERENCE_TOPICS.map((topic) => topic.id)
      : Array.from(new Set([...optOuts, campaignTopic!]));
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          topics,
          all: wantsAll,
          unsubscribe_reason: unsubNeedsFeedback ? feedbackReason : "",
          unsubscribe_other: unsubNeedsFeedback ? feedbackOther : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("ready");
        setMessage(data.error || "Could not update your subscription.");
        return;
      }
      setOptOuts(Array.isArray(data.topics) ? data.topics : topics);
      setAll(Boolean(data.all));
      setStatus("done");
      setMessage(
        data.all
          ? "You are unsubscribed from all Peters & May marketing emails."
          : `You are unsubscribed from ${topicLabel(campaignTopic)}.`
      );
    } catch {
      setStatus("ready");
      setMessage("Something went wrong. Please try again.");
    }
  }

  const showFeedback =
    !locked &&
    status !== "loading" &&
    status !== "error" &&
    (unsubNeedsFeedback || prefsNeedsFeedback);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#007DC5]">
        Peters &amp; May
      </p>
      <h1 className="mt-2 font-display text-3xl text-[#0B2545]">
        {view === "preferences" ? "Email preferences" : "Unsubscribe"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {view === "preferences"
          ? "Choose which marketing emails you would like to receive. Operational messages about a booking or quote still arrive."
          : "Stop this marketing list, or leave all marketing email. Operational messages about a booking or quote still arrive."}
      </p>
      {email ? (
        <p className="mt-3 text-sm text-[#0B2545]">{email}</p>
      ) : null}

      {status === "loading" ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : status === "error" && !email ? (
        <p className="mt-6 text-sm text-red-700">{message}</p>
      ) : view === "preferences" ? (
        <fieldset className="mt-6 space-y-3" disabled={locked || status === "saving"}>
          <legend className="text-sm font-semibold text-[#0B2545]">
            Subscribe me to
          </legend>
          {EMAIL_PREFERENCE_TOPICS.map((topic) => (
            <label key={topic.id} className="flex items-start gap-3 text-sm text-[#0B2545]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={subscribed.includes(topic.id)}
                onChange={() => toggleSubscribe(topic.id)}
              />
              <span>{topic.label}</span>
            </label>
          ))}
          <p className="text-xs text-muted">
            Untick a list to stop it. Tick again to subscribe.
          </p>
        </fieldset>
      ) : (
        <fieldset className="mt-6 space-y-3" disabled={locked || status === "saving"}>
          <legend className="text-sm font-semibold text-[#0B2545]">
            Stop receiving
          </legend>
          {campaignTopic ? (
            <label className="flex items-start gap-3 text-sm text-[#0B2545]">
              <input
                type="radio"
                name="unsub-scope"
                className="mt-0.5"
                checked={unsubScope === "list"}
                onChange={() => setUnsubScope("list")}
              />
              <span>{topicLabel(campaignTopic)} only</span>
            </label>
          ) : null}
          <label className="flex items-start gap-3 text-sm font-medium text-[#0B2545]">
            <input
              type="radio"
              name="unsub-scope"
              className="mt-0.5"
              checked={unsubScope === "all" || !campaignTopic}
              onChange={() => setUnsubScope("all")}
            />
            <span>All Peters &amp; May marketing email</span>
          </label>
        </fieldset>
      )}

      {showFeedback ? (
        <fieldset className="mt-6 space-y-3" disabled={status === "saving"}>
          <legend className="text-sm font-semibold text-[#0B2545]">
            Why are you unsubscribing?
          </legend>
          <p className="text-xs text-muted">
            This helps us improve what we send. It is not shared outside the team.
          </p>
          {UNSUBSCRIBE_FEEDBACK_REASONS.map((reason) => (
            <label
              key={reason.id}
              className="flex items-start gap-3 text-sm text-[#0B2545]"
            >
              <input
                type="radio"
                name="unsubscribe-reason"
                className="mt-0.5"
                checked={feedbackReason === reason.id}
                onChange={() => setFeedbackReason(reason.id)}
              />
              <span>{reason.label}</span>
            </label>
          ))}
          {feedbackReason === "other" ? (
            <label className="block text-sm text-[#0B2545]">
              <span className="sr-only">Tell us more</span>
              <textarea
                rows={3}
                value={feedbackOther}
                onChange={(e) => setFeedbackOther(e.target.value)}
                maxLength={280}
                placeholder="Tell us a little more"
                className="mt-1 w-full rounded-md border border-[#E3E6E9] px-3 py-2 text-sm text-[#0B2545] outline-none focus:border-[#007DC5]"
              />
            </label>
          ) : null}
        </fieldset>
      ) : null}

      {locked ? (
        <p className="mt-4 text-sm text-[#0B2545]">
          This address is stopped because messages could not be delivered.
        </p>
      ) : null}

      {status === "done" ? (
        <p className="mt-4 text-sm text-[#0B2545]">{message}</p>
      ) : null}
      {status === "ready" && message ? (
        <p className="mt-4 text-sm text-red-700">{message}</p>
      ) : null}

      {!locked && status !== "loading" && status !== "error" ? (
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() =>
            void (view === "preferences" ? savePreferences() : saveUnsubscribe())
          }
          className="btn-primary mt-6"
        >
          {status === "saving"
            ? "Saving…"
            : view === "preferences"
              ? "Save preferences"
              : "Unsubscribe"}
        </button>
      ) : null}

      {!locked && status !== "loading" && status !== "error" ? (
        <p className="mt-4 text-sm text-muted">
          {view === "unsubscribe" ? (
            <>
              Want to stay on some lists?{" "}
              <a href={prefsHref} className="text-[#007DC5] underline">
                Manage preferences
              </a>
            </>
          ) : (
            <>
              Prefer to leave altogether?{" "}
              <a href={unsubHref} className="text-[#007DC5] underline">
                Unsubscribe
              </a>
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
