-- Website chatbot (WordPress plugin → Marketing Hub).

create table if not exists public.chat_settings (
  id text primary key default 'default',
  deployed boolean not null default false,
  greeting text not null default 'How can we help?',
  guidance text not null default '',
  office_hours_note text not null default 'Our team typically replies during UK business hours.',
  notify_email text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.chat_settings (id, deployed, greeting, guidance)
values (
  'default',
  false,
  'How can we help?',
  'Answer only from the knowledge base. Use British English. Never invent rates, capacity, clients, case studies, or company figures. If unsure or the visitor asks for a quote, rates, or a person, offer to connect them with the team and ask for a business email.'
)
on conflict (id) do nothing;

create table if not exists public.chat_kb_documents (
  id text primary key,
  title text not null default '',
  source_url text not null default '',
  body text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_kb_documents_active_idx
  on public.chat_kb_documents (active, sort_order);

create table if not exists public.chat_sessions (
  id text primary key,
  status text not null default 'ai'
    check (status in ('ai', 'waiting', 'human', 'closed')),
  page_url text not null default '',
  page_title text not null default '',
  referrer text not null default '',
  utm jsonb not null default '{}'::jsonb,
  visitor_name text not null default '',
  visitor_email text not null default '',
  visitor_company text not null default '',
  enquiry_id text,
  assignee_email text not null default '',
  is_test boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_status_idx
  on public.chat_sessions (status, last_message_at desc);

create index if not exists chat_sessions_created_at_idx
  on public.chat_sessions (created_at desc);

create table if not exists public.chat_messages (
  id text primary key,
  session_id text not null references public.chat_sessions (id) on delete cascade,
  role text not null check (role in ('visitor', 'assistant', 'staff', 'system')),
  body text not null default '',
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_idx
  on public.chat_messages (session_id, created_at);

alter table public.chat_settings enable row level security;
alter table public.chat_kb_documents enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "hub_staff_chat_settings" on public.chat_settings;
create policy "hub_staff_chat_settings" on public.chat_settings
  for all to authenticated
  using (public.is_hub_staff())
  with check (public.is_hub_staff());

drop policy if exists "hub_staff_chat_kb" on public.chat_kb_documents;
create policy "hub_staff_chat_kb" on public.chat_kb_documents
  for all to authenticated
  using (public.is_hub_staff())
  with check (public.is_hub_staff());

drop policy if exists "hub_staff_chat_sessions" on public.chat_sessions;
create policy "hub_staff_chat_sessions" on public.chat_sessions
  for all to authenticated
  using (public.is_hub_staff())
  with check (public.is_hub_staff());

drop policy if exists "hub_staff_chat_messages" on public.chat_messages;
create policy "hub_staff_chat_messages" on public.chat_messages
  for all to authenticated
  using (public.is_hub_staff())
  with check (public.is_hub_staff());

-- Seed starter public FAQ (marketing can edit in Hub).
insert into public.chat_kb_documents (id, title, source_url, body, active, sort_order)
values
  (
    'kb_seed_about',
    'About Peters & May',
    'https://www.petersandmay.com/',
    'Peters & May is a bespoke logistics group. We bring experienced thinking to complex logistics. Divisions include Global Yacht Transport, Global Freight Forwarding, and Commercial Marine Transport. One Group identity sits above the divisions.',
    true,
    10
  ),
  (
    'kb_seed_yacht',
    'Yacht transport',
    'https://www.petersandmay.com/',
    'Peters & May Global Yacht Transport moves yachts for owners, captains, brokers and manufacturers. For a quote, the team needs vessel details, collection and delivery locations, and preferred timing. We do not publish rates in chat — ask the visitor for a business email so the team can follow up.',
    true,
    20
  ),
  (
    'kb_seed_freight',
    'Freight forwarding',
    'https://www.petersandmay.com/',
    'Peters & May Global Freight Forwarding handles freight, customs and industrial shipments. For help, collect cargo type, origin, destination, and timing, then invite a human follow-up with a business email.',
    true,
    30
  ),
  (
    'kb_seed_marine',
    'Commercial marine',
    'https://www.petersandmay.com/',
    'Peters & May Commercial Marine Transport supports commercial marine and project teams. Direct complex operational questions to the team via Speak to the team or a business email.',
    true,
    40
  ),
  (
    'kb_seed_contact',
    'Contact and quotes',
    'https://www.petersandmay.com/',
    'Visitors can use the website quote form or this chat. Chat can answer general public questions. Quotes, rates, capacity and account-specific questions must go to the human team. Never invent prices or promise capacity.',
    true,
    50
  )
on conflict (id) do nothing;
