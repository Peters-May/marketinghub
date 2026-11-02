-- Website chat is off for members until an admin grants it.
-- Admins and the SEO role keep access in the app without this flag.

alter table public.profiles
  add column if not exists website_chat boolean not null default false;

comment on column public.profiles.website_chat is
  'When true, a member can open Website chat. Admins and SEO users can open it without this flag.';

-- Members may update their own profile (non-role fields). Stop them granting themselves chat.
create or replace function public.protect_profile_website_chat()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.website_chat := false;
    return new;
  end if;
  new.website_chat := old.website_chat;
  return new;
end;
$$;

drop trigger if exists protect_profile_website_chat on public.profiles;
create trigger protect_profile_website_chat
  before insert or update on public.profiles
  for each row
  execute function public.protect_profile_website_chat();
