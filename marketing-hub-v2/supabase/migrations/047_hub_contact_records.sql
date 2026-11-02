-- Contacts are about three quarters of hub_store. Every page read and every
-- save was moving that list. These helpers keep contacts in their own rows.
-- The document is emptied by hub_contacts_detach, which the app calls once
-- it is deployed. Until then the payload copy stays, so the current app
-- keeps working.

create table if not exists public.hub_contact_records (
  id text primary key,
  email text not null default '',
  user_id text,
  portal_contact_id text,
  marketing_consent boolean,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists hub_contact_records_email_idx
  on public.hub_contact_records (email);

create index if not exists hub_contact_records_user_idx
  on public.hub_contact_records (user_id)
  where user_id is not null;

create index if not exists hub_contact_records_portal_idx
  on public.hub_contact_records (portal_contact_id)
  where portal_contact_id is not null;

alter table public.hub_contact_records enable row level security;

revoke all on table public.hub_contact_records from public, anon, authenticated;
grant select, insert, update, delete on table public.hub_contact_records to service_role;

insert into public.hub_contact_records (
  id, email, user_id, portal_contact_id, marketing_consent, payload, updated_at
)
select distinct on (elem->>'id')
  elem->>'id',
  lower(trim(coalesce(elem->>'email', ''))),
  nullif(elem->>'user_id', ''),
  nullif(elem->>'portal_contact_id', ''),
  case elem->>'marketing_consent'
    when 'true' then true
    when 'false' then false
    else null
  end,
  elem,
  coalesce(
    case
      when coalesce(elem->>'updated_at', '') ~ '^[0-9]{4}-'
        then (elem->>'updated_at')::timestamptz
      else null
    end,
    now()
  )
from public.hub_store,
lateral jsonb_array_elements(coalesce(payload->'contacts', '[]'::jsonb)) elem
where id = 'default'
  and coalesce(elem->>'id', '') <> ''
order by elem->>'id', elem->>'updated_at' desc nulls last
on conflict (id) do nothing;

create or replace function public.hub_contacts_detach()
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
set lock_timeout = '30s'
as $$
declare
  v_count integer;
begin
  select coalesce(jsonb_array_length(coalesce(payload->'contacts', '[]'::jsonb)), 0)
  into v_count
  from public.hub_store
  where id = 'default';

  if coalesce(v_count, 0) = 0 then
    return 0;
  end if;

  insert into public.hub_contact_records (
    id, email, user_id, portal_contact_id, marketing_consent, payload, updated_at
  )
  select distinct on (elem->>'id')
    elem->>'id',
    lower(trim(coalesce(elem->>'email', ''))),
    nullif(elem->>'user_id', ''),
    nullif(elem->>'portal_contact_id', ''),
    case elem->>'marketing_consent'
      when 'true' then true
      when 'false' then false
      else null
    end,
    elem,
    coalesce(
      case
        when coalesce(elem->>'updated_at', '') ~ '^[0-9]{4}-'
          then (elem->>'updated_at')::timestamptz
        else null
      end,
      now()
    )
  from public.hub_store,
  lateral jsonb_array_elements(payload->'contacts') elem
  where id = 'default'
    and coalesce(elem->>'id', '') <> ''
  order by elem->>'id', elem->>'updated_at' desc nulls last
  on conflict (id) do update set
    email = excluded.email,
    user_id = excluded.user_id,
    portal_contact_id = excluded.portal_contact_id,
    marketing_consent = excluded.marketing_consent,
    payload = excluded.payload,
    updated_at = excluded.updated_at
  where public.hub_contact_records.updated_at <= excluded.updated_at;

  update public.hub_store
  set
    payload = jsonb_set(payload, '{contacts}', '[]'::jsonb, true),
    updated_at = clock_timestamp()
  where id = 'default';

  return v_count;
end;
$$;

create or replace function public.hub_store_read_core(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '30s'
set lock_timeout = '8s'
as $$
  select jsonb_build_object(
    'payload', jsonb_set(
      payload,
      '{contacts}',
      '[]'::jsonb,
      true
    ),
    'updated_at', updated_at
  )
  from public.hub_store
  where id = p_id;
$$;

create or replace function public.hub_contacts_upsert_members(p_members jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
set lock_timeout = '15s'
as $$
declare
  m jsonb;
  v_email text;
  v_existing jsonb;
  v_id text;
  v_name text;
  v_org text;
  v_tags jsonb;
  v_next jsonb;
  v_now text := to_char(
    clock_timestamp() at time zone 'utc',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  v_seen jsonb := '{}'::jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_portal text;
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array' then
    return '[]'::jsonb;
  end if;

  for m in select value from jsonb_array_elements(p_members)
  loop
    v_email := lower(trim(coalesce(m->>'email', '')));
    if v_email = '' or v_seen ? v_email then
      continue;
    end if;
    v_seen := v_seen || jsonb_build_object(v_email, true);

    select payload into v_existing
    from public.hub_contact_records
    where email = v_email
    limit 1;

    if v_existing is null then
      v_id := 'ctc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    else
      v_id := v_existing->>'id';
    end if;

    v_name := nullif(trim(coalesce(m->>'name', '')), '');
    if v_name is null then
      v_name := nullif(trim(coalesce(v_existing->>'name', '')), '');
    end if;
    if v_name is null then
      v_name := v_email;
    end if;

    v_org := nullif(trim(coalesce(v_existing->>'organisation', '')), '');
    if v_org is null then
      v_org := trim(coalesce(m->>'organisation', ''));
    end if;

    if jsonb_typeof(v_existing->'tags') = 'array' then
      v_tags := v_existing->'tags';
    else
      v_tags := '[]'::jsonb;
    end if;
    if not (v_tags @> '["portal"]'::jsonb) then
      v_tags := v_tags || '["portal"]'::jsonb;
    end if;

    v_portal := nullif(trim(coalesce(m->>'portalContactId', '')), '');
    if v_portal is null then
      v_portal := nullif(v_existing->>'portal_contact_id', '');
    end if;

    if v_existing is null then
      v_next := jsonb_build_object(
        'id', v_id,
        'kind', 'person',
        'name', v_name,
        'organisation', coalesce(v_org, ''),
        'role', '',
        'email', v_email,
        'phone', '',
        'website', '',
        'services', '',
        'tags', v_tags,
        'notes', '',
        'user_id', null,
        'is_press', false,
        'is_spokesperson', false,
        'beat', '',
        'outlet', '',
        'country', '',
        'preferred_topics', '',
        'last_contacted_at', null,
        'marketing_consent', true,
        'email_topic_opt_outs', '[]'::jsonb,
        'portal_contact_id', v_portal,
        'created_at', v_now,
        'updated_at', v_now
      );
    else
      v_next := v_existing || jsonb_build_object(
        'id', v_id,
        'name', v_name,
        'organisation', coalesce(v_org, ''),
        'email', v_email,
        'tags', v_tags,
        'marketing_consent', true,
        'portal_contact_id', v_portal,
        'updated_at', v_now
      );
    end if;

    insert into public.hub_contact_records (
      id, email, user_id, portal_contact_id, marketing_consent, payload, updated_at
    )
    values (
      v_id,
      v_email,
      nullif(v_next->>'user_id', ''),
      v_portal,
      true,
      v_next,
      clock_timestamp()
    )
    on conflict (id) do update set
      email = excluded.email,
      user_id = excluded.user_id,
      portal_contact_id = excluded.portal_contact_id,
      marketing_consent = excluded.marketing_consent,
      payload = excluded.payload,
      updated_at = excluded.updated_at;

    v_ids := v_ids || to_jsonb(v_id);
  end loop;

  return v_ids;
end;
$$;

create or replace function public.hub_contacts_revoke_consent(
  p_keep text[],
  p_listed text[]
)
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
set lock_timeout = '15s'
as $$
declare
  v_now text := to_char(
    clock_timestamp() at time zone 'utc',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  v_count integer;
begin
  update public.hub_contact_records
  set
    marketing_consent = false,
    payload = jsonb_set(
      jsonb_set(payload, '{marketing_consent}', 'false'::jsonb, true),
      '{updated_at}',
      to_jsonb(v_now),
      true
    ),
    updated_at = clock_timestamp()
  where portal_contact_id is not null
    and marketing_consent is distinct from false
    and not (id = any(coalesce(p_keep, '{}'::text[])))
    and not (id = any(coalesce(p_listed, '{}'::text[])));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.hub_contacts_detach() from public, anon, authenticated;
revoke all on function public.hub_store_read_core(text) from public, anon, authenticated;
revoke all on function public.hub_contacts_upsert_members(jsonb) from public, anon, authenticated;
revoke all on function public.hub_contacts_revoke_consent(text[], text[]) from public, anon, authenticated;

grant execute on function public.hub_contacts_detach() to service_role;
grant execute on function public.hub_store_read_core(text) to service_role;
grant execute on function public.hub_contacts_upsert_members(jsonb) to service_role;
grant execute on function public.hub_contacts_revoke_consent(text[], text[]) to service_role;
