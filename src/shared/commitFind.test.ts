import { describe, expect, it } from 'vitest';
import { assembleFindHits, compileFindRegex, formatFindCount, highlightFind, indexFindHashes, matchCommit, parseFindScan } from './commitFind';
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

  it('marks a truncated result', () => {
    expect(formatFindCount(2, 5000, true, true)).toBe('2/5000+');
  });
});

describe('assembleFindHits', () => {
  const hash = (n: number) => `${n.toString(16).padStart(40, 'a')}`;

  it('orders field matches and body-only hashes by the scan index', () => {
    const scanned = [
      { hash: hash(1), authorName: 'Ada', subject: 'Unrelated', index: 0 },
      { hash: hash(2), authorName: 'Grace', subject: 'Fix widget', index: 1 },
      { hash: hash(3), authorName: 'Ada', subject: 'Later', index: 2 },
    ];
    const found = assembleFindHits({
      scanned,
      query: 'widget',
      flags: { regex: false, ignoreCase: true },
      extraHashes: [hash(3), hash(2)],
      scanCap: 10,
    });
    expect(found.hashes).toEqual([hash(2), hash(3)]);
    expect(found.indexes).toEqual([1, 2]);
    expect(found.truncated).toBe(false);
  });

  it('parses the scan format and reports a cut-off past the scan cap', () => {
    const stdout = `\u001e${hash(4)}\u001fAda\u001fSubject\n`;
    expect(parseFindScan(stdout)).toEqual([{ hash: hash(4), authorName: 'Ada', subject: 'Subject', index: 0 }]);
    const found = assembleFindHits({
      scanned: [{ hash: hash(4), authorName: 'Ada', subject: 'Subject', index: 0 }],
      query: 'subject',
      flags: { regex: false, ignoreCase: true },
      extraHashes: [],
      scanCap: 0,
    });
    expect(found.truncated).toBe(true);
  });
});

describe('indexFindHashes', () => {
  it('keeps diff order and uses -1 when the hash was not scanned', () => {
    const known = 'a'.repeat(40);
    const missing = 'b'.repeat(40);
    expect(indexFindHashes([known], [missing, known], 10, 10)).toEqual({
      hashes: [missing, known],
      indexes: [-1, 0],
      truncated: true,
    });
  });
});
