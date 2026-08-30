import { describe, expect, it } from 'vitest';
import { firstCommitIndexForDate, formatDate } from './date';

describe('formatDate', () => {
  it('formats iso date', () => {
    expect(formatDate(0, 'ISO Date Only')).toBe('');
    expect(formatDate(1700000000, 'ISO Date Only')).toBe('2023-11-14');
  });
});

describe('firstCommitIndexForDate', () => {
  const row = (hash: string, authorDate: number, committerDate = authorDate) => ({
    hash,
    authorDate,
    committerDate,
  });

  it('returns the first commit whose date falls on the target day', () => {
    const commits = [row('*', 200), row('a', 150), row('b', 80), row('c', 40)];
    expect(firstCommitIndexForDate(commits, { start: 70, end: 100 }, 'author', '*')).toEqual({
      index: 2,
      status: 'on-day',
    });
  });

  it('lands on the first older commit when the day has no rows', () => {
    const commits = [row('a', 150), row('b', 40)];
    expect(firstCommitIndexForDate(commits, { start: 70, end: 100 }, 'author', '*')).toEqual({
      index: 1,
      status: 'before',
    });
  });

  it('asks for more when every loaded commit is newer than the day', () => {
    const commits = [row('a', 150), row('b', 120)];
    expect(firstCommitIndexForDate(commits, { start: 70, end: 100 }, 'committer', '*')).toEqual({
      index: -1,
      status: 'need-more',
    });
  });

  it('uses committer dates when that field is selected', () => {
    const commits = [row('a', 150, 80), row('b', 80, 150)];
    expect(firstCommitIndexForDate(commits, { start: 70, end: 100 }, 'author', '*')).toEqual({
      index: 1,
      status: 'on-day',
    });
    expect(firstCommitIndexForDate(commits, { start: 70, end: 100 }, 'committer', '*')).toEqual({
      index: 0,
      status: 'on-day',
    });
  });
});
