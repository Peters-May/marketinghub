export function FormAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="text-sm text-[var(--danger)]" role="alert">
      {message}
    </p>
  );
}
