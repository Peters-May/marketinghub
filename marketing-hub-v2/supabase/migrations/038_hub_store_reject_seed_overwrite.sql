-- A timed-out read used to be treated as an empty hub and replaced with the
-- demo seed. If that happens again, keep the real document.

CREATE OR REPLACE FUNCTION public.hub_store_reject_seed_overwrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_real boolean;
  new_demo boolean;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.payload IS NULL OR OLD.payload IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(OLD.payload->'content', '[]'::jsonb)) c
      WHERE COALESCE(c->>'id', '') !~ '^(cnt_seed_|cnt_rel_)'
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(OLD.payload->'email_campaigns', '[]'::jsonb)) c
      WHERE COALESCE(c->>'id', '') !~ '^ecamp_rel_'
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(OLD.payload->'events', '[]'::jsonb)) e
      WHERE COALESCE(e->>'id', '') !~ '^evt_seed_'
    )
  INTO old_real;

  SELECT
    COALESCE(jsonb_array_length(NEW.payload->'content'), 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(NEW.payload->'content', '[]'::jsonb)) c
      WHERE COALESCE(c->>'id', '') !~ '^(cnt_seed_|cnt_rel_)'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(NEW.payload->'email_campaigns', '[]'::jsonb)) c
      WHERE COALESCE(c->>'id', '') <> ''
        AND COALESCE(c->>'id', '') !~ '^ecamp_rel_'
    )
  INTO new_demo;

  IF old_real AND new_demo THEN
    NEW.payload := OLD.payload;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hub_store_reject_seed_overwrite ON public.hub_store;

CREATE TRIGGER hub_store_reject_seed_overwrite
BEFORE UPDATE ON public.hub_store
FOR EACH ROW
EXECUTE FUNCTION public.hub_store_reject_seed_overwrite();
