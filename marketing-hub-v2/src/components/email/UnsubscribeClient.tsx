"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function UnsubscribeClient() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function confirm() {
    if (!token) {
      setStatus("error");
      setMessage("Missing unsubscribe token.");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Could not unsubscribe.");
        return;
      }
      setStatus("done");
      setMessage(
        data.email
          ? `You have been unsubscribed (${data.email}).`
          : "You have been unsubscribed."
      );
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-display text-3xl text-brand">Unsubscribe</h1>
      <p className="mt-2 text-sm text-muted">
        Stop receiving Peters &amp; May marketing emails. You can still receive
        transactional messages related to your account or requests.
      </p>

      {status === "done" ? (
        <p className="mt-6 text-sm text-brand">{message}</p>
      ) : status === "error" ? (
        <p className="mt-6 text-sm text-red-700">{message}</p>
      ) : (
        <button
          type="button"
          disabled={status === "loading" || !token}
          onClick={() => void confirm()}
          className="btn-primary mt-6"
        >
          {status === "loading" ? "Unsubscribing…" : "Confirm unsubscribe"}
        </button>
      )}
    </div>
  );
}
