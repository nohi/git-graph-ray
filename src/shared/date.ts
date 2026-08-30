import type { DateFormat } from './types';

export function formatDate(unix: number, format: DateFormat, now = Date.now()): string {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  if (format === 'Relative') return relative(unix, now);
  if (format === 'ISO Date Only') return d.toISOString().slice(0, 10);
  if (format === 'ISO Date & Time') return d.toISOString().replace('T', ' ').slice(0, 19);
  const date = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  if (format === 'Date Only') return date;
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

export function localDayBounds(day: string): { start: number; end: number } {
  const startDate = new Date(`${day}T00:00:00`);
  const start = Math.floor(startDate.getTime() / 1000);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);
  return { start, end: Math.floor(endDate.getTime() / 1000) };
}

export function firstCommitIndexForDate(
  commits: Array<{ hash: string; authorDate: number; committerDate: number }>,
  range: { start: number; end: number },
  field: 'author' | 'committer',
  uncommittedHash: string,
): { index: number; status: 'on-day' | 'before' | 'need-more' | 'empty' } {
  let sawCommit = false;
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]!;
    if (c.hash === uncommittedHash) continue;
    sawCommit = true;
    const t = field === 'author' ? c.authorDate : c.committerDate;
    if (t >= range.start && t < range.end) return { index: i, status: 'on-day' };
    if (t < range.start) return { index: i, status: 'before' };
  }
  return { index: -1, status: sawCommit ? 'need-more' : 'empty' };
}

function relative(unix: number, now: number): string {
  const sec = Math.max(0, Math.round(now / 1000 - unix));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(day / 365)}y ago`;
}
