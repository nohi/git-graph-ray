export type MenuItem = { id: string; label: string };
export type MenuEntry = MenuItem | 'sep';

export function commitMenuEntries(opts: {
  canReword: boolean;
  isMerge: boolean;
  visible: (id: string) => boolean;
}): MenuEntry[] {
  const v = opts.visible;
  const groups: MenuItem[][] = [
    [v('checkout') && { id: 'c-co', label: 'Checkout (Switch)' }],
    [
      v('branch') && { id: 'c-br', label: 'Create Branch' },
      v('tag') && { id: 'c-tag', label: 'Add Tag' },
      v('worktree') && { id: 'c-wt', label: 'Create worktree' },
    ],
    [
      v('merge') && { id: 'c-mg', label: 'Merge into current branch' },
      v('rebase') && { id: 'c-rb', label: 'Rebase current branch on this commit' },
      v('rebase') && { id: 'c-rbi', label: 'Rebase interactive on this commit' },
      v('reset') && { id: 'c-rs', label: 'Reset current branch to this commit' },
    ],
    [
      v('reword') && opts.canReword && { id: 'c-rw', label: 'History reword' },
      v('cherry') && { id: 'c-cp', label: 'Cherry Pick' },
      v('revert') && { id: 'c-rv', label: 'Revert' },
      v('drop') && !opts.isMerge && { id: 'c-dr', label: 'Drop' },
    ],
    [
      { id: 'copyh', label: 'Copy commit hash' },
      { id: 'copys', label: 'Copy subject' },
    ],
  ].map((group) => group.filter((item): item is MenuItem => Boolean(item)));

  const out: MenuEntry[] = [];
  for (const group of groups) {
    if (!group.length) continue;
    if (out.length) out.push('sep');
    out.push(...group);
  }
  return out;
}

export function branchMenuEntries(opts: { current: boolean; visible: (id: string) => boolean }): MenuEntry[] {
  const v = opts.visible;
  const other = !opts.current;
  const groups: MenuItem[][] = [
    [
      other && v('checkout') && { id: 'br-co', label: 'Checkout (Switch) branch' },
      v('rename') && { id: 'br-rn', label: 'Rename branch' },
      other && v('delete') && { id: 'br-del', label: 'Delete Branch' },
      other && v('merge') && { id: 'br-mg', label: 'Merge into current branch' },
      other && v('rebase') && { id: 'br-rb', label: 'Rebase current branch on this branch' },
      v('push') && { id: 'br-ps', label: 'Push branch' },
    ],
    [v('pr') && { id: 'pr', label: 'Create PR' }, { id: 'copy', label: 'Copy branch name' }],
  ].map((group) => group.filter((item): item is MenuItem => Boolean(item)));
  const out: MenuEntry[] = [];
  for (const group of groups) {
    if (!group.length) continue;
    if (out.length) out.push('sep');
    out.push(...group);
  }
  return out;
}

export function menuHtml(entries: MenuEntry[]): string {
  return entries
    .map((entry) =>
      entry === 'sep' ? '<hr class="menu-sep" />' : `<button type="button" data-act="${entry.id}">${entry.label}</button>`,
    )
    .join('');
}
