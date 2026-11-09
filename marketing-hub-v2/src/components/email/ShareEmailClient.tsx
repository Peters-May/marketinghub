"use client";

import { ShareApprovalForm } from "@/components/share/ShareApprovalForm";
import { audienceCopy } from "@/lib/share/review";
import { emailShareDocumentPath } from "@/lib/email/share";
import type { PublicEmailDraft } from "@/lib/email/share";

export function ShareEmailClient({
  draft,
  token,
}: {
  draft: PublicEmailDraft | null;
  token: string;
}) {
  const copy = audienceCopy(draft?.audience ?? "staff");
  const documentPath = emailShareDocumentPath(token);

  return (
    <div className="min-h-screen bg-[var(--background)] text-foreground">
      <header className="border-b border-border bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            {copy.eyebrow}
          </p>
          <h1 className="mt-1 font-display text-3xl text-brand">
            {copy.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-muted">{copy.intro}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {!draft ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <h2 className="font-display text-2xl text-brand">Link unavailable</h2>
            <p className="mt-2 text-sm text-muted">
              This share link is invalid or has been turned off.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Email draft
              </p>
              <p className="mt-1 text-sm font-medium text-brand">{draft.title}</p>
              <p className="mt-1 text-sm text-slate-700">
                Subject: {draft.subject || "(no subject)"}
              </p>
              {draft.sent ? (
                <p className="mt-1 text-xs text-muted">
                  This is the saved copy of a sent email.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  This email has not been sent.
                </p>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-white">
              <iframe
                title="Email preview"
                src={documentPath}
                className="h-[70vh] w-full bg-white"
                sandbox="allow-popups allow-popups-to-escape-sandbox allow-downloads allow-top-navigation-by-user-activation"
              />
            </div>

            <ShareApprovalForm
              token={token}
              audience={draft.audience}
              mode="email"
              initialSubject={draft.subject}
            />
          </>
        )}
      </main>
    </div>
  );
}
