/** One attempt stays short so a hung sign-in call can be retried inside the middleware limit. */
export const AUTH_ATTEMPT_TIMEOUT_MS = 4_000;
export const AUTH_ATTEMPTS = 2;

type AuthFailure = { name?: string; status?: number; message?: string } | null;

export function isTransientAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const failure = error as AuthFailure;
  if (!failure) return false;
  if (failure.name === "AuthRetryableFetchError" || failure.name === "AbortError") {
    return true;
  }
  if (typeof failure.status === "number" && (failure.status === 0 || failure.status >= 500)) {
    return true;
  }
  return /timeout|aborted|fetch failed|network/i.test(failure.message ?? "");
}

export function fetchWithAuthTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_ATTEMPT_TIMEOUT_MS);
  const upstream = init?.signal;
  if (upstream?.aborted) controller.abort();
  else upstream?.addEventListener("abort", () => controller.abort(), { once: true });
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

export async function getAuthUser<T extends { error: unknown }>(
  load: () => Promise<T>
): Promise<T> {
  let last: T | null = null;
  for (let attempt = 1; attempt <= AUTH_ATTEMPTS; attempt += 1) {
    try {
      const result = await load();
      if (!isTransientAuthError(result.error) || attempt === AUTH_ATTEMPTS) {
        return result;
      }
      last = result;
    } catch (error) {
      if (!isTransientAuthError(error) || attempt === AUTH_ATTEMPTS) throw error;
    }
  }
  return last as T;
}
