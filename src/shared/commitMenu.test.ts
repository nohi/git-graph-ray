import { describe, expect, it } from 'vitest';
import { branchMenuEntries, commitMenuEntries, menuHtml } from './commitMenu';

describe('commitMenuEntries', () => {
  it('uses the requested labels and separators', () => {
    const entries = commitMenuEntries({
      canReword: true,
      isMerge: false,
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
      visible: () => true,
    }).filter((e) => e !== 'sep').map((e) => (e as { id: string }).id);
    expect(labels).not.toContain('c-dr');
    expect(labels).not.toContain('c-rw');
  });
});

describe('branchMenuEntries', () => {
  it('offers push and PR on the current branch without switch or history actions', () => {
    expect(branchMenuEntries({ current: true, visible: () => true })).toEqual([
      { id: 'br-rn', label: 'Rename branch' },
      { id: 'br-ps', label: 'Push branch' },
      'sep',
      { id: 'pr', label: 'Create PR' },
      { id: 'copy', label: 'Copy branch name' },
    ]);
  });

  it('hides push and PR on the current branch when visibility is off', () => {
    expect(
      branchMenuEntries({
        current: true,
        visible: (id) => id !== 'push' && id !== 'pr',
      }),
    ).toEqual([
      { id: 'br-rn', label: 'Rename branch' },
      'sep',
      { id: 'copy', label: 'Copy branch name' },
    ]);
  });

  it('lists switch and history actions for other local branches', () => {
    const entries = branchMenuEntries({ current: false, visible: () => true });
    expect(entries).toEqual([
      { id: 'br-co', label: 'Checkout (Switch) branch' },
      { id: 'br-rn', label: 'Rename branch' },
      { id: 'br-del', label: 'Delete Branch' },
      { id: 'br-mg', label: 'Merge into current branch' },
      { id: 'br-rb', label: 'Rebase current branch on this branch' },
      { id: 'br-ps', label: 'Push branch' },
      'sep',
      { id: 'pr', label: 'Create PR' },
      { id: 'copy', label: 'Copy branch name' },
    ]);
  });
});
