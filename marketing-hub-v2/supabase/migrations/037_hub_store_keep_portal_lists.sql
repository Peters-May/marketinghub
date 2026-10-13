-- A stale hub_store write (older serverless cache, core import) must not
-- drop Portal audiences that were already synced into the document.

CREATE OR REPLACE FUNCTION public.hub_store_keep_portal_lists()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_audience_count int;
  new_audience_count int;
  kept_audiences jsonb;
  kept_lists jsonb;
  merged_contacts jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.payload IS NULL OR OLD.payload IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO old_audience_count
  FROM jsonb_array_elements(COALESCE(OLD.payload->'email_audiences', '[]'::jsonb)) a
  WHERE COALESCE(a->>'portal_list_id', '') <> '';

  SELECT count(*) INTO new_audience_count
  FROM jsonb_array_elements(COALESCE(NEW.payload->'email_audiences', '[]'::jsonb)) a
  WHERE COALESCE(a->>'portal_list_id', '') <> '';

  IF old_audience_count = 0 OR new_audience_count > 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(jsonb_agg(a), '[]'::jsonb) INTO kept_audiences
  FROM jsonb_array_elements(COALESCE(OLD.payload->'email_audiences', '[]'::jsonb)) a
  WHERE COALESCE(a->>'portal_list_id', '') <> '';

  SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) INTO kept_lists
  FROM jsonb_array_elements(COALESCE(OLD.payload->'media_lists', '[]'::jsonb)) l
  WHERE COALESCE(l->>'portal_list_id', '') <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(NEW.payload->'media_lists', '[]'::jsonb)) n
      WHERE n->>'portal_list_id' = l->>'portal_list_id'
    );

  WITH new_contacts AS (
    SELECT value AS contact, lower(value->>'email') AS email
    FROM jsonb_array_elements(COALESCE(NEW.payload->'contacts', '[]'::jsonb))
  ),
  old_portal AS (
    SELECT DISTINCT ON (lower(value->>'email'))
      value AS contact,
      lower(value->>'email') AS email
    FROM jsonb_array_elements(COALESCE(OLD.payload->'contacts', '[]'::jsonb))
    WHERE COALESCE(value->>'portal_contact_id', '') <> ''
    ORDER BY lower(value->>'email')
  ),
  patched AS (
    SELECT
      CASE
        WHEN old_portal.contact IS NULL THEN new_contacts.contact
        ELSE new_contacts.contact || jsonb_build_object(
          'portal_contact_id', old_portal.contact->'portal_contact_id',
          'marketing_consent',
          CASE
            WHEN old_portal.contact->>'marketing_consent' = 'true' THEN to_jsonb(true)
            ELSE new_contacts.contact->'marketing_consent'
          END
        )
      END AS contact
    FROM new_contacts
    LEFT JOIN old_portal ON old_portal.email = new_contacts.email
  ),
  added AS (
    SELECT old_portal.contact
    FROM old_portal
    WHERE old_portal.email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM new_contacts WHERE new_contacts.email = old_portal.email
      )
  )
  SELECT COALESCE(jsonb_agg(contact), '[]'::jsonb) INTO merged_contacts
  FROM (
    SELECT contact FROM patched
    UNION ALL
    SELECT contact FROM added
  ) combined;

  NEW.payload := jsonb_set(
    NEW.payload,
    '{email_audiences}',
    COALESCE(NEW.payload->'email_audiences', '[]'::jsonb) || kept_audiences,
    true
  );
  NEW.payload := jsonb_set(
    NEW.payload,
    '{media_lists}',
    COALESCE(NEW.payload->'media_lists', '[]'::jsonb) || kept_lists,
    true
  );
  NEW.payload := jsonb_set(NEW.payload, '{contacts}', merged_contacts, true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hub_store_keep_portal_lists ON public.hub_store;

CREATE TRIGGER hub_store_keep_portal_lists
BEFORE UPDATE ON public.hub_store
FOR EACH ROW
EXECUTE FUNCTION public.hub_store_keep_portal_lists();
