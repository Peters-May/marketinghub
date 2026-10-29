export function apiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }
  return fallback;
}

export function confirmDiscard(dirty: boolean): boolean {
  if (!dirty) return true;
  return window.confirm("You have unsaved changes. Discard them?");
}
