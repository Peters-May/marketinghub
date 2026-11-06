import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-brand md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted md:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col items-start gap-3 p-8">
      <h2 className="font-display text-xl text-brand">{title}</h2>
      <p className="max-w-lg text-sm text-muted">{description}</p>
      {action}
    </div>
  );
}

export function ModuleCard({
  href,
  title,
  description,
  icon: Icon,
  compact = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Link
        href={href}
        className="surface-card group flex items-center gap-3 p-3.5 transition hover:-translate-y-0.5 hover:border-accent"
      >
        <span className="inline-flex shrink-0 rounded-xl bg-accent-soft p-2.5 text-brand">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display text-lg leading-tight text-brand group-hover:text-brand-soft">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {description}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="surface-card group block p-5 transition hover:-translate-y-0.5 hover:border-accent"
    >
      <div className="mb-4 inline-flex rounded-xl bg-accent-soft p-2.5 text-brand">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <h2 className="font-display text-xl text-brand group-hover:text-brand-soft">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </Link>
  );
}
