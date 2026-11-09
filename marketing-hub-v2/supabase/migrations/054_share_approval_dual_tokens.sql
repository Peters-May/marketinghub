-- Dual staff/client share-for-approval tokens on content, plus token lookup
-- that matches either audience.

create or replace function public.hub_set_content_share(
  p_content_id text,
  p_enabled boolean,
  p_new_token text,
  p_audience text default 'staff'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_audience text;
begin
  if p_content_id is null or length(trim(p_content_id)) = 0 then
    return null;
  end if;
  if p_new_token is null or length(p_new_token) < 16 then
    return null;
  end if;

  v_audience := case
    when lower(coalesce(p_audience, 'staff')) = 'client' then 'client'
    else 'staff'
  end;

  if v_audience = 'client' then
    select elem->>'client_share_token'
    into v_token
    from public.hub_store,
    lateral jsonb_array_elements(payload->'content') elem
    where id = 'default'
      and elem->>'id' = p_content_id
    limit 1;
  else
    select elem->>'share_token'
    into v_token
    from public.hub_store,
    lateral jsonb_array_elements(payload->'content') elem
    where id = 'default'
      and elem->>'id' = p_content_id
    limit 1;
  end if;

  if not found then
    return null;
  end if;

  if v_token is null
     or length(v_token) < 16
     or v_token !~ '^[A-Za-z0-9_-]+$' then
    v_token := p_new_token;
  end if;

  if v_audience = 'client' then
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
                  'client_share_token', v_token,
                  'client_share_enabled', p_enabled,
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
  else
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
  end if;

  return jsonb_build_object(
    'share_token', v_token,
    'share_enabled', p_enabled,
    'audience', v_audience
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
    and (
      (
        elem->>'share_token' = p_token
        and coalesce(elem->>'share_enabled', 'false') = 'true'
      )
      or (
        elem->>'client_share_token' = p_token
        and coalesce(elem->>'client_share_enabled', 'false') = 'true'
      )
    )
  limit 1;
$$;

revoke all on function public.hub_set_content_share(text, boolean, text, text) from public;
revoke all on function public.hub_content_by_share_token(text) from public;
grant execute on function public.hub_set_content_share(text, boolean, text, text) to service_role;
grant execute on function public.hub_content_by_share_token(text) to service_role;

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
begin
  return public.hub_set_content_share(p_content_id, p_enabled, p_new_token, 'staff');
end;
$$;

revoke all on function public.hub_set_content_share(text, boolean, text) from public;
grant execute on function public.hub_set_content_share(text, boolean, text) to service_role;
