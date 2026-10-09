-- Share links must not download or rewrite the whole hub_store payload.
-- These functions touch one content element inside the database.

create or replace function public.hub_set_content_share(
  p_content_id text,
  p_enabled boolean,
  p_new_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if p_content_id is null or length(trim(p_content_id)) = 0 then
    return null;
  end if;
  if p_new_token is null or length(p_new_token) < 16 then
    return null;
  end if;

  select elem->>'share_token'
  into v_token
  from public.hub_store,
  lateral jsonb_array_elements(payload->'content') elem
  where id = 'default'
    and elem->>'id' = p_content_id
  limit 1;

  if not found then
    return null;
  end if;

  if v_token is null
     or length(v_token) < 16
     or v_token !~ '^[A-Za-z0-9_-]+$' then
    v_token := p_new_token;
  end if;

  update public.hub_store h
  set
    payload = jsonb_set(
      h.payload,
      '{content}',
      (
        select jsonb_agg(
          case
            when elem->>'id' = p_content_id then
              elem || jsonb_build_object(
                'share_token', v_token,
                'share_enabled', p_enabled,
                'updated_at', to_char(
                  clock_timestamp() at time zone 'utc',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                )
              )
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
  where h.id = 'default';

  return jsonb_build_object(
    'share_token', v_token,
    'share_enabled', p_enabled
  );
end;
$$;

create or replace function public.hub_content_by_share_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select elem
  from public.hub_store,
  lateral jsonb_array_elements(payload->'content') elem
  where id = 'default'
    and p_token ~ '^[A-Za-z0-9_-]{16,128}$'
    and elem->>'share_token' = p_token
    and coalesce(elem->>'share_enabled', 'false') = 'true'
  limit 1;
$$;

revoke all on function public.hub_set_content_share(text, boolean, text) from public;
revoke all on function public.hub_content_by_share_token(text) from public;
grant execute on function public.hub_set_content_share(text, boolean, text) to service_role;
grant execute on function public.hub_content_by_share_token(text) to service_role;
