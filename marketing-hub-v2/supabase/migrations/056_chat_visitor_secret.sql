-- Per-session visitor secret for public chat APIs (prevents session IDOR with only CHAT_SITE_KEY).
alter table public.chat_sessions
  add column if not exists visitor_secret text;

comment on column public.chat_sessions.visitor_secret is
  'Random secret returned once at session create; required on subsequent public chat calls.';
