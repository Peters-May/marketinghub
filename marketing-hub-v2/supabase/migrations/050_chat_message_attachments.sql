-- Yacht/cargo spec screenshots and PDFs on website chat messages.
alter table public.chat_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
