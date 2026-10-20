"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  EMAIL_PREFERENCE_TOPICS,
  UNSUBSCRIBE_FEEDBACK_REASONS,
  type EmailPreferenceTopic,
  type UnsubscribeFeedbackReason,
} from "@/lib/email/preferences";

export function UnsubscribeClient() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "done" | "error">(
    token ? "loading" : "error"
  );
  const [message, setMessage] = useState(token ? "" : "This link is missing a token.");
  const [email, setEmail] = useState("");
  const [topics, setTopics] = useState<EmailPreferenceTopic[]>([]);
  const [all, setAll] = useState(false);
  const [locked, setLocked] = useState(false);
  const [arrivedOptedOut, setArrivedOptedOut] = useState(false);
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
        const nextTopics = Array.isArray(data.topics) ? data.topics : [];
        const nextAll = Boolean(data.all);
        setTopics(nextTopics);
        setAll(nextAll);
        setArrivedOptedOut(nextAll || nextTopics.length > 0);
        setLocked(Boolean(data.locked));
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

  function toggle(id: EmailPreferenceTopic) {
    setTopics((current) =>
      current.includes(id) ? current.filter((topic) => topic !== id) : [...current, id]
    );
  }

  const isOptingOut = all || topics.length > 0;
  const needsFeedback = isOptingOut && !arrivedOptedOut;

  async function save() {
    setStatus("saving");
    setMessage("");
    if (needsFeedback) {
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
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          topics,
          all,
          unsubscribe_reason: needsFeedback ? feedbackReason : "",
          unsubscribe_other: needsFeedback ? feedbackOther : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("ready");
        setMessage(data.error || "Could not save your preferences.");
        return;
      }
      setTopics(Array.isArray(data.topics) ? data.topics : topics);
      setAll(Boolean(data.all));
      setStatus("done");
      setMessage(
        data.all
          ? "You are unsubscribed from all Peters & May marketing emails."
          : data.topics?.length
            ? "Your email preferences are saved."
            : "You will keep receiving these marketing emails."
      );
    } catch {
      setStatus("ready");
      setMessage("Something went wrong. Please try again.");
    }
  }

  const chosen = all
    ? EMAIL_PREFERENCE_TOPICS.map((topic) => topic.label)
    : EMAIL_PREFERENCE_TOPICS.filter((topic) => topics.includes(topic.id)).map(
        (topic) => topic.label
      );

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#007DC5]">
        Peters &amp; May
      </p>
      <h1 className="mt-2 font-display text-3xl text-[#0B2545]">Email preferences</h1>
      <p className="mt-2 text-sm text-muted">
        Choose which marketing emails to stop. Messages about a booking, quote, or
        required information form still arrive.
      </p>
      {email ? (
        <p className="mt-3 text-sm text-[#0B2545]">{email}</p>
      ) : null}

      {status === "loading" ? (
        <p className="mt-6 text-sm text-muted">Loading your preferences…</p>
      ) : status === "error" && !email ? (
        <p className="mt-6 text-sm text-red-700">{message}</p>
      ) : (
        <fieldset className="mt-6 space-y-3" disabled={locked || status === "saving"}>
          <legend className="text-sm font-semibold text-[#0B2545]">Stop these emails</legend>
          {EMAIL_PREFERENCE_TOPICS.map((topic) => (
            <label key={topic.id} className="flex items-start gap-3 text-sm text-[#0B2545]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={all || topics.includes(topic.id)}
                disabled={all}
                onChange={() => toggle(topic.id)}
              />
              <span>{topic.label}</span>
            </label>
          ))}
          <label className="flex items-start gap-3 border-t border-[#E3E6E9] pt-3 text-sm font-medium text-[#0B2545]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={all}
              onChange={() => setAll((current) => !current)}
            />
            <span>Unsubscribe from all</span>
          </label>
        </fieldset>
      )}

      {!locked && status !== "loading" && status !== "error" && needsFeedback ? (
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
      {status === "done" && chosen.length > 0 && !all ? (
        <p className="mt-2 text-sm text-muted">Stopped: {chosen.join(", ")}.</p>
      ) : null}
      {status === "ready" && message ? (
        <p className="mt-4 text-sm text-red-700">{message}</p>
      ) : null}

      {!locked && status !== "loading" && status !== "error" ? (
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() => void save()}
          className="btn-primary mt-6"
        >
          {status === "saving" ? "Saving…" : "Save preferences"}
        </button>
      ) : null}
    </div>
  );
}
