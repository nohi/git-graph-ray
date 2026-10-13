import { describe, expect, it } from 'vitest';
import { localDayBounds } from './date';
import { activityRange, contributorLogArgs, normalizeActivityPeriod, parseContributorLog } from './contributors';

const RS = '\u001e';
const US = '\u001f';

function record(
  author: string,
  authorEmail: string,
  committer: string,
  committerEmail: string,
  stat?: string,
  authorDate = 10,
  committerDate = authorDate,
): string {
  const head = `${RS}${author}${US}${authorEmail}${US}${authorDate}${US}${committer}${US}${committerEmail}${US}${committerDate}\n`;
  return stat ? `${head} ${stat}\n\n` : `${head}\n`;
}

describe('contributorLogArgs', () => {
  it('walks all refs except stash and notes', () => {
    const args = contributorLogArgs(false);
    expect(args.slice(0, 4)).toEqual(['log', '--exclude=refs/stash', '--exclude=refs/notes', '--all']);
    expect(args).toContain('--pretty=format:%x1e%aN%x1f%aE%x1f%at%x1f%cN%x1f%cE%x1f%ct');
    expect(args).toContain('--shortstat');
    expect(args).not.toContain('--use-mailmap');
  });

  it('adds mailmap only when requested', () => {
    expect(contributorLogArgs(true)).toContain('--use-mailmap');
  });
});

describe('parseContributorLog', () => {
  it('returns empty lists for an empty history', () => {
    expect(parseContributorLog('')).toEqual({ authors: [], committers: [] });
    expect(parseContributorLog('\n')).toEqual({ authors: [], committers: [] });
  });

  it('sums commits and line counts for the same person', () => {
    const stdout = [
      record('Ada', 'ada@example.com', 'Ada', 'ada@example.com', '2 files changed, 10 insertions(+), 3 deletions(-)'),
      record('Ada', 'ada@example.com', 'Ada', 'ada@example.com', '1 file changed, 4 insertions(+)'),
    ].join('');
    const { authors, committers } = parseContributorLog(stdout);
    expect(authors).toEqual([{ name: 'Ada', email: 'ada@example.com', commits: 2, additions: 14, deletions: 3 }]);
    expect(committers).toEqual(authors);
  });

  it('counts deletions-only and file-only shortstat lines', () => {
    const stdout = [
      record('Bea', 'bea@example.com', 'Bea', 'bea@example.com', '1 file changed, 2 deletions(-)'),
      record('Bea', 'bea@example.com', 'Bea', 'bea@example.com', '3 files changed'),
    ].join('');
    expect(parseContributorLog(stdout).authors).toEqual([
      { name: 'Bea', email: 'bea@example.com', commits: 2, additions: 0, deletions: 2 },
    ]);
  });

  it('counts a merge that has no shortstat', () => {
    const stdout = record('Cara', 'cara@example.com', 'Cara', 'cara@example.com');
    expect(parseContributorLog(stdout).authors).toEqual([
      { name: 'Cara', email: 'cara@example.com', commits: 1, additions: 0, deletions: 0 },
    ]);
  });

  it('attributes the same lines to the author and the committer', () => {
    const stdout = record('Ada', 'ada@example.com', 'Bea', 'bea@example.com', '1 file changed, 5 insertions(+), 1 deletion(-)');
    const parsed = parseContributorLog(stdout);
    expect(parsed.authors).toEqual([{ name: 'Ada', email: 'ada@example.com', commits: 1, additions: 5, deletions: 1 }]);
    expect(parsed.committers).toEqual([{ name: 'Bea', email: 'bea@example.com', commits: 1, additions: 5, deletions: 1 }]);
  });

  it('keeps different emails apart and orders by commit count', () => {
    const stdout = [
      record('Ada', 'ada@example.com', 'Ada', 'ada@example.com', '1 file changed, 1 insertion(+)'),
      record('Bea', 'bea@example.com', 'Bea', 'bea@example.com', '1 file changed, 1 insertion(+)'),
      record('Bea', 'bea@example.com', 'Bea', 'bea@example.com', '1 file changed, 1 insertion(+)'),
      record('Ada', 'ada@other.test', 'Ada', 'ada@other.test', '1 file changed, 1 insertion(+)'),
    ].join('');
    expect(parseContributorLog(stdout).authors.map((row) => `${row.name} ${row.email} ${row.commits}`)).toEqual([
      'Bea bea@example.com 2',
      'Ada ada@example.com 1',
      'Ada ada@other.test 1',
    ]);
  });

  it('keeps an author inside the window when the committer date is outside it', () => {
    const stdout = [
      record('Ada', 'ada@example.com', 'Bea', 'bea@example.com', '1 file changed, 2 insertions(+)', 100, 50),
      record('Ada', 'ada@example.com', 'Bea', 'bea@example.com', '1 file changed, 3 insertions(+)', 200, 150),
    ].join('');
    const parsed = parseContributorLog(stdout, { start: 80, end: 120 });
    expect(parsed.authors).toEqual([{ name: 'Ada', email: 'ada@example.com', commits: 1, additions: 2, deletions: 0 }]);
    expect(parsed.committers).toEqual([]);
  });

  it('includes the start instant and excludes the end instant', () => {
    const stdout = [
      record('Ada', 'ada@example.com', 'Ada', 'ada@example.com', '1 file changed, 1 insertion(+)', 80, 80),
      record('Bea', 'bea@example.com', 'Bea', 'bea@example.com', '1 file changed, 1 insertion(+)', 120, 120),
    ].join('');
    expect(parseContributorLog(stdout, { start: 80, end: 120 }).authors.map((row) => row.name)).toEqual(['Ada']);
  });

  it('skips a blank name', () => {
    const stdout = record('  ', 'ada@example.com', 'Bea', 'bea@example.com', '1 file changed, 1 insertion(+)');
    const parsed = parseContributorLog(stdout);
    expect(parsed.authors).toEqual([]);
    expect(parsed.committers).toEqual([{ name: 'Bea', email: 'bea@example.com', commits: 1, additions: 1, deletions: 0 }]);
  });
});

describe('activityRange', () => {
  const now = 1_700_000_000_000;

  it('keeps the whole history for all time', () => {
    expect(activityRange({ kind: 'all' }, now)).toBeNull();
    expect(activityRange({ kind: 'range', from: '', to: '' }, now)).toBeNull();
    expect(normalizeActivityPeriod({ kind: 'days', days: 3 })).toEqual({ kind: 'all' });
  });

  it('uses a rolling window that ends now', () => {
    expect(activityRange({ kind: 'days', days: 7 }, now)).toEqual({
      start: Math.floor(now / 1000) - 7 * 86400,
      end: Math.floor(now / 1000) + 1,
    });
  });

  it('covers local calendar days from the start through the end date', () => {
    expect(activityRange({ kind: 'range', from: '2024-01-02', to: '2024-01-05' }, now)).toEqual({
      start: localDayBounds('2024-01-02').start,
      end: localDayBounds('2024-01-05').end,
    });
  });
});
