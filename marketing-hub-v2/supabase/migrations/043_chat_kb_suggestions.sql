-- Website chat learning queue: recurring visitor questions for staff review.
create table if not exists public.chat_kb_suggestions (
  id text primary key,
  question_key text not null unique,
  question text not null default '',
  sample_answer text not null default '',
  hit_count integer not null default 1,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'dismissed')),
  last_session_id text,
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_kb_suggestions_status_idx
  on public.chat_kb_suggestions (status, hit_count desc, updated_at desc);

alter table public.chat_kb_suggestions enable row level security;

drop policy if exists "hub_staff_chat_kb_suggestions" on public.chat_kb_suggestions;
create policy "hub_staff_chat_kb_suggestions" on public.chat_kb_suggestions
  for all to authenticated
  using (public.is_hub_staff())
  with check (public.is_hub_staff());
