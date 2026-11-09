-- Saving clothing catalogue / orders must not download or upload the whole
-- hub_store document (content alone is hundreds of KB). These helpers change
-- only merch collections inside the database.

create or replace function public.hub_merch_slice()
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '15s'
set lock_timeout = '8s'
as $$
  select jsonb_build_object(
    'merch_catalogue', coalesce(payload->'merch_catalogue', '[]'::jsonb),
    'merch_inventory', coalesce(payload->'merch_inventory', '[]'::jsonb),
    'merch_orders', coalesce(payload->'merch_orders', '[]'::jsonb)
  )
  from public.hub_store
  where id = 'default';
$$;

create or replace function public.hub_merch_catalogue_get(p_product_id text)
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
  lateral jsonb_array_elements(coalesce(payload->'merch_catalogue', '[]'::jsonb)) elem
  where id = 'default'
    and p_product_id is not null
    and length(trim(p_product_id)) > 0
    and elem->>'product_id' = p_product_id
  limit 1;
$$;

create or replace function public.hub_merch_catalogue_upsert(p_item jsonb)
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
  v_exists boolean;
begin
  v_id := nullif(trim(p_item->>'product_id'), '');
  if v_id is null then
    return null;
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(h.payload->'merch_catalogue', '[]'::jsonb)) elem
    where elem->>'product_id' = v_id
  )
  into v_exists
  from public.hub_store h
  where h.id = 'default';

  if coalesce(v_exists, false) then
    update public.hub_store h
    set
      payload = jsonb_set(
        h.payload,
        '{merch_catalogue}',
        (
          select jsonb_agg(
            case
              when elem->>'product_id' = v_id then p_item
              else elem
            end
            order by ord
          )
          from jsonb_array_elements(coalesce(h.payload->'merch_catalogue', '[]'::jsonb))
            with ordinality as t(elem, ord)
        ),
        true
      ),
      updated_at = clock_timestamp()
    where h.id = 'default'
    returning p_item into v_stored;
  else
    update public.hub_store h
    set
      payload = jsonb_set(
        h.payload,
        '{merch_catalogue}',
        coalesce(h.payload->'merch_catalogue', '[]'::jsonb) || jsonb_build_array(p_item),
        true
      ),
      updated_at = clock_timestamp()
    where h.id = 'default'
    returning p_item into v_stored;
  end if;

  return v_stored;
end;
$$;

create or replace function public.hub_merch_catalogue_delete(p_product_id text)
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
  if p_product_id is null or length(trim(p_product_id)) = 0 then
    return false;
  end if;

  update public.hub_store h
  set
    payload = jsonb_set(
      h.payload,
      '{merch_catalogue}',
      coalesce(
        (
          select jsonb_agg(elem order by ord)
          from jsonb_array_elements(coalesce(h.payload->'merch_catalogue', '[]'::jsonb))
            with ordinality as t(elem, ord)
          where elem->>'product_id' is distinct from p_product_id
        ),
        '[]'::jsonb
      ),
      true
    ),
    updated_at = clock_timestamp()
  where h.id = 'default'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(h.payload->'merch_catalogue', '[]'::jsonb)) elem
      where elem->>'product_id' = p_product_id
    )
  returning true into v_deleted;

  return coalesce(v_deleted, false);
end;
$$;

create or replace function public.hub_merch_order_insert(p_item jsonb)
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
      '{merch_orders}',
      coalesce(h.payload->'merch_orders', '[]'::jsonb) || jsonb_build_array(p_item),
      true
    ),
    updated_at = clock_timestamp()
  where h.id = 'default'
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(h.payload->'merch_orders', '[]'::jsonb)) elem
      where elem->>'id' = v_id
    )
  returning p_item into v_stored;

  return v_stored;
end;
$$;

revoke all on function public.hub_merch_slice() from public, anon, authenticated;
revoke all on function public.hub_merch_catalogue_get(text) from public, anon, authenticated;
revoke all on function public.hub_merch_catalogue_upsert(jsonb) from public, anon, authenticated;
revoke all on function public.hub_merch_catalogue_delete(text) from public, anon, authenticated;
revoke all on function public.hub_merch_order_insert(jsonb) from public, anon, authenticated;

grant execute on function public.hub_merch_slice() to service_role;
grant execute on function public.hub_merch_catalogue_get(text) to service_role;
grant execute on function public.hub_merch_catalogue_upsert(jsonb) to service_role;
grant execute on function public.hub_merch_catalogue_delete(text) to service_role;
grant execute on function public.hub_merch_order_insert(jsonb) to service_role;

comment on function public.hub_merch_slice() is
  'Read merch catalogue, inventory, and orders without the rest of hub_store.';
comment on function public.hub_merch_catalogue_get(text) is
  'Read one clothing catalogue row without returning the rest of hub_store.';
comment on function public.hub_merch_catalogue_upsert(jsonb) is
  'Insert or replace one clothing catalogue row inside hub_store.';
comment on function public.hub_merch_catalogue_delete(text) is
  'Remove one clothing catalogue row from hub_store.';
comment on function public.hub_merch_order_insert(jsonb) is
  'Append one clothing order to hub_store without rewriting unrelated collections.';
