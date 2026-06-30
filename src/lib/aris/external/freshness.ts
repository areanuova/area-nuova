export function isStale(lastSeenAt: string | null, refreshIntervalMinutes: number): boolean {
  if (!lastSeenAt) return true;
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  return diffMs >= refreshIntervalMinutes * 60 * 1000;
}

export function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'Non disponibile';
  return new Date(lastSeenAt).toLocaleString('it-IT', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}
