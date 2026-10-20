-- Optional display name for staff replies (visitor widget label).
alter table public.chat_messages
  add column if not exists author_name text not null default '';
