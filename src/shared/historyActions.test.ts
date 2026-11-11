import { describe, expect, it } from 'vitest';
import { checkSquashRange, cherryPickPlan, detectPatchKind, displayedRange, patchFileName, safeRepoPaths, toggleCommitSelection } from './historyActions';

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

describe('checkSquashRange', () => {
  const line = [
    { hash: 'e', parents: ['d'] },
    { hash: 'd', parents: ['c'] },
    { hash: 'c', parents: ['b'] },
    { hash: 'b', parents: ['a'] },
    { hash: 'a', parents: [] },
  ];
  const at = (range: string[], tip = 'e', branch: string | null = 'main', busy = false) =>
    checkSquashRange({ commits: line, range, tip, branch, busy });

  it('accepts the tip run and returns oldest-first hashes with the base', () => {
    expect(at(['e', 'd', 'c'])).toEqual({ ok: true, hashes: ['c', 'd', 'e'], base: 'b' });
    expect(at(['d', 'e'])).toEqual({ ok: true, hashes: ['d', 'e'], base: 'c' });
  });

  it('ignores the uncommitted row and then needs two commits', () => {
    expect(at(['*', 'e', 'd'])).toEqual({ ok: true, hashes: ['d', 'e'], base: 'c' });
    expect(at(['*', 'e'])).toEqual({ ok: false, reason: 'Select two or more commits to squash.' });
    expect(at(['e'])).toEqual({ ok: false, reason: 'Select two or more commits to squash.' });
  });

  it('refuses detached HEAD and mid-operation states', () => {
    expect(at(['e', 'd'], 'e', null)).toEqual({ ok: false, reason: 'Check out a branch to squash.' });
    expect(at(['e', 'd'], 'e', 'main', true)).toEqual({ ok: false, reason: 'A Git operation is already in progress' });
  });

  it('refuses ranges that do not start at the tip or skip commits', () => {
    expect(at(['d', 'c'])).toEqual({ ok: false, reason: 'Select consecutive commits starting at the branch tip.' });
    expect(at(['e', 'c'])).toEqual({ ok: false, reason: 'Select consecutive commits with no gaps.' });
    expect(at(['e', 'missing'])).toEqual({ ok: false, reason: 'Select consecutive commits with no gaps.' });
  });

  it('refuses merges and the root commit', () => {
    const fork = [
      { hash: 'e', parents: ['d'] },
      { hash: 'd', parents: ['c', 'x'] },
      { hash: 'c', parents: ['b'] },
      { hash: 'b', parents: ['a'] },
      { hash: 'a', parents: [] },
    ];
    expect(checkSquashRange({ commits: fork, range: ['e', 'd'], tip: 'e', branch: 'main', busy: false })).toEqual({
      ok: false,
      reason: 'Merge commits cannot be squashed.',
    });
    expect(at(['e', 'd', 'c', 'b', 'a'])).toEqual({ ok: false, reason: 'The root commit cannot be squashed.' });
  });

  it('refuses a range that runs past the loaded history', () => {
    const shallow = [{ hash: 'e', parents: ['x'] }];
    expect(checkSquashRange({ commits: shallow, range: ['e', 'x'], tip: 'e', branch: 'main', busy: false })).toEqual({
      ok: false,
      reason: 'Cannot squash past the loaded history.',
    });
  });
});
