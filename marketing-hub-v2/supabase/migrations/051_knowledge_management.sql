-- Knowledge management: content change detection + internal Hub help docs.

alter table public.chat_kb_documents
  add column if not exists content_hash text not null default '';

create index if not exists chat_kb_documents_content_hash_idx
  on public.chat_kb_documents (content_hash);

-- Internal how-to / approved Hub assistant knowledge (never used by Online Chat).
create table if not exists public.hub_help_documents (
  id text primary key,
  title text not null default '',
  body text not null default '',
  source_url text not null default '',
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hub_help_documents_active_idx
  on public.hub_help_documents (active, sort_order);

alter table public.hub_help_documents enable row level security;

drop policy if exists "hub_staff_hub_help_documents" on public.hub_help_documents;
create policy "hub_staff_hub_help_documents" on public.hub_help_documents
  for all to authenticated
  using (public.is_hub_staff())
  with check (public.is_hub_staff());
