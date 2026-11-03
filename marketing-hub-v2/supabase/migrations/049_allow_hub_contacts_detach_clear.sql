-- Allow hub_contacts_detach to empty hub_store.contacts once rows live in
-- hub_contact_records. The backup / portal-list triggers were restoring the
-- full contacts array on every clear attempt.

create or replace function public.hub_store_backup_before_loss()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  keys text[] := array[
    'contacts','events','content','tasks','email_campaigns','email_audiences',
    'media_lists','resources','email_events','budget_lines','budget_payments',
    'sponsorships','access_requests','merch_orders','staff_requests',
    'pr_pitches','awards','themes','email_templates','pr_coverage'
  ];
  k text;
  old_n int;
  new_n int;
  old_first text;
  new_first text;
  reasons text[] := '{}';
  restored jsonb;
  contact_rows int;
begin
  if tg_op <> 'UPDATE' or new.payload is null or old.payload is null then
    return new;
  end if;
  restored := new.payload;
  select count(*) into contact_rows from public.hub_contact_records;
  foreach k in array keys loop
    old_n := coalesce(jsonb_array_length(old.payload -> k), 0);
    new_n := coalesce(jsonb_array_length(restored -> k), 0);
    old_first := coalesce(old.payload -> k -> 0 ->> 'id', '');
    new_first := coalesce(restored -> k -> 0 ->> 'id', '');
    if k = 'contacts' and new_n = 0 and contact_rows >= greatest(old_n, 1) then
      continue;
    end if;
    if (old_n >= 8 and new_n * 2 < old_n)
      or (old_n >= 5 and new_n = 0)
      or (old_n >= 5 and position('_seed_' in new_first) > 0 and position('_seed_' in old_first) = 0)
    then
      restored := jsonb_set(restored, array[k], coalesce(old.payload -> k, '[]'::jsonb), true);
      reasons := array_append(reasons, k);
    end if;
  end loop;
  if reasons = '{}' then
    return new;
  end if;
  insert into public.hub_store_backups (store_id, payload, attempted_payload, reason, source_updated_at)
  values (old.id, old.payload, new.payload, 'kept ' || array_to_string(reasons, ', '), old.updated_at);
  delete from public.hub_store_backups
  where store_id = old.id
    and id not in (
      select id from public.hub_store_backups
      where store_id = old.id
      order by backed_up_at desc, id desc
      limit 20
    );
  new.payload := restored;
  return new;
end;
$function$;

create or replace function public.hub_store_keep_portal_lists()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  old_audience_count int;
  new_audience_count int;
  kept_audiences jsonb;
  kept_lists jsonb;
  merged_contacts jsonb;
  contact_rows int;
  new_contact_count int;
begin
  if tg_op <> 'UPDATE' or new.payload is null or old.payload is null then
    return new;
  end if;

  select count(*) into contact_rows from public.hub_contact_records;
  new_contact_count := coalesce(jsonb_array_length(new.payload->'contacts'), 0);

  if new_contact_count = 0 and contact_rows > 0 then
    select count(*) into old_audience_count
    from jsonb_array_elements(coalesce(old.payload->'email_audiences', '[]'::jsonb)) a
    where coalesce(a->>'portal_list_id', '') <> '';

    select count(*) into new_audience_count
    from jsonb_array_elements(coalesce(new.payload->'email_audiences', '[]'::jsonb)) a
    where coalesce(a->>'portal_list_id', '') <> '';

    if old_audience_count = 0 or new_audience_count > 0 then
      return new;
    end if;

    select coalesce(jsonb_agg(a), '[]'::jsonb) into kept_audiences
    from jsonb_array_elements(coalesce(old.payload->'email_audiences', '[]'::jsonb)) a
    where coalesce(a->>'portal_list_id', '') <> '';

    select coalesce(jsonb_agg(l), '[]'::jsonb) into kept_lists
    from jsonb_array_elements(coalesce(old.payload->'media_lists', '[]'::jsonb)) l
    where coalesce(l->>'portal_list_id', '') <> ''
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(new.payload->'media_lists', '[]'::jsonb)) n
        where n->>'portal_list_id' = l->>'portal_list_id'
      );

    new.payload := jsonb_set(
      new.payload,
      '{email_audiences}',
      coalesce(new.payload->'email_audiences', '[]'::jsonb) || kept_audiences,
      true
    );
    new.payload := jsonb_set(
      new.payload,
      '{media_lists}',
      coalesce(new.payload->'media_lists', '[]'::jsonb) || kept_lists,
      true
    );
    return new;
  end if;

  select count(*) into old_audience_count
  from jsonb_array_elements(coalesce(old.payload->'email_audiences', '[]'::jsonb)) a
  where coalesce(a->>'portal_list_id', '') <> '';

  select count(*) into new_audience_count
  from jsonb_array_elements(coalesce(new.payload->'email_audiences', '[]'::jsonb)) a
  where coalesce(a->>'portal_list_id', '') <> '';

  if old_audience_count = 0 or new_audience_count > 0 then
    return new;
  end if;

  select coalesce(jsonb_agg(a), '[]'::jsonb) into kept_audiences
  from jsonb_array_elements(coalesce(old.payload->'email_audiences', '[]'::jsonb)) a
  where coalesce(a->>'portal_list_id', '') <> '';

  select coalesce(jsonb_agg(l), '[]'::jsonb) into kept_lists
  from jsonb_array_elements(coalesce(old.payload->'media_lists', '[]'::jsonb)) l
  where coalesce(l->>'portal_list_id', '') <> ''
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(new.payload->'media_lists', '[]'::jsonb)) n
      where n->>'portal_list_id' = l->>'portal_list_id'
    );

  with new_contacts as (
    select value as contact, lower(value->>'email') as email
    from jsonb_array_elements(coalesce(new.payload->'contacts', '[]'::jsonb))
  ),
  old_portal as (
    select distinct on (lower(value->>'email'))
      value as contact,
      lower(value->>'email') as email
    from jsonb_array_elements(coalesce(old.payload->'contacts', '[]'::jsonb))
    where coalesce(value->>'portal_contact_id', '') <> ''
    order by lower(value->>'email')
  ),
  patched as (
    select
      case
        when old_portal.contact is null then new_contacts.contact
        else new_contacts.contact || jsonb_build_object(
          'portal_contact_id', old_portal.contact->'portal_contact_id',
          'marketing_consent',
          case
            when old_portal.contact->>'marketing_consent' = 'true' then to_jsonb(true)
            else new_contacts.contact->'marketing_consent'
          end
        )
      end as contact
    from new_contacts
    left join old_portal on old_portal.email = new_contacts.email
  ),
  added as (
    select old_portal.contact
    from old_portal
    where old_portal.email <> ''
      and not exists (
        select 1 from new_contacts where new_contacts.email = old_portal.email
      )
  )
  select coalesce(jsonb_agg(contact), '[]'::jsonb) into merged_contacts
  from (
    select contact from patched
    union all
    select contact from added
  ) combined;

  new.payload := jsonb_set(
    new.payload,
    '{email_audiences}',
    coalesce(new.payload->'email_audiences', '[]'::jsonb) || kept_audiences,
    true
  );
  new.payload := jsonb_set(
    new.payload,
    '{media_lists}',
    coalesce(new.payload->'media_lists', '[]'::jsonb) || kept_lists,
    true
  );
  new.payload := jsonb_set(new.payload, '{contacts}', merged_contacts, true);

  return new;
end;
$function$;
