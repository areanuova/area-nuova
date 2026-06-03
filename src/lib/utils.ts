// Formatta una data in italiano: 3 giugno 2026
export function formattaData(data: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(data);
}

// true se la data è oggi o nel futuro
export function eFuturo(data: Date): boolean {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return data.getTime() >= oggi.getTime();
}

// Ordina dal più recente al più vecchio
export function dalPiuRecente<T extends { data: { data: Date } }>(a: T, b: T): number {
  return b.data.data.getTime() - a.data.data.getTime();
}
