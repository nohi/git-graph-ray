import { describe, expect, it } from 'vitest';
import { compileFindRegex, formatFindCount, highlightFind, matchCommit } from './commitFind';
import type { GraphCommit } from './types';

const commit = (over: Partial<GraphCommit> = {}): GraphCommit => ({
  hash: 'abc123def',
  parents: [],
  authorName: 'Ada',
  authorEmail: 'ada@example.com',
  authorDate: 0,
  committerName: 'Ada',
  committerEmail: 'ada@example.com',
  committerDate: 0,
  subject: 'Fix the Widget',
  refs: [{ kind: 'head', name: 'main', hash: 'abc123def' }],
  ...over,
});

describe('matchCommit', () => {
  it('matches case-insensitively by default', () => {
    expect(matchCommit(commit(), 'widget', { regex: false, ignoreCase: true })).toBe(true);
    expect(matchCommit(commit(), 'widget', { regex: false, ignoreCase: false })).toBe(false);
  });

  it('matches regex', () => {
    expect(matchCommit(commit(), 'Fix the \\w+', { regex: true, ignoreCase: false })).toBe(true);
    expect(matchCommit(commit(), 'Fix the \\d+', { regex: true, ignoreCase: false })).toBe(false);
  });

  it('returns false for invalid regex', () => {
    expect(compileFindRegex('(', true)).toBeNull();
    expect(matchCommit(commit(), '(', { regex: true, ignoreCase: true })).toBe(false);
  });
});

describe('highlightFind', () => {
  it('wraps plain matches in a mark and escapes HTML', () => {
    expect(highlightFind('Fix the <Widget>', 'widget', { regex: false, ignoreCase: true })).toBe(
      'Fix the &lt;<mark class="find-hit">Widget</mark>&gt;',
    );
  });

  it('wraps regex matches', () => {
    expect(highlightFind('Fix the Widget', 'Fix the \\w+', { regex: true, ignoreCase: false })).toBe(
      '<mark class="find-hit">Fix the Widget</mark>',
    );
  });

  it('escapes the whole string when the query is empty or invalid', () => {
    expect(highlightFind('a < b', '', { regex: false, ignoreCase: true })).toBe('a &lt; b');
    expect(highlightFind('a < b', '(', { regex: true, ignoreCase: true })).toBe('a &lt; b');
  });
});

describe('formatFindCount', () => {
  it('uses 0/- before a query is entered', () => {
    expect(formatFindCount(0, 0, false)).toBe('0/-');
  });

  it('uses 0/0 when there are no hits', () => {
    expect(formatFindCount(0, 0)).toBe('0/0');
  });

  it('shows the current hit among the total', () => {
    expect(formatFindCount(2, 11)).toBe('2/11');
  });
});
