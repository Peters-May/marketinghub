-- Visitor base location for website chat (country or city), captured early for operators.
alter table public.chat_sessions
  add column if not exists visitor_location text not null default '';
