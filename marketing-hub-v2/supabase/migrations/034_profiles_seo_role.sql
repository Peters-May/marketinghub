-- SEO hub access: Enquiries only (Google Ads / SEO partners).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'member'::text, 'seo'::text, 'external'::text]));

COMMENT ON COLUMN public.profiles.role IS 'Hub access: admin (full), member (staff), seo (enquiries only), external (limited/media)';
