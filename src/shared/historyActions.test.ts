import { describe, expect, it } from 'vitest';
import { cherryPickPlan, detectPatchKind, displayedRange, patchFileName, safeRepoPaths, toggleCommitSelection } from './historyActions';

const commits = [
  { hash: '*', parents: ['c'] },
  { hash: 'c', parents: ['b'] },
  { hash: 'm', parents: ['b', 'd'] },
  { hash: 'b', parents: ['a'] },
  { hash: 'a', parents: [] },
];

describe('toggleCommitSelection', () => {
  it('starts from nothing, pairs with the open commit, and toggles individuals', () => {
    expect(toggleCommitSelection([], 'b', null)).toEqual(['b']);
    expect(toggleCommitSelection([], 'b', 'a')).toEqual(['a', 'b']);
    expect(toggleCommitSelection([], 'a', 'a')).toEqual([]);
    expect(toggleCommitSelection(['a', 'b'], 'd')).toEqual(['a', 'b', 'd']);
    expect(toggleCommitSelection(['a', 'b', 'd'], 'b')).toEqual(['a', 'd']);
  });

  it('leaves the uncommitted row out of the selection', () => {
    expect(toggleCommitSelection(['a'], '*')).toEqual(['a']);
    expect(toggleCommitSelection([], '*', 'a')).toEqual([]);
  });
});

describe('displayedRange', () => {
  it('returns the inclusive span from top to bottom', () => {
    expect(displayedRange(commits, 'c', 'b')).toEqual(['c', 'm', 'b']);
    expect(displayedRange(commits, 'b', 'c')).toEqual(['c', 'm', 'b']);
  });

  it('is empty when an endpoint is missing', () => {
    expect(displayedRange(commits, 'c', 'missing')).toEqual([]);
  });
});

describe('cherryPickPlan', () => {
  it('orders oldest first and skips merges and the uncommitted row', () => {
    expect(cherryPickPlan(commits, ['*', 'c', 'm', 'b'])).toEqual({
      commits: [
        { hash: 'b', parents: ['a'] },
        { hash: 'c', parents: ['b'] },
      ],
      skippedMerges: 1,
    });
  });
});

describe('detectPatchKind', () => {
  it('treats a format-patch mailbox as commits', () => {
    const sha = 'a'.repeat(40);
    expect(detectPatchKind(`From ${sha} Mon Sep 17 00:00:00 2001\n`)).toBe('am');
  });

  it('treats a raw diff as a working-tree patch', () => {
    expect(detectPatchKind('diff --git a/src/a.ts b/src/a.ts\n')).toBe('apply');
  });
});

describe('patchFileName', () => {
  it('strips characters a file name cannot use', () => {
    expect(patchFileName('Add: graph/view?')).toBe('Add graph view.patch');
  });
});

describe('safeRepoPaths', () => {
  it('keeps repo-relative paths', () => {
    expect(safeRepoPaths(['src/a.ts', 'src\\b.ts'])).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('rejects paths that leave the repository', () => {
    expect(() => safeRepoPaths(['../secret'])).toThrow(/Invalid path/);
    expect(() => safeRepoPaths(['/etc/passwd'])).toThrow(/Invalid path/);
    expect(() => safeRepoPaths(['C:/Windows/note.txt'])).toThrow(/Invalid path/);
  });
});
