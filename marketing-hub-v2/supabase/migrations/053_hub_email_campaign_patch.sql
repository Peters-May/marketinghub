-- Email send / webhook traffic must not rewrite the whole hub_store document
-- (~2MB). These helpers change one email_campaigns[] element in place.

create or replace function public.hub_email_campaign_get(p_campaign_id text)
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
  lateral jsonb_array_elements(coalesce(payload->'email_campaigns', '[]'::jsonb)) elem
  where id = 'default'
    and p_campaign_id is not null
    and length(trim(p_campaign_id)) > 0
    and elem->>'id' = p_campaign_id
  limit 1;
$$;

create or replace function public.hub_email_campaign_claim(
  p_campaign_id text,
  p_claim text,
  p_from text[],
  p_due_only boolean default false,
  p_clear_schedule boolean default false,
  p_lock_ms integer default 480000
)
returns text
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
set lock_timeout = '15s'
as $$
declare
  v_id text;
  v_claim text;
  v_now timestamptz := clock_timestamp();
  v_lock interval;
  v_updated integer := 0;
begin
  v_id := nullif(trim(p_campaign_id), '');
  v_claim := nullif(trim(p_claim), '');
  if v_id is null or v_claim is null or p_from is null or cardinality(p_from) = 0 then
    return null;
  end if;

  v_lock := make_interval(secs => greatest(coalesce(p_lock_ms, 480000), 1000) / 1000.0);

  update public.hub_store h
  set
    payload = jsonb_set(
      h.payload,
      '{email_campaigns}',
      (
        select jsonb_agg(
          case
            when elem->>'id' = v_id then
              (
                elem
                || jsonb_build_object(
                  'status', 'sending',
                  'last_error', '',
                  'send_claim', v_claim,
                  'send_heartbeat_at', v_now,
                  'updated_at', v_now
                )
              )
              || case
                when coalesce(p_clear_schedule, false) then '{"scheduled_at":null}'::jsonb
                else '{}'::jsonb
              end
            else elem
          end
          order by ord
        )
        from jsonb_array_elements(coalesce(h.payload->'email_campaigns', '[]'::jsonb))
          with ordinality as t(elem, ord)
      ),
      true
    ),
    updated_at = v_now
  where h.id = 'default'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(h.payload->'email_campaigns', '[]'::jsonb)) elem
      where elem->>'id' = v_id
        and coalesce(elem->>'status', '') is distinct from 'sent'
        and coalesce(elem->>'status', '') = any (p_from)
        and (
          coalesce(elem->>'status', '') is distinct from 'sending'
          or coalesce(
            nullif(coalesce(elem->>'send_heartbeat_at', elem->>'updated_at'), '')::timestamptz,
            '-infinity'::timestamptz
          ) <= v_now - v_lock
        )
        and (
          not coalesce(p_due_only, false)
          or coalesce(elem->>'status', '') is distinct from 'scheduled'
          or coalesce(nullif(elem->>'scheduled_at', '')::timestamptz, 'infinity'::timestamptz) <= v_now
        )
    );

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return null;
  end if;

  return v_claim;
end;
$$;

create or replace function public.hub_email_campaign_hold(
  p_campaign_id text,
  p_claim text,
  p_heartbeat_ms integer default 60000
)
returns boolean
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
set lock_timeout = '15s'
as $$
declare
  v_id text;
  v_claim text;
  v_prev jsonb;
  v_heartbeat timestamptz;
  v_now timestamptz := clock_timestamp();
  v_heartbeat_ms integer := greatest(coalesce(p_heartbeat_ms, 60000), 1000);
begin
  v_id := nullif(trim(p_campaign_id), '');
  v_claim := nullif(trim(p_claim), '');
  if v_id is null or v_claim is null then
    return false;
  end if;

  select elem
  into v_prev
  from public.hub_store h,
  lateral jsonb_array_elements(coalesce(h.payload->'email_campaigns', '[]'::jsonb)) elem
  where h.id = 'default'
    and elem->>'id' = v_id
  limit 1;

  if v_prev is null then
    return false;
  end if;

  if coalesce(v_prev->>'status', '') is distinct from 'sending'
     or coalesce(v_prev->>'send_claim', '') is distinct from v_claim then
    return false;
  end if;

  begin
    v_heartbeat := nullif(coalesce(v_prev->>'send_heartbeat_at', v_prev->>'updated_at'), '')::timestamptz;
  exception when others then
    v_heartbeat := null;
  end;

  if v_heartbeat is not null
     and (extract(epoch from (v_now - v_heartbeat)) * 1000) < v_heartbeat_ms then
    return true;
  end if;

  update public.hub_store h
  set
    payload = jsonb_set(
      h.payload,
      '{email_campaigns}',
      (
        select jsonb_agg(
          case
            when elem->>'id' = v_id then
              elem || jsonb_build_object('send_heartbeat_at', v_now)
            else elem
          end
          order by ord
        )
        from jsonb_array_elements(coalesce(h.payload->'email_campaigns', '[]'::jsonb))
          with ordinality as t(elem, ord)
      ),
      true
    ),
    updated_at = v_now
  where h.id = 'default'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(h.payload->'email_campaigns', '[]'::jsonb)) elem
      where elem->>'id' = v_id
        and elem->>'status' = 'sending'
        and elem->>'send_claim' = v_claim
    );

  return found;
end;
$$;

create or replace function public.hub_email_campaign_release(
  p_campaign_id text,
  p_claim text,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
set lock_timeout = '15s'
as $$
declare
  v_id text;
  v_claim text;
  v_now timestamptz := clock_timestamp();
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_next jsonb;
begin
  v_id := nullif(trim(p_campaign_id), '');
  v_claim := nullif(trim(p_claim), '');
  if v_id is null or v_claim is null then
    return null;
  end if;

  -- Claim ownership stays with the claim helpers; strip forged claim fields.
  v_patch := v_patch - 'id' - 'send_claim' - 'send_heartbeat_at';

  update public.hub_store h
  set
    payload = jsonb_set(
      h.payload,
      '{email_campaigns}',
      (
        select jsonb_agg(
          case
            when elem->>'id' = v_id then
              elem
              || v_patch
              || jsonb_build_object(
                'send_claim', '',
                'updated_at', v_now
              )
              || '{"send_heartbeat_at":null}'::jsonb
            else elem
          end
          order by ord
        )
        from jsonb_array_elements(coalesce(h.payload->'email_campaigns', '[]'::jsonb))
          with ordinality as t(elem, ord)
      ),
      true
    ),
    updated_at = v_now
  where h.id = 'default'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(h.payload->'email_campaigns', '[]'::jsonb)) elem
      where elem->>'id' = v_id
        and elem->>'status' = 'sending'
        and elem->>'send_claim' = v_claim
    )
  returning (
    select elem
    from jsonb_array_elements(payload->'email_campaigns') elem
    where elem->>'id' = v_id
    limit 1
  ) into v_next;

  return v_next;
end;
$$;

create or replace function public.hub_email_campaign_bump_stat(
  p_campaign_id text,
  p_field text,
  p_delta integer default 1,
  p_touch_updated boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
set lock_timeout = '15s'
as $$
declare
  v_id text;
  v_field text;
  v_now timestamptz := clock_timestamp();
  v_next jsonb;
begin
  v_id := nullif(trim(p_campaign_id), '');
  v_field := nullif(trim(p_field), '');
  if v_id is null
     or v_field is null
     or v_field not in ('recipients', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed') then
    return null;
  end if;

  update public.hub_store h
  set
    payload = jsonb_set(
      h.payload,
      '{email_campaigns}',
      (
        select jsonb_agg(
          case
            when elem->>'id' = v_id then
              (
                select
                  elem
                  || jsonb_build_object('stats', next_stats)
                  || case
                    when coalesce(p_touch_updated, true) then jsonb_build_object('updated_at', v_now)
                    else '{}'::jsonb
                  end
                from (
                  select
                    case
                      when v_field in ('opened', 'clicked')
                           and greatest(
                             coalesce(nullif(elem->'stats'->>'delivered', '')::numeric, 0),
                             coalesce(nullif(elem->'stats'->>'recipients', '')::numeric, 0)
                           ) > 0
                      then jsonb_set(
                        coalesce(elem->'stats', '{}'::jsonb),
                        array[v_field],
                        to_jsonb(
                          least(
                            coalesce(nullif(elem->'stats'->>v_field, '')::numeric, 0) + coalesce(p_delta, 1),
                            greatest(
                              coalesce(nullif(elem->'stats'->>'delivered', '')::numeric, 0),
                              coalesce(nullif(elem->'stats'->>'recipients', '')::numeric, 0)
                            )
                          )
                        )
                      )
                      else jsonb_set(
                        coalesce(elem->'stats', '{}'::jsonb),
                        array[v_field],
                        to_jsonb(
                          coalesce(nullif(elem->'stats'->>v_field, '')::numeric, 0) + coalesce(p_delta, 1)
                        )
                      )
                    end as next_stats
                ) calc
              )
            else elem
          end
          order by ord
        )
        from jsonb_array_elements(coalesce(h.payload->'email_campaigns', '[]'::jsonb))
          with ordinality as t(elem, ord)
      ),
      true
    ),
    updated_at = v_now
  where h.id = 'default'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(h.payload->'email_campaigns', '[]'::jsonb)) elem
      where elem->>'id' = v_id
    )
  returning (
    select elem
    from jsonb_array_elements(payload->'email_campaigns') elem
    where elem->>'id' = v_id
    limit 1
  ) into v_next;

  return v_next;
end;
$$;

revoke all on function public.hub_email_campaign_get(text) from public, anon, authenticated;
revoke all on function public.hub_email_campaign_claim(text, text, text[], boolean, boolean, integer) from public, anon, authenticated;
revoke all on function public.hub_email_campaign_hold(text, text, integer) from public, anon, authenticated;
revoke all on function public.hub_email_campaign_release(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.hub_email_campaign_bump_stat(text, text, integer, boolean) from public, anon, authenticated;

grant execute on function public.hub_email_campaign_get(text) to service_role;
grant execute on function public.hub_email_campaign_claim(text, text, text[], boolean, boolean, integer) to service_role;
grant execute on function public.hub_email_campaign_hold(text, text, integer) to service_role;
grant execute on function public.hub_email_campaign_release(text, text, jsonb) to service_role;
grant execute on function public.hub_email_campaign_bump_stat(text, text, integer, boolean) to service_role;

comment on function public.hub_email_campaign_get(text) is
  'Read one email campaign without returning the rest of hub_store.';
comment on function public.hub_email_campaign_claim(text, text, text[], boolean, boolean, integer) is
  'Atomically claim a campaign send without rewriting unrelated collections.';
comment on function public.hub_email_campaign_hold(text, text, integer) is
  'Refresh a send heartbeat when the runner still owns the claim.';
comment on function public.hub_email_campaign_release(text, text, jsonb) is
  'Finish a claimed send and clear ownership fields.';
comment on function public.hub_email_campaign_bump_stat(text, text, integer, boolean) is
  'Increment one campaign stat field without rewriting the whole hub store.';
