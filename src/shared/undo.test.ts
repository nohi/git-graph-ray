import { describe, expect, it } from 'vitest';
import type { GraphCommit, GraphRef } from './types';
import {
  DIRTY_RESET_WARNING,
  REMOTE_BRANCH_WARNING,
  checkpointsEqual,
  checkpointRefs,
  externalCommitChange,
  formatGitCommand,
  formatRefChange,
  historyRange,
  moveUndo,
  moveUndoSteps,
  rangeLabel,
  rangeTipReset,
  needsUndoDialog,
  planRestore,
  presentPreview,
  previewWindow,
  pushUndo,
  undoLabel,
  undoPolicy,
  type LocalCheckpoint,
  type UndoStack,
} from './undo';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccccccccccccccccccc';
const T = 'dddddddddddddddddddddddddddddddddddddddd';
const S1 = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const S2 = 'ffffffffffffffffffffffffffffffffffffffff';

function point(name: string, hash: string): LocalCheckpoint['branches'][number] {
  return { name, hash };
}

function cp(overrides: Partial<LocalCheckpoint> = {}): LocalCheckpoint {
  return {
    headHash: A,
    branch: 'main',
    branches: [point('main', A)],
    tags: [],
    stashes: [],
    ...overrides,
  };
}

function commit(hash: string, refs: GraphRef[] = [], parents: string[] = []): GraphCommit {
  return {
    hash,
    parents,
    authorName: '',
    authorEmail: '',
    authorDate: 0,
    committerName: '',
    committerEmail: '',
    committerDate: 0,
    subject: hash.slice(0, 7),
    refs,
  };
}

describe('undoPolicy', () => {
  it('skips remotes, worktrees, clean, and interactive rebase', () => {
    expect(undoPolicy({ kind: 'fetchRemote', prune: false, pruneTags: false }).record).toBe(false);
    expect(undoPolicy({ kind: 'pushBranch', name: 'main', remotes: ['origin'], setUpstream: false, mode: 'normal' }).record).toBe(false);
    expect(undoPolicy({ kind: 'pushTag', name: 'v1', remotes: ['origin'] }).record).toBe(false);
    expect(undoPolicy({ kind: 'deleteRemoteBranch', remote: 'origin', name: 'origin/feature' }).record).toBe(false);
    expect(undoPolicy({ kind: 'worktreeAdd', hash: A, path: '/tmp/wt' }).record).toBe(false);
    expect(undoPolicy({ kind: 'worktreeRemove', path: '/tmp/wt', force: false }).record).toBe(false);
    expect(undoPolicy({ kind: 'worktreeOpen', path: '/tmp/wt', newWindow: false }).record).toBe(false);
    expect(undoPolicy({ kind: 'cleanUntracked', directories: false }).record).toBe(false);
    expect(undoPolicy({ kind: 'rebase', ref: 'main', ignoreDate: false, interactive: true }).record).toBe(false);
  });

  it('records local history and warns when a remote was also touched', () => {
    expect(undoPolicy({ kind: 'reset', hash: A, mode: 'hard' })).toEqual({ record: true, warning: null });
    expect(undoPolicy({ kind: 'rebase', ref: 'main', ignoreDate: false, interactive: false }).record).toBe(true);
    expect(undoPolicy({ kind: 'pullBranch', remote: 'origin', branch: 'main', noFastForward: false, squash: false, squashMessageFormat: 'Default' }).warning).toMatch(/remote-tracking/);
    expect(undoPolicy({ kind: 'fetchIntoLocal', local: 'main', remoteRef: 'origin/main', force: false }).warning).toMatch(/local branch/);
    expect(
      undoPolicy({
        kind: 'checkoutBranch',
        name: 'main',
        pullAfterwards: { remote: 'origin', branch: 'main', noFastForward: false, squash: false, squashMessageFormat: 'Default' },
      }).warning,
    ).toMatch(/pulled/);
    expect(undoPolicy({ kind: 'deleteBranch', name: 'feature', force: false, deleteOnRemote: 'origin' }).warning).toMatch(/remote branch/);
    expect(undoPolicy({ kind: 'deleteTag', name: 'v1', deleteOnRemote: 'origin' }).warning).toMatch(/remote tag/);
    expect(undoPolicy({ kind: 'addTag', hash: A, name: 'v1', annotated: false, pushTo: ['origin'] }).warning).toMatch(/pushed/);
    expect(undoPolicy({ kind: 'addTag', hash: A, name: 'v1', annotated: false }).warning).toBeNull();
    expect(undoPolicy({ kind: 'addTag', hash: A, name: 'v1', annotated: false, pushTo: [] }).warning).toBeNull();
    expect(undoPolicy({ kind: 'checkoutBranch', name: 'main' }).warning).toBeNull();
  });
});

describe('undoLabel', () => {
  it('names the local operation', () => {
    expect(undoLabel({ kind: 'merge', ref: 'feature', noCommit: false, noFastForward: false, squash: false, squashMessageFormat: 'Default' })).toBe('Merge feature');
    expect(
      undoLabel({ kind: 'rebaseBranches', onto: 'main', branches: ['a', 'b'], ignoreDate: false, checkout: 'restore', onFailure: 'skip' }),
    ).toBe('Rebase 2 branches onto main');
    expect(undoPolicy({ kind: 'rebaseBranches', onto: 'main', branches: ['a'], ignoreDate: true, checkout: 'stay', onFailure: 'stop' }).record).toBe(true);
    expect(undoLabel({ kind: 'reset', hash: A, mode: 'mixed' })).toBe('Reset to aaaaaaa');
    expect(undoLabel({ kind: 'stashApply', name: 'stash@{0}', pop: true, reinstateIndex: false })).toBe('Pop stash');
  });
});

describe('planRestore', () => {
  it('resets the checked-out branch and warns when that discards uncommitted changes', () => {
    const plan = planRestore({
      current: cp({ headHash: B, branches: [point('main', B)] }),
      target: cp(),
      remotes: [],
      dirty: true,
      actionWarning: null,
    });
    expect(plan.args).toEqual([['reset', '--hard', A]]);
    expect(plan.commands).toEqual([`git reset --hard ${A}`]);
    expect(plan.hardReset).toBe(true);
    expect(plan.warning).toBe(DIRTY_RESET_WARNING);
    expect(needsUndoDialog(plan, false)).toBe(true);
  });

  it('does not force a dialog for a clean reset when preview is off', () => {
    const plan = planRestore({
      current: cp({ headHash: B, branches: [point('main', B)] }),
      target: cp(),
      remotes: [],
      dirty: false,
      actionWarning: null,
    });
    expect(plan.hardReset).toBe(false);
    expect(plan.warning).toBeNull();
    expect(needsUndoDialog(plan, false)).toBe(false);
    expect(needsUndoDialog(plan, true)).toBe(true);
  });

  it('checks out another branch without moving a clean tip', () => {
    const plan = planRestore({
      current: cp({ branch: null, headHash: B, branches: [point('main', A)] }),
      target: cp(),
      remotes: [],
      dirty: true,
      actionWarning: null,
    });
    expect(plan.args).toEqual([['checkout', 'main']]);
    expect(plan.hardReset).toBe(false);
  });

  it('creates, switches, and deletes through a rename', () => {
    const plan = planRestore({
      current: cp({ branch: 'feature', branches: [point('feature', A)] }),
      target: cp(),
      remotes: [],
      dirty: false,
      actionWarning: null,
    });
    expect(plan.args).toEqual([
      ['update-ref', 'refs/heads/main', A],
      ['checkout', 'main'],
      ['update-ref', '-d', 'refs/heads/feature', A],
    ]);
  });

  it('moves a branch after leaving it', () => {
    const plan = planRestore({
      current: cp({ branch: 'feature', headHash: B, branches: [point('feature', B), point('main', A)] }),
      target: cp({ branches: [point('feature', C), point('main', A)] }),
      remotes: [],
      dirty: false,
      actionWarning: null,
    });
    expect(plan.args).toEqual([
      ['checkout', 'main'],
      ['update-ref', 'refs/heads/feature', C, B],
    ]);
  });

  it('deletes a branch that is not checked out', () => {
    const plan = planRestore({
      current: cp({ branches: [point('feature', B), point('main', A)] }),
      target: cp(),
      remotes: [],
      dirty: false,
      actionWarning: null,
    });
    expect(plan.args).toEqual([['update-ref', '-d', 'refs/heads/feature', B]]);
  });

  it('restores tags by object id', () => {
    const plan = planRestore({
      current: cp({ tags: [{ name: 'v1', hash: T, commit: A }] }),
      target: cp(),
      remotes: [],
      dirty: false,
      actionWarning: null,
    });
    expect(plan.args).toEqual([['update-ref', '-d', 'refs/tags/v1', T]]);
  });

  it('rebuilds the stash stack oldest first', () => {
    const plan = planRestore({
      current: cp({ stashes: [{ hash: S1, message: 'new' }] }),
      target: cp({
        stashes: [
          { hash: S1, message: 'new' },
          { hash: S2, message: 'old work' },
        ],
      }),
      remotes: [],
      dirty: false,
      actionWarning: null,
    });
    expect(plan.args).toEqual([
      ['update-ref', '-d', 'refs/stash'],
      ['stash', 'store', '-m', 'old work', S2],
      ['stash', 'store', '-m', 'new', S1],
    ]);
    expect(plan.commands[1]).toBe(`git stash store -m 'old work' ${S2}`);
  });

  it('drops the stash when the target has none', () => {
    const plan = planRestore({
      current: cp({ stashes: [{ hash: S1, message: 'wip' }] }),
      target: cp(),
      remotes: [],
      dirty: false,
      actionWarning: null,
    });
    expect(plan.args).toEqual([['update-ref', '-d', 'refs/stash']]);
  });

  it('warns when a moved local tip is also a remote tip, and still moves only the local branch', () => {
    const plan = planRestore({
      current: cp({ headHash: B, branches: [point('main', B)] }),
      target: cp(),
      remotes: [{ name: 'origin/main', hash: B }],
      dirty: false,
      actionWarning: 'This pull updated remote-tracking branches. Only the local branch is restored.',
    });
    expect(plan.args).toEqual([['reset', '--hard', A]]);
    expect(plan.warning).toContain('remote-tracking branches');
    expect(plan.warning).toContain(REMOTE_BRANCH_WARNING);
    expect(plan.commands.some((line) => line.includes('refs/remotes'))).toBe(false);
  });

  it('quotes arguments that contain spaces', () => {
    expect(formatGitCommand(['stash', 'store', '-m', "it's mine", A])).toBe(`git stash store -m 'it'\\''s mine' ${A}`);
  });

  it('uses reset --soft for a commit so the changes stay in the index', () => {
    const plan = planRestore({
      current: cp({ headHash: B, branches: [point('main', B)] }),
      target: cp(),
      remotes: [],
      dirty: true,
      actionWarning: null,
      tipReset: 'soft',
    });
    expect(plan.args).toEqual([['reset', '--soft', A]]);
    expect(plan.hardReset).toBe(false);
    expect(plan.warning).toBeNull();
  });

  it('lists ref movements with short hashes', () => {
    const plan = planRestore({
      current: cp({ headHash: B, branches: [point('main', B)] }),
      target: cp(),
      remotes: [],
      dirty: false,
      actionWarning: null,
    });
    expect(plan.changes.map(formatRefChange)).toEqual(['main: bbbbbbb → aaaaaaa']);
  });
});

describe('externalCommitChange', () => {
  it('recognizes a commit and an amend on the current branch', () => {
    const prev = cp();
    const committed = cp({ headHash: B, branches: [point('main', B)] });
    expect(
      externalCommitChange({ prev, next: committed, parentOfNext: A, parentOfPrev: null, subject: 'Add graph\n\nbody' }),
    ).toEqual({ label: 'Commit Add graph', tipReset: 'soft' });
    const amended = cp({ headHash: C, branches: [point('main', C)] });
    expect(
      externalCommitChange({ prev: committed, next: amended, parentOfNext: A, parentOfPrev: A, subject: 'Add graph' }),
    ).toEqual({ label: 'Amend Add graph', tipReset: 'soft' });
  });

  it('ignores a commit that also moves another branch', () => {
    expect(
      externalCommitChange({
        prev: cp({ branches: [point('main', A), point('feature', A)] }),
        next: cp({ headHash: B, branches: [point('main', B), point('feature', C)] }),
        parentOfNext: A,
        parentOfPrev: null,
        subject: 'wip',
      }),
    ).toBeNull();
  });
});

describe('presentPreview', () => {
  const main = (hash: string): GraphRef => ({ kind: 'head', name: 'main', hash });
  const feature = (hash: string): GraphRef => ({ kind: 'head', name: 'feature', hash });
  const docs = (hash: string): GraphRef => ({ kind: 'head', name: 'docs', hash });
  const F = C;
  const M = B;
  const D = T;

  it('keeps the merged branch and drops a branch that is not part of the merge', () => {
    const before = [commit(F, [feature(F)], [A]), commit(D, [docs(D)], [A]), commit(A, [main(A)])];
    const after = [commit(M, [main(M)], [A, F]), commit(F, [feature(F)], [A]), commit(D, [docs(D)], [A]), commit(A, [])];
    const slice = previewWindow(before, after);
    const hidden = presentPreview(slice.before, slice.after, false);
    const shown = presentPreview(slice.before, slice.after, true);
    for (const view of [hidden.before, hidden.after]) {
      expect(view.map((item) => item.hash)).toContain(F);
      expect(view.map((item) => item.hash)).not.toContain(D);
      expect(view.some((item) => item.refs.some((ref) => ref.name === 'feature'))).toBe(true);
      expect(view.some((item) => item.refs.some((ref) => ref.name === 'docs'))).toBe(false);
    }
    expect(hidden.before.find((item) => item.hash === M)?.ghost).toBe(true);
    expect(shown.before.map((item) => item.hash)).toContain(D);
    expect(shown.after.map((item) => item.hash)).toContain(D);
  });

  it('draws a deleted branch as a ghost on the side that lost it', () => {
    const before = [commit(F, [feature(F)], [A]), commit(A, [main(A)])];
    const after = [commit(A, [main(A)])];
    const view = presentPreview(before, after, false);
    const ghost = view.after.find((item) => item.hash === F);
    expect(view.before.find((item) => item.hash === F)?.ghost).toBe(false);
    expect(ghost?.ghost).toBe(true);
    expect(ghost?.refs.map((ref) => ref.name)).toEqual(['feature']);
    expect(view.after.map((item) => item.hash)).toContain(A);
  });

  it('shows the checked-out branch only when Show HEAD is on', () => {
    const head = S1;
    const base = S2;
    const before = [commit(head, [main(head)], [base]), commit(base, [], [A]), commit(F, [feature(F)], [A]), commit(A, [])];
    const after = [commit(head, [main(head)], [base]), commit(base, [], [A]), commit(B, [feature(B)], [F]), commit(F, [], [A]), commit(A, [])];
    const headRef = { branch: 'main', hash: head };
    const slice = previewWindow(before, after, headRef);
    expect(slice.before.map((item) => item.hash)).toContain(head);
    const hidden = presentPreview(slice.before, slice.after, { showUnrelated: false, showHead: false, head: headRef });
    const shown = presentPreview(slice.before, slice.after, { showUnrelated: false, showHead: true, head: headRef });
    expect(hidden.before.some((item) => item.refs.some((ref) => ref.name === 'main' && ref.hash === head))).toBe(false);
    expect(shown.before.some((item) => item.hash === head && item.refs.some((ref) => ref.name === 'main'))).toBe(true);
    expect(shown.before.some((item) => item.refs.some((ref) => ref.name === 'feature'))).toBe(true);
  });
});

describe('checkpoints and stack', () => {
  it('treats identical checkpoints as equal', () => {
    expect(checkpointsEqual(cp(), cp())).toBe(true);
    expect(checkpointsEqual(cp(), cp({ headHash: B, branches: [point('main', B)] }))).toBe(false);
  });

  it('pushes undo entries and clears redo', () => {
    const stack: UndoStack = { undo: [], redo: [] };
    const entry = { label: 'Reset', actionWarning: null, before: cp(), after: cp({ headHash: B, branches: [point('main', B)] }) };
    pushUndo(stack, entry, 2);
    pushUndo(stack, { ...entry, label: '2' }, 2);
    pushUndo(stack, { ...entry, label: '3' }, 2);
    expect(stack.undo.map((item) => item.label)).toEqual(['2', '3']);
    stack.redo.push(entry);
    pushUndo(stack, { ...entry, label: '4' }, 2);
    expect(stack.redo).toEqual([]);
  });

  it('undoes and redoes several steps back to one checkpoint', () => {
    const at = (hash: string) => cp({ headHash: hash, branches: [point('main', hash)] });
    const first = { label: 'Commit 1', actionWarning: null, before: at(A), after: at(B), tipReset: 'soft' as const };
    const second = { label: 'Commit 2', actionWarning: 'pulled', before: at(B), after: at(C), tipReset: 'soft' as const };
    const stack: UndoStack = { undo: [first, second], redo: [] };
    const undo = historyRange(stack.undo, 'undo', 2);
    expect(undo?.from).toEqual(at(C));
    expect(undo?.to).toEqual(at(A));
    expect(rangeLabel(undo!.entries)).toBe('Commit 2 (+1 more)');
    expect(rangeTipReset(undo!.entries)).toBe('soft');
    moveUndoSteps(stack, 'undo', 2);
    expect(stack.undo).toEqual([]);
    const redo = historyRange(stack.redo, 'redo', 2);
    expect(redo?.from).toEqual(at(A));
    expect(redo?.to).toEqual(at(C));
    expect(historyRange([first, { ...second, before: at(A) }], 'undo', 2)).toBeNull();
  });

  it('moves the top entry between undo and redo', () => {
    const entry = { label: 'Reset', actionWarning: null, before: cp(), after: cp() };
    const stack: UndoStack = { undo: [entry], redo: [] };
    expect(moveUndo(stack, 'undo')?.label).toBe('Reset');
    expect(stack.undo).toEqual([]);
    expect(stack.redo).toEqual([entry]);
    expect(moveUndo(stack, 'redo')).toBe(entry);
    expect(stack.undo).toEqual([entry]);
  });
});

describe('previewWindow', () => {
  it('keeps a contiguous span around commits whose refs differ', () => {
    const refs = (name: string, hash: string): GraphRef => ({ kind: 'head', name, hash });
    const before = [commit('1'), commit('2', [refs('main', '2')]), commit('3'), commit('4')];
    const after = [commit('1'), commit('2'), commit('3', [refs('main', '3')]), commit('4')];
    const window = previewWindow(before, after);
    expect(window.before.map((item) => item.hash)).toEqual(['1', '2', '3', '4']);
    expect(window.after.map((item) => item.hash)).toEqual(['1', '2', '3', '4']);
  });

  it('returns nothing when the graphs match', () => {
    const rows = [commit('1'), commit('2')];
    expect(previewWindow(rows, rows)).toEqual({ before: [], after: [] });
  });
});

describe('checkpointRefs', () => {
  it('places local refs from the checkpoint and leaves remote refs in place', () => {
    const remote: GraphRef = { kind: 'remote', name: 'origin/main', hash: B, remote: 'origin' };
    const refs = checkpointRefs(
      cp({
        branch: null,
        headHash: A,
        branches: [point('feature', C)],
        tags: [{ name: 'v1', hash: T, commit: A }],
        stashes: [{ hash: S1, message: 'wip' }],
      }),
      [remote, { kind: 'remote', name: 'origin/HEAD', hash: B, remote: 'origin' }],
    );
    expect(refs).toEqual([
      { kind: 'head', name: 'feature', hash: C },
      { kind: 'head', name: 'HEAD', hash: A },
      { kind: 'tag', name: 'v1', hash: A },
      { kind: 'stash', name: 'stash@{0} wip', hash: S1 },
      remote,
    ]);
  });
});
