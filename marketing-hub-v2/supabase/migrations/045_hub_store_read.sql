-- Reading hub_store goes through the API role, whose statement_timeout is 8s.
-- A large document read that is waiting on a rewrite, or sharing the database
-- with other readers, was cancelled and the page rendered as a server error.
-- This function raises the limit for that one read only.

create or replace function public.hub_store_read(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '30s'
set lock_timeout = '8s'
as $$
  select jsonb_build_object(
    'payload', payload,
    'updated_at', updated_at
  )
  from public.hub_store
  where id = p_id;
$$;

revoke all on function public.hub_store_read(text) from public;
grant execute on function public.hub_store_read(text) to service_role;

comment on function public.hub_store_read(text) is
  'Read one hub_store row. statement_timeout is higher than the API role default so a large document read is not cancelled mid-flight.';
