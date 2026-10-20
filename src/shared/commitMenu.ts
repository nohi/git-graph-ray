import { escapeAttr, escapeHtml } from './issueLinks';

export type MenuItem = { id: string; label: string; disabled?: boolean; title?: string };
export type MenuEntry = MenuItem | 'sep';
export type RebaseTargetKind = 'branch' | 'tag' | 'commit';

export type SelectedRebase = { count: number; disabledReason?: string };

export function rebaseInteractiveLabel(target: RebaseTargetKind): string {
  return `Rebase interactive on this ${rebaseTargetNoun(target)}`;
}

export function rebaseSelectedLabel(count: number, target: RebaseTargetKind): string {
  const branches = count === 1 ? 'branch' : 'branches';
  return `Rebase selected ${branches} on this ${rebaseTargetNoun(target)}`;
}

function rebaseTargetNoun(target: RebaseTargetKind): string {
  if (target === 'tag') return 'tag';
  if (target === 'commit') return 'commit';
  return 'branch';
}

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
  cherryPick?: MenuItem;
  createPatch?: MenuItem;
  /** Local branches selected to rebase onto this commit. Omit when there are none. */
  selectedRebase?: SelectedRebase;
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
      v('rebase') && { id: 'rbi', label: rebaseInteractiveLabel('commit') },
      selectedRebaseEntry(opts, 'commit'),
      v('reset') && { id: 'c-rs', label: 'Reset current branch to this commit' },
    ]),
    keep([
      v('reword') && opts.canReword && { id: 'c-rw', label: 'History reword' },
      v('cherry') && (opts.cherryPick ?? { id: 'c-cp', label: 'Cherry Pick' }),
      v('revert') && { id: 'c-rv', label: 'Revert' },
      v('drop') && !opts.isMerge && { id: 'c-dr', label: 'Drop' },
    ]),
    compareMenuEntries({ withHead: opts.withHead, visible: v }),
    keep([
      v('patch') && (opts.createPatch ?? { id: 'c-patch', label: 'Create patch' }),
      v('applyPatch') && { id: 'c-apply', label: 'Apply patch' },
    ]),
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
  /** Local branches selected besides this branch. Omit when there are none. */
  selectedRebase?: SelectedRebase;
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
      other && v('rebase') && { id: 'rbi', label: rebaseInteractiveLabel('branch') },
      selectedRebaseEntry(opts, 'branch'),
      v('push') && { id: 'br-ps', label: 'Push branch' },
    ]),
    compareMenuEntries({ withHead: opts.withHead, visible: v }),
    keep([
      v('pr') && { id: 'pr', label: 'Create PR' },
      v('colour') && { id: 'ref-colour', label: 'Set label colour…' },
      { id: 'copy', label: 'Copy branch name' },
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

export function remoteMenuEntries(opts: {
  withHead: boolean;
  visible: (id: string) => boolean;
  /** Local branches selected to rebase onto this remote branch. Omit when there are none. */
  selectedRebase?: SelectedRebase;
}): MenuEntry[] {
  const v = opts.visible;
  const actions = keep([
    v('checkout') && { id: 'rm-co', label: 'Checkout' },
    v('delete') && { id: 'rm-del', label: 'Delete' },
    v('fetchInto') && { id: 'rm-fi', label: 'Fetch into local' },
    v('pull') && { id: 'rm-pl', label: 'Pull' },
    v('rebase') && { id: 'rbi', label: rebaseInteractiveLabel('branch') },
    selectedRebaseEntry(opts, 'branch'),
  ]);
  const compare = compareMenuEntries({ withHead: opts.withHead, visible: v });
  const tail = keep([
    v('pr') && { id: 'pr', label: 'Create PR' },
    v('colour') && { id: 'ref-colour', label: 'Set label colour…' },
    { id: 'copy', label: 'Copy name' },
  ]);
  const out: MenuEntry[] = [...actions];
  if (compare.length) {
    if (out.length) out.push('sep');
    out.push(...compare, 'sep');
  }
  out.push(...tail);
  return out;
}

export function tagMenuEntries(opts: {
  visible: (id: string) => boolean;
  /** Local branches selected to rebase onto this tag. Omit when there are none. */
  selectedRebase?: SelectedRebase;
}): MenuEntry[] {
  const v = opts.visible;
  return keep([
    v('delete') && { id: 'tag-del', label: 'Delete' },
    v('push') && { id: 'tag-push', label: 'Push' },
    v('rebase') && { id: 'rbi', label: rebaseInteractiveLabel('tag') },
    selectedRebaseEntry(opts, 'tag'),
    v('colour') && { id: 'ref-colour', label: 'Set label colour…' },
    { id: 'copy', label: 'Copy name' },
  ]);
}

function selectedRebaseEntry(
  opts: { visible: (id: string) => boolean; selectedRebase?: SelectedRebase },
  target: RebaseTargetKind,
): MenuItem | false {
  const selected = opts.selectedRebase;
  if (!selected || selected.count < 1 || !opts.visible('rebase')) return false;
  const label = rebaseSelectedLabel(selected.count, target);
  return selected.disabledReason ? { id: 'br-rbs', label, disabled: true, title: selected.disabledReason } : { id: 'br-rbs', label };
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
