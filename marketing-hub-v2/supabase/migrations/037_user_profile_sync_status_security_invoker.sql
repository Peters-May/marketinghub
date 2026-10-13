-- The view defaults to the owner's privileges, so it bypasses RLS on profiles
-- and can expose every profile through the Data API.
ALTER VIEW public.user_profile_sync_status SET (security_invoker = true);

COMMENT ON VIEW public.user_profile_sync_status IS
  'Profile sync status for troubleshooting. Runs as the querying user so profiles row level security applies.';
