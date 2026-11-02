import { describe, expect, it } from 'vitest';
import {
  branchNameAt,
  classifyCompareFiles,
  compareBanners,
  compareFileKey,
  compareOpenDiff,
  compareRelation,
} from './compareSplit';
import type { FileChange, GraphRef } from './types';

function file(path: string, status: FileChange['status'] = 'M', oldPath?: string): FileChange {
  return oldPath ? { path, status, oldPath } : { path, status };
}

describe('compareFileKey', () => {
  it('uses the path at the common parent', () => {
    expect(compareFileKey(file('src/a.ts'))).toBe('src/a.ts');
    expect(compareFileKey(file('src/b.ts', 'R', 'src/a.ts'))).toBe('src/a.ts');
  });
});

describe('classifyCompareFiles', () => {
  it('keeps files that only one side touched and preserves diff order', () => {
    const groups = classifyCompareFiles(
      [file('a.ts'), file('b.ts'), file('c.ts')],
      [file('z.ts'), file('b.ts', 'A'), file('y.ts')],
    );
    expect(groups.leftOnly.map((item) => item.path)).toEqual(['a.ts', 'c.ts']);
    expect(groups.rightOnly.map((item) => item.path)).toEqual(['z.ts', 'y.ts']);
    expect(groups.both.map((item) => item.key)).toEqual(['b.ts']);
    expect(groups.both[0]?.right.status).toBe('A');
  });

  it('pairs a rename with an edit of the original path', () => {
    const groups = classifyCompareFiles([file('src/b.ts', 'R', 'src/a.ts')], [file('src/a.ts')]);
    expect(groups.leftOnly).toEqual([]);
    expect(groups.rightOnly).toEqual([]);
    expect(groups.both).toEqual([
      {
        key: 'src/a.ts',
        left: file('src/b.ts', 'R', 'src/a.ts'),
        right: file('src/a.ts'),
      },
    ]);
  });

  it('pairs two adds of the same path and leaves a rename to that path separate', () => {
    const groups = classifyCompareFiles(
      [file('foo.ts', 'A')],
      [file('foo.ts', 'A'), file('foo.ts', 'R', 'bar.ts')],
    );
    expect(groups.both.map((item) => item.key)).toEqual(['foo.ts']);
    expect(groups.rightOnly).toEqual([file('foo.ts', 'R', 'bar.ts')]);
  });

  it('pairs a delete with a modification of the same path', () => {
    const groups = classifyCompareFiles([file('foo.ts', 'D')], [file('foo.ts')]);
    expect(groups.both).toHaveLength(1);
    expect(groups.leftOnly).toEqual([]);
    expect(groups.rightOnly).toEqual([]);
  });
});

describe('compareRelation', () => {
  it('reports the same commit, an ancestor, and a diverge', () => {
    expect(compareRelation('aaa', 'aaa', 'aaa')).toBe('same');
    expect(compareRelation('other', 'aaa', 'aaa')).toBe('same');
    expect(compareRelation('bbb', 'aaa', 'bbb')).toBe('left-contains-right');
    expect(compareRelation('aaa', 'aaa', 'bbb')).toBe('right-contains-left');
    expect(compareRelation('base', 'aaa', 'bbb')).toBe('diverged');
  });
});

describe('compareBanners', () => {
  const labels = { leftLabel: 'abc1234', rightLabel: 'def5678', baseLabel: 'aaa1111' };

  it('names the ancestor and the chosen parent when several exist', () => {
    expect(
      compareBanners({
        ...labels,
        relation: 'left-contains-right',
        severalParents: true,
        leftEmpty: true,
        rightEmpty: true,
      }),
    ).toEqual(['Several common parents. Using aaa1111.', 'def5678 is an ancestor of abc1234.']);
    expect(
      compareBanners({
        ...labels,
        relation: 'right-contains-left',
        severalParents: false,
        leftEmpty: true,
        rightEmpty: false,
      }),
    ).toEqual(['abc1234 is an ancestor of def5678.']);
  });

  it('says when the commits are the same', () => {
    expect(
      compareBanners({ ...labels, relation: 'same', severalParents: false, leftEmpty: true, rightEmpty: true }),
    ).toEqual(['These commits are the same.']);
  });

  it('mentions an empty side only when the tips have diverged', () => {
    expect(
      compareBanners({
        ...labels,
        relation: 'diverged',
        severalParents: false,
        leftEmpty: true,
        rightEmpty: false,
      }),
    ).toEqual(['abc1234 has no file changes since the common parent.']);
    expect(
      compareBanners({
        ...labels,
        relation: 'diverged',
        severalParents: false,
        leftEmpty: false,
        rightEmpty: false,
      }),
    ).toEqual([]);
  });
});

describe('compareOpenDiff', () => {
  it('opens a since-diverge file against the common parent', () => {
    expect(
      compareOpenDiff({ view: 'diverge', hash: 'left', compare: 'right', base: 'base', rev: 'right' }),
    ).toEqual({ hash: 'right', parent: 'base' });
  });

  it('keeps the direct diff for snapshot, even when a row carries a side revision', () => {
    expect(
      compareOpenDiff({ view: 'snapshot', hash: 'left', compare: 'right', base: 'base', rev: 'right' }),
    ).toEqual({ hash: 'left', compare: 'right' });
  });

  it('falls back to the direct diff when there is no common parent', () => {
    expect(compareOpenDiff({ view: 'diverge', hash: 'left', compare: 'right', rev: 'right' })).toEqual({
      hash: 'left',
      compare: 'right',
    });
  });
});

describe('branchNameAt', () => {
  const hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const ref = (kind: GraphRef['kind'], name: string, at = hash): GraphRef => ({ kind, name, hash: at });

  it('uses the only local branch, then the only remote branch', () => {
    expect(branchNameAt(hash, [ref('head', 'feature/hoge'), ref('tag', 'v1')])).toBe('feature/hoge');
    expect(branchNameAt(hash, [ref('remote', 'origin/main'), ref('tag', 'v1')])).toBe('remotes/origin/main');
  });

  it('leaves the hash when several branches share the commit', () => {
    expect(branchNameAt(hash, [ref('head', 'main'), ref('head', 'release')])).toBeUndefined();
    expect(branchNameAt(hash, [ref('remote', 'origin/main'), ref('remote', 'fork/main')])).toBeUndefined();
    expect(branchNameAt(hash, [ref('head', 'HEAD'), ref('tag', 'v1')])).toBeUndefined();
  });
});
