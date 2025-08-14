import { getIstDateKey } from './time';

interface Usage {
  days: Map<string, number>;
  secondsToday: number;
  lastDay: string;
  activeStart?: number;
}

const DAY_MS = 86400000;
const MAX_SECONDS = 15 * 60;
const MAX_DAYS = 5;
const usage = new Map<string, Usage>();

function cleanOldDays(u: Usage, now: Date) {
  const cutoff = now.getTime() - 30 * DAY_MS;
  for (const [day, ts] of Array.from(u.days.entries())) {
    if (ts < cutoff) u.days.delete(day);
  }
}

export function beginSession(userKey: string, now: Date = new Date()): number {
  const dayKey = getIstDateKey(now);
  let u = usage.get(userKey);
  if (!u) {
    u = { days: new Map(), secondsToday: 0, lastDay: dayKey };
    usage.set(userKey, u);
  }
  cleanOldDays(u, now);
  if (u.lastDay !== dayKey) {
    u.secondsToday = 0;
    u.lastDay = dayKey;
  }
  u.days.set(dayKey, now.getTime());
  if (u.days.size > MAX_DAYS) return 0;
  const remaining = Math.max(0, MAX_SECONDS - u.secondsToday);
  u.activeStart = now.getTime();
  return remaining;
}

export function endSession(userKey: string, now: Date = new Date()) {
  const u = usage.get(userKey);
  if (!u || !u.activeStart) return;
  const elapsed = Math.floor((now.getTime() - u.activeStart) / 1000);
  u.secondsToday += elapsed;
  u.activeStart = undefined;
}

export function getTrialBudgetSecondsLeft(userKey: string, now: Date = new Date()): number {
  const u = usage.get(userKey);
  if (!u) return MAX_SECONDS;
  const dayKey = getIstDateKey(now);
  if (u.lastDay !== dayKey) return MAX_SECONDS;
  return Math.max(0, MAX_SECONDS - u.secondsToday);
}
