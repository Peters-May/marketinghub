-- Portal list sync rewrites the whole hub_store document. The API role's
-- 8s statement_timeout cancels that write once the payload is large.
ALTER FUNCTION public.hub_store_cas_update(text, jsonb, timestamptz)
  SET statement_timeout = '120s';

ALTER FUNCTION public.hub_store_cas_update(text, jsonb, timestamptz)
  SET lock_timeout = '30s';
