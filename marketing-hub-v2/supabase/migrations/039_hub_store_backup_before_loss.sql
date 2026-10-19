-- Before a hub_store update that would wipe a collection, keep the previous
-- document. The live row keeps those collections. Ordinary edits are not copied.

CREATE TABLE IF NOT EXISTS public.hub_store_backups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id text NOT NULL,
  payload jsonb NOT NULL,
  attempted_payload jsonb,
  reason text NOT NULL,
  source_updated_at timestamptz,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hub_store_backups IS
  'Snapshots taken before a hub_store write that would drop a collection. Service role only.';

CREATE INDEX IF NOT EXISTS hub_store_backups_store_backed_up_idx
  ON public.hub_store_backups (store_id, backed_up_at DESC, id DESC);

ALTER TABLE public.hub_store_backups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hub_store_backups FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.hub_store_backups TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.hub_store_backups_id_seq TO service_role;

-- Current document, taken before the guard is installed.
INSERT INTO public.hub_store_backups (
  store_id, payload, attempted_payload, reason, source_updated_at
)
SELECT id, payload, NULL, 'baseline', updated_at
FROM public.hub_store
WHERE id = 'default'
  AND NOT EXISTS (
    SELECT 1
    FROM public.hub_store_backups
    WHERE store_id = 'default' AND reason = 'baseline'
  );

CREATE OR REPLACE FUNCTION public.hub_store_backup_before_loss()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  keys text[] := ARRAY[
    'contacts',
    'events',
    'content',
    'tasks',
    'email_campaigns',
    'email_audiences',
    'media_lists',
    'resources',
    'email_events',
    'budget_lines',
    'budget_payments',
    'sponsorships',
    'access_requests',
    'merch_orders',
    'staff_requests',
    'pr_pitches',
    'awards',
    'themes',
    'email_templates',
    'pr_coverage'
  ];
  k text;
  old_n int;
  new_n int;
  old_first text;
  new_first text;
  reasons text[] := '{}';
  restored jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.payload IS NULL OR OLD.payload IS NULL THEN
    RETURN NEW;
  END IF;

  restored := NEW.payload;

  FOREACH k IN ARRAY keys LOOP
    old_n := COALESCE(jsonb_array_length(OLD.payload -> k), 0);
    new_n := COALESCE(jsonb_array_length(restored -> k), 0);
    old_first := COALESCE(OLD.payload -> k -> 0 ->> 'id', '');
    new_first := COALESCE(restored -> k -> 0 ->> 'id', '');

    -- Lost more than half of a real collection, wiped it, or replaced it with demo seed.
    IF (
      old_n >= 8 AND new_n * 2 < old_n
    ) OR (
      old_n >= 5 AND new_n = 0
    ) OR (
      old_n >= 5
      AND position('_seed_' IN new_first) > 0
      AND position('_seed_' IN old_first) = 0
    ) THEN
      restored := jsonb_set(
        restored,
        ARRAY[k],
        COALESCE(OLD.payload -> k, '[]'::jsonb),
        true
      );
      reasons := array_append(reasons, k);
    END IF;
  END LOOP;

  IF reasons = '{}' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.hub_store_backups (
    store_id, payload, attempted_payload, reason, source_updated_at
  ) VALUES (
    OLD.id,
    OLD.payload,
    NEW.payload,
    'kept ' || array_to_string(reasons, ', '),
    OLD.updated_at
  );

  DELETE FROM public.hub_store_backups
  WHERE store_id = OLD.id
    AND id NOT IN (
      SELECT id
      FROM public.hub_store_backups
      WHERE store_id = OLD.id
      ORDER BY backed_up_at DESC, id DESC
      LIMIT 20
    );

  NEW.payload := restored;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hub_store_backup_before_loss() IS
  'Copies hub_store before a write that would wipe a collection, then keeps the existing collection.';

DROP TRIGGER IF EXISTS hub_store_backup_before_loss ON public.hub_store;

CREATE TRIGGER hub_store_backup_before_loss
BEFORE UPDATE ON public.hub_store
FOR EACH ROW
EXECUTE FUNCTION public.hub_store_backup_before_loss();
