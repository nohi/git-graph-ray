import { describe, expect, it } from 'vitest';
import { branchMenuEntries, commitMenuEntries, menuHtml } from './commitMenu';

describe('commitMenuEntries', () => {
  it('uses the requested labels and separators', () => {
    const entries = commitMenuEntries({
      canReword: true,
      isMerge: false,
      withHead: true,
      visible: () => true,
    });
    expect(entries).toEqual([
      { id: 'c-co', label: 'Checkout (Switch)' },
      'sep',
      { id: 'c-br', label: 'Create Branch' },
      { id: 'c-tag', label: 'Add Tag' },
      { id: 'c-wt', label: 'Create worktree' },
      'sep',
      { id: 'c-mg', label: 'Merge into current branch' },
      { id: 'c-rb', label: 'Rebase current branch on this commit' },
      { id: 'c-rbi', label: 'Rebase interactive on this commit' },
      { id: 'c-rs', label: 'Reset current branch to this commit' },
      'sep',
      { id: 'c-rw', label: 'History reword' },
      { id: 'c-cp', label: 'Cherry Pick' },
      { id: 'c-rv', label: 'Revert' },
      { id: 'c-dr', label: 'Drop' },
      'sep',
      { id: 'cmp', label: 'Compare with…' },
      { id: 'cmp-head', label: 'Compare with HEAD' },
      'sep',
      { id: 'copyh', label: 'Copy commit hash' },
      { id: 'copys', label: 'Copy subject' },
    ]);
    expect(menuHtml(entries)).toContain('class="menu-sep"');
    expect(menuHtml(entries)).toContain('Checkout (Switch)');
  });

  it('hides drop on merge commits and reword when unavailable', () => {
    const labels = commitMenuEntries({
      canReword: false,
      isMerge: true,
      withHead: true,
      visible: () => true,
    }).filter((e) => e !== 'sep').map((e) => (e as { id: string }).id);
    expect(labels).not.toContain('c-dr');
    expect(labels).not.toContain('c-rw');
  });

  it('hides compare with HEAD when the target is already HEAD and when compare actions are hidden', () => {
    const ids = (withHead: boolean, visible: (id: string) => boolean) =>
      commitMenuEntries({ canReword: false, isMerge: false, withHead, visible })
        .filter((e) => e !== 'sep')
        .map((e) => (e as { id: string }).id);
    expect(ids(false, () => true)).toContain('cmp');
    expect(ids(false, () => true)).not.toContain('cmp-head');
    expect(ids(true, (id) => id !== 'compare' && id !== 'compareHead')).not.toContain('cmp');
    expect(ids(true, (id) => id !== 'compare' && id !== 'compareHead')).not.toContain('cmp-head');
  });
});

describe('branchMenuEntries', () => {
  it('offers push and PR on the current branch without switch or history actions', () => {
    expect(branchMenuEntries({ current: true, withHead: false, visible: () => true })).toEqual([
      { id: 'br-rn', label: 'Rename branch' },
      { id: 'br-ps', label: 'Push branch' },
      'sep',
      { id: 'cmp', label: 'Compare with…' },
      'sep',
      { id: 'pr', label: 'Create PR' },
      { id: 'copy', label: 'Copy branch name' },
    ]);
  });

  it('hides push and PR on the current branch when visibility is off', () => {
    expect(
      branchMenuEntries({
        current: true,
        withHead: false,
        visible: (id) => id !== 'push' && id !== 'pr',
      }),
    ).toEqual([
      { id: 'br-rn', label: 'Rename branch' },
      'sep',
      { id: 'cmp', label: 'Compare with…' },
      'sep',
      { id: 'copy', label: 'Copy branch name' },
    ]);
  });

  it('rebases the selection onto the current branch and disables it when blocked', () => {
    expect(
      branchMenuEntries({
        current: true,
        withHead: false,
        visible: () => true,
        selectedRebase: { count: 2, disabledReason: 'Commit or stash changes first' },
      }),
    ).toContainEqual({
      id: 'br-rbs',
      label: 'Rebase selected branches on this branch',
      disabled: true,
      title: 'Commit or stash changes first',
    });
    expect(menuHtml([{ id: 'br-rbs', label: 'Rebase selected branch on this branch', disabled: true, title: 'Commit or stash changes first' }])).toBe(
      '<button type="button" data-act="br-rbs" disabled title="Commit or stash changes first">Rebase selected branch on this branch</button>',
    );
  });

  it('hides the selection rebase when nothing else is selected or rebase is hidden', () => {
    const shown = branchMenuEntries({ current: false, withHead: true, visible: () => true, selectedRebase: { count: 1 } });
    expect(shown).toContainEqual({ id: 'br-rbs', label: 'Rebase selected branch on this branch' });
    expect(branchMenuEntries({ current: false, withHead: false, visible: () => true }).some((entry) => entry !== 'sep' && entry.id === 'br-rbs')).toBe(false);
    expect(
      branchMenuEntries({ current: false, withHead: false, visible: (id) => id !== 'rebase', selectedRebase: { count: 2 } }).some(
        (entry) => entry !== 'sep' && entry.id === 'br-rbs',
      ),
    ).toBe(false);
  });

  it('lists switch and history actions for other local branches', () => {
    const entries = branchMenuEntries({ current: false, withHead: true, visible: () => true });
    expect(entries).toEqual([
      { id: 'br-co', label: 'Checkout (Switch) branch' },
      { id: 'br-rn', label: 'Rename branch' },
      { id: 'br-del', label: 'Delete Branch' },
      { id: 'br-mg', label: 'Merge into current branch' },
      { id: 'br-rb', label: 'Rebase current branch on this branch' },
      { id: 'br-ps', label: 'Push branch' },
      'sep',
      { id: 'cmp', label: 'Compare with…' },
      { id: 'cmp-head', label: 'Compare with HEAD' },
      'sep',
      { id: 'pr', label: 'Create PR' },
      { id: 'copy', label: 'Copy branch name' },
    ]);
  });
});
