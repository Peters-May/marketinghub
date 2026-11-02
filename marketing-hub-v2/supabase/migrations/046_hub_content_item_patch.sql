-- Saving one content post must not download or upload the whole hub_store
-- document. Contacts alone are several megabytes, and that round trip was
-- timing out behind Cloudflare. These functions change one content element
-- inside the database.

create or replace function public.hub_content_get(p_content_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '15s'
set lock_timeout = '8s'
as $$
  select elem
  from public.hub_store,
  lateral jsonb_array_elements(payload->'content') elem
  where id = 'default'
    and p_content_id is not null
    and length(trim(p_content_id)) > 0
    and elem->>'id' = p_content_id
  limit 1;
$$;

create or replace function public.hub_content_replace(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
set lock_timeout = '15s'
as $$
declare
  v_id text;
  v_stored jsonb;
begin
  v_id := nullif(trim(p_item->>'id'), '');
  if v_id is null then
    return null;
  end if;

  update public.hub_store h
  set
    payload = jsonb_set(
      h.payload,
      '{content}',
      (
        select jsonb_agg(
          case
            when elem->>'id' = v_id then p_item
            else elem
          end
          order by ord
        )
        from jsonb_array_elements(h.payload->'content')
          with ordinality as t(elem, ord)
      ),
      true
    ),
    updated_at = clock_timestamp()
  where h.id = 'default'
    and exists (
      select 1
      from jsonb_array_elements(h.payload->'content') elem
      where elem->>'id' = v_id
    )
  returning p_item into v_stored;

  return v_stored;
end;
$$;

create or replace function public.hub_content_insert(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
set lock_timeout = '15s'
as $$
declare
  v_id text;
  v_stored jsonb;
begin
  v_id := nullif(trim(p_item->>'id'), '');
  if v_id is null then
    return null;
  end if;

  update public.hub_store h
  set
    payload = jsonb_set(
      h.payload,
      '{content}',
      coalesce(h.payload->'content', '[]'::jsonb) || jsonb_build_array(p_item),
      true
    ),
    updated_at = clock_timestamp()
  where h.id = 'default'
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(h.payload->'content', '[]'::jsonb)) elem
      where elem->>'id' = v_id
    )
  returning p_item into v_stored;

  return v_stored;
end;
$$;

create or replace function public.hub_content_delete(p_content_id text)
returns boolean
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
set lock_timeout = '15s'
as $$
declare
  v_deleted boolean;
begin
  if p_content_id is null or length(trim(p_content_id)) = 0 then
    return false;
  end if;

  update public.hub_store h
  set
    payload = jsonb_set(
      h.payload,
      '{content}',
      coalesce(
        (
          select jsonb_agg(elem order by ord)
          from jsonb_array_elements(h.payload->'content')
            with ordinality as t(elem, ord)
          where elem->>'id' is distinct from p_content_id
        ),
        '[]'::jsonb
      ),
      true
    ),
    updated_at = clock_timestamp()
  where h.id = 'default'
    and exists (
      select 1
      from jsonb_array_elements(h.payload->'content') elem
      where elem->>'id' = p_content_id
    )
  returning true into v_deleted;

  return coalesce(v_deleted, false);
end;
$$;

revoke all on function public.hub_content_get(text) from public, anon, authenticated;
revoke all on function public.hub_content_replace(jsonb) from public, anon, authenticated;
revoke all on function public.hub_content_insert(jsonb) from public, anon, authenticated;
revoke all on function public.hub_content_delete(text) from public, anon, authenticated;

grant execute on function public.hub_content_get(text) to service_role;
grant execute on function public.hub_content_replace(jsonb) to service_role;
grant execute on function public.hub_content_insert(jsonb) to service_role;
grant execute on function public.hub_content_delete(text) to service_role;

comment on function public.hub_content_get(text) is
  'Read one content post from hub_store without returning the rest of the document.';
comment on function public.hub_content_replace(jsonb) is
  'Replace one content post inside hub_store. Does not round-trip contacts or other collections.';
comment on function public.hub_content_insert(jsonb) is
  'Append one content post to hub_store.';
comment on function public.hub_content_delete(text) is
  'Remove one content post from hub_store.';
