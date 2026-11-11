import { t } from '@vscode/l10n';
import { escapeAttr, escapeHtml } from './issueLinks';

export type MenuItem = { id: string; label: string; disabled?: boolean; title?: string };
export type MenuEntry = MenuItem | 'sep';
export type RebaseTargetKind = 'branch' | 'tag' | 'commit';

export type SelectedRebase = { count: number; disabledReason?: string };

/** Amend is offered on the branch tip only, never detached and never mid-operation. */
export function canAmendHead(opts: { hash: string; head: string | null; currentBranch: string | null; busy: boolean }): boolean {
  return !opts.busy && opts.head != null && opts.hash === opts.head && opts.currentBranch != null;
}

export function rebaseInteractiveLabel(target: RebaseTargetKind): string {
  return t('Rebase interactive on this {0}', rebaseTargetNoun(target));
}

export function rebaseSelectedLabel(count: number, target: RebaseTargetKind): string {
  const branches = count === 1 ? t('branch') : t('branches');
  return t('Rebase selected {0} on this {1}', branches, rebaseTargetNoun(target));
}

function rebaseTargetNoun(target: RebaseTargetKind): string {
  if (target === 'tag') return t('tag');
  if (target === 'commit') return t('commit');
  return t('branch');
}

export function compareMenuEntries(opts: { withHead: boolean; visible: (id: string) => boolean }): MenuItem[] {
  const v = opts.visible;
  return [
    v('compare') && { id: 'cmp', label: t('Compare with…') },
    opts.withHead && v('compareHead') && { id: 'cmp-head', label: t('Compare with HEAD') },
  ].filter((item): item is MenuItem => Boolean(item));
}

export function commitMenuEntries(opts: {
  canReword: boolean;
  canAmend?: boolean;
  isMerge: boolean;
  withHead: boolean;
  visible: (id: string) => boolean;
  cherryPick?: MenuItem;
  createPatch?: MenuItem;
  squashRange?: MenuItem;
  /** Local branches selected to rebase onto this commit. Omit when there are none. */
  selectedRebase?: SelectedRebase;
}): MenuEntry[] {
  const v = opts.visible;
  const groups: MenuItem[][] = [
    keep([v('checkout') && { id: 'c-co', label: t('Checkout (Switch)') }]),
    keep([
      v('branch') && { id: 'c-br', label: t('Create Branch') },
      v('tag') && { id: 'c-tag', label: t('Add Tag') },
      v('worktree') && { id: 'c-wt', label: t('Create worktree') },
    ]),
    keep([
      v('merge') && { id: 'c-mg', label: t('Merge into current branch') },
      v('rebase') && { id: 'c-rb', label: t('Rebase current branch on this commit') },
      v('rebase') && { id: 'rbi', label: rebaseInteractiveLabel('commit') },
      selectedRebaseEntry(opts, 'commit'),
      v('reset') && { id: 'c-rs', label: t('Reset current branch to this commit') },
    ]),
    keep([
      v('reword') && opts.canReword && { id: 'c-rw', label: t('History reword') },
      v('amend') && opts.canAmend === true && { id: 'c-am', label: t('Amend') },
      v('cherry') && (opts.cherryPick ?? { id: 'c-cp', label: t('Cherry Pick') }),
      v('squash') && opts.squashRange ? { ...opts.squashRange } : false,
      v('revert') && { id: 'c-rv', label: t('Revert') },
      v('drop') && !opts.isMerge && { id: 'c-dr', label: t('Drop') },
    ]),
    compareMenuEntries({ withHead: opts.withHead, visible: v }),
    keep([
      v('patch') && (opts.createPatch ?? { id: 'c-patch', label: t('Create patch') }),
      v('applyPatch') && { id: 'c-apply', label: t('Apply patch') },
    ]),
    keep([
      { id: 'copyh', label: t('Copy commit hash') },
      { id: 'copys', label: t('Copy subject') },
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
      other && v('checkout') && { id: 'br-co', label: t('Checkout (Switch) branch') },
      v('rename') && { id: 'br-rn', label: t('Rename branch') },
      other && v('delete') && { id: 'br-del', label: t('Delete Branch') },
      other && v('merge') && { id: 'br-mg', label: t('Merge into current branch') },
      other && v('rebase') && { id: 'br-rb', label: t('Rebase current branch on this branch') },
      other && v('rebase') && { id: 'rbi', label: rebaseInteractiveLabel('branch') },
      selectedRebaseEntry(opts, 'branch'),
      v('push') && { id: 'br-ps', label: t('Push branch') },
    ]),
    compareMenuEntries({ withHead: opts.withHead, visible: v }),
    keep([
      v('pr') && { id: 'pr', label: t('Create PR') },
      v('colour') && { id: 'ref-colour', label: t('Set label colour…') },
      { id: 'copy', label: t('Copy branch name') },
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
    v('checkout') && { id: 'rm-co', label: t('Checkout') },
    v('delete') && { id: 'rm-del', label: t('Delete') },
    v('fetchInto') && { id: 'rm-fi', label: t('Fetch into local') },
    v('merge') && { id: 'rm-mg', label: t('Merge into current branch') },
    v('rebase') && { id: 'rm-rb', label: t('Rebase current branch on this branch') },
    v('pull') && { id: 'rm-pl', label: t('Pull') },
    v('rebase') && { id: 'rbi', label: rebaseInteractiveLabel('branch') },
    selectedRebaseEntry(opts, 'branch'),
  ]);
  const compare = compareMenuEntries({ withHead: opts.withHead, visible: v });
  const tail = keep([
    v('pr') && { id: 'pr', label: t('Create PR') },
    v('colour') && { id: 'ref-colour', label: t('Set label colour…') },
    { id: 'copy', label: t('Copy name') },
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
    v('delete') && { id: 'tag-del', label: t('Delete') },
    v('push') && { id: 'tag-push', label: t('Push') },
    v('rebase') && { id: 'rbi', label: rebaseInteractiveLabel('tag') },
    selectedRebaseEntry(opts, 'tag'),
    v('colour') && { id: 'ref-colour', label: t('Set label colour…') },
    { id: 'copy', label: t('Copy name') },
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
