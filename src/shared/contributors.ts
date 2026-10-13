import { localDayBounds } from './date';
import { personKey } from './personFilter';

export type ContributorStat = {
  name: string;
  email: string;
  commits: number;
  additions: number;
  deletions: number;
};

export type ContributorReport = {
  repoPath: string;
  repoName: string;
  authors: ContributorStat[];
  committers: ContributorStat[];
};

export type ActivityPeriod = { kind: 'all' } | { kind: 'days'; days: number } | { kind: 'range'; from: string; to: string };

export type ActivityRange = { start: number; end: number };

const PERIOD_DAYS = new Set([7, 30, 90, 365]);

export function normalizeActivityPeriod(period: ActivityPeriod | undefined): ActivityPeriod {
  if (!period || period.kind === 'all') return { kind: 'all' };
  if (period.kind === 'days') return PERIOD_DAYS.has(period.days) ? { kind: 'days', days: period.days } : { kind: 'all' };
  if (period.kind === 'range') return { kind: 'range', from: isoDay(period.from), to: isoDay(period.to) };
  return { kind: 'all' };
}

/** Inclusive start and exclusive end, in unix seconds. Null keeps the whole history. */
export function activityRange(period: ActivityPeriod, nowMs = Date.now()): ActivityRange | null {
  const normalized = normalizeActivityPeriod(period);
  if (normalized.kind === 'all') return null;
  if (normalized.kind === 'days') {
    const end = Math.floor(nowMs / 1000) + 1;
    return { start: end - 1 - normalized.days * 86400, end };
  }
  if (!normalized.from && !normalized.to) return null;
  const start = normalized.from ? localDayBounds(normalized.from).start : 0;
  const end = normalized.to ? localDayBounds(normalized.to).end : Number.POSITIVE_INFINITY;
  return { start, end };
}

export type ContributorsToHost =
  | { type: 'ready'; period?: ActivityPeriod }
  | { type: 'reload' }
  | { type: 'setPeriod'; period: ActivityPeriod };

export type HostToContributors =
  | { type: 'report'; payload: ContributorReport }
  | { type: 'fail'; message: string }
  | { type: 'busy'; on: boolean; repoPath?: string; repoName?: string };

const RS = '\u001e';
const US = '\u001f';

/** `git log` over every branch, tag, and remote, skipping stash and notes. */
export function contributorLogArgs(mailmap: boolean): string[] {
  const args = [
    'log',
    '--exclude=refs/stash',
    '--exclude=refs/notes',
    '--all',
    `--pretty=format:%x1e%aN%x1f%aE%x1f%at%x1f%cN%x1f%cE%x1f%ct`,
    '--shortstat',
    '--no-color',
  ];
  if (mailmap) args.push('--use-mailmap');
  return args;
}

const SHORTSTAT = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;

export function parseContributorLog(
  stdout: string,
  range: ActivityRange | null = null,
): { authors: ContributorStat[]; committers: ContributorStat[] } {
  const authors = new Map<string, ContributorStat>();
  const committers = new Map<string, ContributorStat>();
  const text = stdout.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  for (const part of text.split(RS)) {
    const record = part.replace(/^\n+/, '');
    if (!record) continue;
    const nl = record.indexOf('\n');
    const identity = nl === -1 ? record : record.slice(0, nl);
    const body = nl === -1 ? '' : record.slice(nl + 1);
    const fields = identity.split(US);
    if (fields.length < 6) continue;
    const lines = shortstatLines(body);
    const authorDate = Number(fields[2] ?? 0);
    const committerDate = Number(fields[5] ?? 0);
    if (inRange(authorDate, range)) addStat(authors, fields[0] ?? '', fields[1] ?? '', lines);
    if (inRange(committerDate, range)) addStat(committers, fields[3] ?? '', fields[4] ?? '', lines);
  }
  return { authors: sorted(authors), committers: sorted(committers) };
}

function inRange(unix: number, range: ActivityRange | null): boolean {
  if (!range) return true;
  return Number.isFinite(unix) && unix >= range.start && unix < range.end;
}

function isoDay(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function shortstatLines(body: string): { additions: number; deletions: number } {
  const match = body.match(SHORTSTAT);
  if (!match) return { additions: 0, deletions: 0 };
  return { additions: Number(match[2] ?? 0), deletions: Number(match[3] ?? 0) };
}

function addStat(
  map: Map<string, ContributorStat>,
  rawName: string,
  rawEmail: string,
  lines: { additions: number; deletions: number },
): void {
  const name = rawName.trim();
  if (!name) return;
  const email = rawEmail.trim();
  const key = personKey(name, email);
  const current = map.get(key);
  if (current) {
    current.commits += 1;
    current.additions += lines.additions;
    current.deletions += lines.deletions;
    return;
  }
  map.set(key, { name, email, commits: 1, additions: lines.additions, deletions: lines.deletions });
}

function sorted(map: Map<string, ContributorStat>): ContributorStat[] {
  return [...map.values()].sort(
    (a, b) => b.commits - a.commits || a.name.localeCompare(b.name) || a.email.localeCompare(b.email),
  );
}
