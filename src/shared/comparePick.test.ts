import { describe, expect, it } from 'vitest';
import { comparePick } from './comparePick';
import type { GraphRef } from './types';

const ref = (kind: GraphRef['kind'], name: string, hash: string, extra: Partial<GraphRef> = {}): GraphRef => ({
  kind,
  name,
  hash,
  ...extra,
});

const refs: GraphRef[] = [
  ref('head', 'main', 'aaa111'),
  ref('head', 'v2', 'bbb222'),
  ref('head', 'v10', 'ccc333'),
  ref('head', 'HEAD', 'aaa111'),
  ref('head', 'glob:all', 'refs/heads/*'),
  ref('remote', 'origin/main', 'aaa111', { remote: 'origin' }),
  ref('remote', 'origin/topic', 'ddd444', { remote: 'origin' }),
  ref('tag', 'v1.0', 'tagobj'),
  ref('tag', 'v1.0', 'eee555'),
  ref('tag', 'v1.10', 'fff666'),
  ref('stash', 'stash@{0}', 'ggg777'),
  ref('worktree', 'wt', 'hhh888', { worktreePath: '/tmp/wt' }),
];

const commits = [
  { hash: 'abcd1234ffff', subject: 'first' },
  { hash: 'abcd9999eeee', subject: 'second' },
  { hash: 'ffff00001111', subject: 'other' },
];

function pick(query: string, limit = 200, branchSort: 'version:refname' | 'refname' = 'version:refname', tagSort: '-version:refname' | 'refname' = '-version:refname') {
  return comparePick({ refs, commits, query, limit, branchSort, tagSort });
}

describe('comparePick', () => {
  it('lists local branches, remote branches, and tags, dropping HEAD, globs, stashes, and worktrees', () => {
    const result = pick('');
    expect(result.truncated).toBe(false);
    expect(result.sections.map((section) => section.title)).toEqual(['Local branches', 'Remote branches', 'Tags']);
    expect(result.sections[0]?.items.map((item) => item.label)).toEqual(['main', 'v2', 'v10']);
    expect(result.sections[0]?.items.map((item) => item.rev)).toEqual(['aaa111', 'bbb222', 'ccc333']);
    expect(result.sections[1]?.items.map((item) => item.label)).toEqual(['remotes/origin/main', 'remotes/origin/topic']);
    expect(result.sections[1]?.items.map((item) => item.rev)).toEqual(['aaa111', 'ddd444']);
    expect(result.sections[2]?.items.map((item) => ({ label: item.label, rev: item.rev }))).toEqual([
      { label: 'v1.10', rev: 'v1.10' },
      { label: 'v1.0', rev: 'v1.0' },
    ]);
  });

  it('filters by display name', () => {
    const result = pick('remotes/origin/t');
    expect(result.sections.map((section) => section.id)).toEqual(['remote']);
    expect(result.sections[0]?.items.map((item) => item.label)).toEqual(['remotes/origin/topic']);
  });

  it('caps the rendered rows and reports the remainder', () => {
    const result = pick('', 2);
    expect(result.truncated).toBe(true);
    expect(result.sections.flatMap((section) => section.items)).toHaveLength(2);
    expect(result.sections.map((section) => section.id)).toEqual(['head']);
  });

  it('offers loaded commits when the query is a hash prefix', () => {
    const result = pick('ABCD');
    const commitsSection = result.sections.find((section) => section.id === 'commit');
    expect(commitsSection?.items).toEqual([
      { kind: 'commit', rev: 'abcd1234ffff', label: 'abcd123', detail: 'first' },
      { kind: 'commit', rev: 'abcd9999eeee', label: 'abcd999', detail: 'second' },
    ]);
    expect(result.sections[0]?.id).toBe('commit');
  });

  it('offers the typed hash when no loaded commit matches', () => {
    const result = pick('deadbeef');
    expect(result.sections.find((section) => section.id === 'commit')?.items).toEqual([
      { kind: 'commit', rev: 'deadbeef', label: 'deadbeef' },
    ]);
  });

  it('ignores hash lookup unless the query is 4 to 64 hex digits', () => {
    expect(pick('abc').sections.some((section) => section.id === 'commit')).toBe(false);
    expect(pick('g' + 'a'.repeat(4)).sections.some((section) => section.id === 'commit')).toBe(false);
    expect(pick('a'.repeat(65)).sections.some((section) => section.id === 'commit')).toBe(false);
    expect(pick('  abcd  ').sections[0]?.id).toBe('commit');
  });
});
