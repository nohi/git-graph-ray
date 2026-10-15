import { escapeAttr, escapeHtml } from './issueLinks';

export type MenuItem = { id: string; label: string; disabled?: boolean; title?: string };
export type MenuEntry = MenuItem | 'sep';

export function compareMenuEntries(opts: { withHead: boolean; visible: (id: string) => boolean }): MenuItem[] {
  const v = opts.visible;
  return [
    v('compare') && { id: 'cmp', label: 'Compare with…' },
    opts.withHead && v('compareHead') && { id: 'cmp-head', label: 'Compare with HEAD' },
  ].filter((item): item is MenuItem => Boolean(item));
}

export function commitMenuEntries(opts: {
  canReword: boolean;
  isMerge: boolean;
  withHead: boolean;
  visible: (id: string) => boolean;
}): MenuEntry[] {
  const v = opts.visible;
  const groups: MenuItem[][] = [
    keep([v('checkout') && { id: 'c-co', label: 'Checkout (Switch)' }]),
    keep([
      v('branch') && { id: 'c-br', label: 'Create Branch' },
      v('tag') && { id: 'c-tag', label: 'Add Tag' },
      v('worktree') && { id: 'c-wt', label: 'Create worktree' },
    ]),
    keep([
      v('merge') && { id: 'c-mg', label: 'Merge into current branch' },
      v('rebase') && { id: 'c-rb', label: 'Rebase current branch on this commit' },
      v('rebase') && { id: 'c-rbi', label: 'Rebase interactive on this commit' },
      v('reset') && { id: 'c-rs', label: 'Reset current branch to this commit' },
    ]),
    keep([
      v('reword') && opts.canReword && { id: 'c-rw', label: 'History reword' },
      v('cherry') && { id: 'c-cp', label: 'Cherry Pick' },
      v('revert') && { id: 'c-rv', label: 'Revert' },
      v('drop') && !opts.isMerge && { id: 'c-dr', label: 'Drop' },
    ]),
    compareMenuEntries({ withHead: opts.withHead, visible: v }),
    keep([
      { id: 'copyh', label: 'Copy commit hash' },
      { id: 'copys', label: 'Copy subject' },
    ]),
  ];

  const out: MenuEntry[] = [];
  for (const group of groups) {
    if (!group.length) continue;
    if (out.length) out.push('sep');
    out.push(...group);
  }
  return out;
}

export function branchMenuEntries(opts: {
  current: boolean;
  withHead: boolean;
  visible: (id: string) => boolean;
  /** Local branches selected besides the menu target. Omit when there are none. */
  selectedRebase?: { count: number; disabledReason?: string };
}): MenuEntry[] {
  const v = opts.visible;
  const other = !opts.current;
  const groups: MenuItem[][] = [
    keep([
      other && v('checkout') && { id: 'br-co', label: 'Checkout (Switch) branch' },
      v('rename') && { id: 'br-rn', label: 'Rename branch' },
      other && v('delete') && { id: 'br-del', label: 'Delete Branch' },
      other && v('merge') && { id: 'br-mg', label: 'Merge into current branch' },
      other && v('rebase') && { id: 'br-rb', label: 'Rebase current branch on this branch' },
      selectedRebaseEntry(opts),
      v('push') && { id: 'br-ps', label: 'Push branch' },
    ]),
    compareMenuEntries({ withHead: opts.withHead, visible: v }),
    keep([v('pr') && { id: 'pr', label: 'Create PR' }, { id: 'copy', label: 'Copy branch name' }]),
  ];
  const out: MenuEntry[] = [];
  for (const group of groups) {
    if (!group.length) continue;
    if (out.length) out.push('sep');
    out.push(...group);
  }
  return out;
}

function selectedRebaseEntry(opts: {
  visible: (id: string) => boolean;
  selectedRebase?: { count: number; disabledReason?: string };
}): MenuItem | false {
  const selected = opts.selectedRebase;
  if (!selected || selected.count < 1 || !opts.visible('rebase')) return false;
  const label = selected.count === 1 ? 'Rebase selected branch on this branch' : 'Rebase selected branches on this branch';
  return selected.disabledReason
    ? { id: 'br-rbs', label, disabled: true, title: selected.disabledReason }
    : { id: 'br-rbs', label };
}

function keep(items: Array<MenuItem | false>): MenuItem[] {
  return items.filter((item): item is MenuItem => Boolean(item));
}

export function menuHtml(entries: MenuEntry[]): string {
  return entries
    .map((entry) => (entry === 'sep' ? '<hr class="menu-sep" />' : menuButton(entry)))
    .join('');
}

function menuButton(entry: MenuItem): string {
  const disabled = entry.disabled ? ' disabled' : '';
  const title = entry.title ? ` title="${escapeAttr(entry.title)}"` : '';
  return `<button type="button" data-act="${escapeAttr(entry.id)}"${disabled}${title}>${escapeHtml(entry.label)}</button>`;
}
