export function getIstDate(date: Date = new Date()): Date {
  const istString = date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(istString);
}

export function getIstDateKey(date: Date = new Date()): string {
  return getIstDate(date).toISOString().slice(0, 10);
}
