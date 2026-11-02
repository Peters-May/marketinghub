export function isAuthBypass() {
  return process.env.AUTH_BYPASS === "true";
}

export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** True on Vercel production deploys (not preview/local). */
export function isProductionRuntime() {
  return process.env.VERCEL_ENV === "production";
}

/**
 * Demo staff is only allowed outside production.
 * In production, AUTH_BYPASS or missing Supabase must not fail open.
 */
export function allowDemoAuth() {
  if (isProductionRuntime()) return false;
  return isAuthBypass() || !hasSupabaseConfig();
}

export function productionAuthMisconfigured() {
  return (
    isProductionRuntime() && (isAuthBypass() || !hasSupabaseConfig())
  );
}

export const DEMO_STAFF: {
  id: string;
  email: string;
  full_name: string;
  role: "admin";
  websiteChat: boolean;
} = {
  id: "demo-staff",
  email: "marketing@petersandmay.com",
  full_name: "Marketing Team",
  role: "admin",
  websiteChat: true,
};
