/** Display formatting shared by every page (deterministic on the server). */

/** Formats an ISO timestamp as "YYYY-MM-DD HH:MM:SS UTC". */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function shortHash(hash: string | null | undefined, length = 12): string {
  if (!hash) return "—";
  return hash.length > length ? `${hash.slice(0, length)}…` : hash;
}
