/**
 * One-time copy of settings saved under the keys used before v0.8.0.
 * Old values are left in place so they can be checked and deleted by hand.
 */

export type SettingLayer = 'global' | 'workspace';

export type LayerValues = { global?: unknown; workspace?: unknown };

export type SettingWrite = { key: string; value: unknown; layer: SettingLayer };

type Convert = (value: unknown) => unknown;

const bool: Convert = (value) => (typeof value === 'boolean' ? value : undefined);
const num: Convert = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const str: Convert = (value) => (typeof value === 'string' ? value : undefined);
const obj: Convert = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : undefined);

function oneOf(map: Record<string, string>): Convert {
  return (value) => (typeof value === 'string' && Object.prototype.hasOwnProperty.call(map, value) ? map[value] : undefined);
}

/** Array of objects with one property renamed. Rows missing a field are dropped. */
function rows(fields: Record<string, string>): Convert {
  return (value) => {
    if (!Array.isArray(value)) return undefined;
    return value
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map((row) => {
        const out: Record<string, unknown> = {};
        for (const [from, to] of Object.entries(fields)) out[to] = row[from];
        return out;
      })
      .filter((row) => Object.values(row).every((v) => typeof v === 'string'));
  };
}

/** `CTRL/CMD + F` becomes `mod+f`. `UNASSIGNED` turns the shortcut off. */
export function legacyShortcut(value: unknown): string | undefined {
  if (value === 'UNASSIGNED') return '';
  const letter = typeof value === 'string' ? value.match(/^CTRL\/CMD \+ ([A-Z])$/)?.[1] : undefined;
  return letter ? `mod+${letter.toLowerCase()}` : undefined;
}

/** Old key (without the `git-graph-ray.` prefix), new key, and value conversion. */
export const LEGACY_SETTING_RULES: ReadonlyArray<readonly [string, string, Convert]> = [
  ['commitDetailsView.maxHeight', 'details.maxHeight', num],
  ['commitDetailsView.fileView.fileTree.compactFolders', 'details.foldSingleFolders', bool],
  ['commitDetailsView.fileView.type', 'details.files', oneOf({ 'File Tree': 'tree', 'File List': 'list' })],
  ['commitDetailsView.location', 'details.place', oneOf({ Inline: 'inline', 'Docked to Bottom': 'bottom' })],
  ['markdown', 'details.markdown', bool],
  ['contextMenuActionsVisibility', 'menus', obj],
  ['customBranchGlobPatterns', 'branches.globs', rows({ name: 'name', glob: 'pattern' })],
  ['customEmojiShortcodeMappings', 'emoji', rows({ shortcode: 'code', emoji: 'emoji' })],
  ['customPullRequestProviders', 'pullRequests', rows({ name: 'name', templateUrl: 'url' })],
  [
    'date.format',
    'when.format',
    oneOf({
      'Date & Time': 'datetime',
      'Date Only': 'date',
      'ISO Date & Time': 'iso',
      'ISO Date Only': 'isoDate',
      Relative: 'relative',
    }),
  ],
  ['defaultColumnVisibility', 'columns', obj],
  ['fileEncoding', 'files.encoding', str],
  ['graph.colours', 'graph.palette', (v) => (Array.isArray(v) && v.every((c) => typeof c === 'string') ? v : undefined)],
  ['graph.style', 'graph.bend', oneOf({ rounded: 'curve', angular: 'corner' })],
  [
    'graph.uncommittedChanges',
    'history.openCircle',
    oneOf({
      'Open Circle at the Uncommitted Changes': 'changes',
      'Open Circle at the Checked Out Commit': 'head',
    }),
  ],
  ['integratedTerminalShell', 'terminal.shell', str],
  ['keyboardShortcut.find', 'keys.find', legacyShortcut],
  ['keyboardShortcut.refresh', 'keys.refresh', legacyShortcut],
  ['keyboardShortcut.scrollToHead', 'keys.head', legacyShortcut],
  ['keyboardShortcut.scrollToStash', 'keys.stash', legacyShortcut],
  ['maxDepthOfRepoSearch', 'startup.searchDepth', num],
  [
    'openNewTabEditorGroup',
    'startup.editorColumn',
    oneOf({
      Active: 'active',
      Beside: 'beside',
      One: '1',
      Two: '2',
      Three: '3',
      Four: '4',
      Five: '5',
      Six: '6',
      Seven: '7',
      Eight: '8',
      Nine: '9',
    }),
  ],
  ['openToTheRepoOfTheActiveTextEditorDocument', 'startup.repoOfActiveFile', bool],
  [
    'referenceLabels.alignment',
    'labels.layout',
    oneOf({
      Normal: 'together',
      'Branches (on the left) & Tags (on the right)': 'split',
      'Branches (aligned to the graph) & Tags (on the right)': 'split',
    }),
  ],
  ['referenceLabels.combineLocalAndRemoteBranchLabels', 'labels.combine', bool],
  ['referenceLabels.colours', 'labels.colors', obj],
  ['referenceLabels.remoteBranchPrefix', 'labels.remote', oneOf({ Icon: 'icon', Text: 'text' })],
  ['repository.commits.fetchAvatars', 'history.avatars', bool],
  ['repository.commits.initialLoad', 'history.pageSize', num],
  ['repository.commits.loadMore', 'history.pageMore', num],
  ['repository.commits.loadMoreAutomatically', 'history.autoPage', bool],
  ['repository.commits.mute.commitsThatAreNotAncestorsOfHead', 'history.dimNotOnHead', bool],
  ['repository.commits.mute.mergeCommits', 'history.muteMerges', bool],
  ['repository.commits.order', 'history.order', oneOf({ date: 'date', 'author-date': 'author', topo: 'topo' })],
  ['repository.fetchAndPrune', 'fetch.prune', bool],
  ['repository.fetchAndPruneTags', 'fetch.pruneTags', bool],
  // Dialog defaults for the same behaviour. They only apply when the
  // repository-level key above is unset in the layer (first rule wins).
  ['dialog.fetchRemote.prune', 'fetch.prune', bool],
  ['dialog.fetchRemote.pruneTags', 'fetch.pruneTags', bool],
  ['repository.autoFetch', 'fetch.auto', bool],
  ['repository.autoFetchInterval', 'fetch.everySeconds', num],
  ['repository.includeCommitsMentionedByReflogs', 'history.reflog', bool],
  ['repository.onLoad.scrollToHead', 'startup.scrollToHead', bool],
  ['repository.onLoad.showCheckedOutBranch', 'startup.onlyCheckedOut', bool],
  ['repository.onLoad.showSpecificBranches', 'startup.branches', (v) => (Array.isArray(v) && v.every((s) => typeof s === 'string') ? v : undefined)],
  ['repository.onlyFollowFirstParent', 'history.firstParent', bool],
  ['repository.remoteTags.cacheSeconds', 'fetch.tagCacheSeconds', num],
  ['repository.showCommitsOnlyReferencedByTags', 'history.tagOnlyCommits', bool],
  ['repository.showRemoteBranches', 'history.remotes', bool],
  ['repository.showRemoteHeads', 'history.remoteHeads', bool],
  ['repository.showStashes', 'history.stashes', bool],
  ['repository.showTags', 'history.tags', bool],
  ['repository.showWorktrees', 'history.worktrees', bool],
  ['repository.refs.branchSort', 'refs.branchSort', str],
  ['repository.refs.tagSort', 'refs.tagSort', str],
  ['repository.refs.listLimit', 'refs.listLimit', num],
  ['repository.showUncommittedChanges', 'history.uncommitted', bool],
  ['repository.showUntrackedFiles', 'history.untracked', bool],
  ['repository.sign.commits', 'sign.commits', bool],
  ['repository.sign.tags', 'sign.tags', bool],
  ['repository.useMailmap', 'history.mailmap', bool],
  ['repositoryDropdownOrder', 'startup.repoOrder', oneOf({ 'Full Path': 'path', Name: 'name', 'Workspace Full Path': 'workspace' })],
  ['retainContextWhenHidden', 'startup.keepWebview', bool],
  ['showStatusBarItem', 'startup.statusBar', bool],
  ['sourceCodeProviderIntegrationLocation', 'startup.scmButton', oneOf({ Inline: 'bar', 'More Actions': 'menu' })],
];

/** Old `dialog.*` keys and the field of the `actions` object each one fills. */
export const LEGACY_ACTION_RULES: ReadonlyArray<readonly [string, string, Convert]> = [
  ['dialog.addTag.pushToRemote', 'tagPush', bool],
  ['dialog.addTag.type', 'tagAnnotated', (v) => (v === 'Annotated' ? true : v === 'Lightweight' ? false : undefined)],
  ['dialog.applyStash.reinstateIndex', 'stashKeepIndex', bool],
  ['dialog.cherryPick.noCommit', 'cherryNoCommit', bool],
  ['dialog.cherryPick.recordOrigin', 'cherryRecordOrigin', bool],
  ['dialog.createBranch.checkOut', 'branchCheckout', bool],
  ['dialog.deleteBranch.forceDelete', 'branchForceDelete', bool],
  ['dialog.fetchIntoLocalBranch.forceFetch', 'fetchIntoForce', bool],
  ['dialog.general.referenceInputSpaceSubstitution', 'nameSpaces', oneOf({ None: 'keep', Hyphen: 'hyphen', Underscore: 'underscore' })],
  ['dialog.merge.noCommit', 'mergeNoCommit', bool],
  ['dialog.merge.noFastForward', 'mergeNoFastForward', bool],
  ['dialog.merge.squashCommits', 'mergeSquash', bool],
  ['dialog.merge.squashMessageFormat', 'mergeSquashMessage', oneOf({ Default: 'subject', 'Git SQUASH_MSG': 'file' })],
  ['dialog.popStash.reinstateIndex', 'popKeepIndex', bool],
  ['dialog.pullBranch.noFastForward', 'pullNoFastForward', bool],
  ['dialog.pullBranch.rebase', 'pullRebase', bool],
  ['dialog.pullBranch.squashCommits', 'pullSquash', bool],
  ['dialog.pullBranch.squashMessageFormat', 'pullSquashMessage', oneOf({ Default: 'subject', 'Git SQUASH_MSG': 'file' })],
  ['dialog.rebase.ignoreDate', 'rebaseIgnoreDate', bool],
  ['dialog.rebase.launchInteractiveRebase', 'rebaseInteractive', bool],
  ['dialog.resetCurrentBranchToCommit.mode', 'resetMode', oneOf({ Soft: 'soft', Mixed: 'mixed', Hard: 'hard' })],
  ['dialog.resetUncommittedChanges.mode', 'resetUncommitted', oneOf({ Mixed: 'mixed', Hard: 'hard' })],
  ['dialog.stashUncommittedChanges.includeUntracked', 'stashUntracked', bool],
];


/**
 * Writes that copy old values into one settings layer.
 * A new key that already has a value in that layer is never overwritten.
 */
export function planLegacyMigration(read: (key: string) => LayerValues, layer: SettingLayer): SettingWrite[] {
  const writes: SettingWrite[] = [];
  const planned = new Set<string>();
  for (const [from, to, convert] of LEGACY_SETTING_RULES) {
    if (planned.has(to)) continue;
    const old = read(from)[layer];
    if (old === undefined || read(to)[layer] !== undefined) continue;
    const value = convert(old);
    if (value !== undefined) {
      writes.push({ key: to, value, layer });
      planned.add(to);
    }
  }
  const existing = read('actions')[layer];
  const base: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {};
  for (const [from, field, convert] of LEGACY_ACTION_RULES) {
    if (base[field] !== undefined) continue;
    const old = read(from)[layer];
    const value = old === undefined ? undefined : convert(old);
    if (value !== undefined) base[field] = value;
  }
  if (Object.keys(base).length > 0 && (existing === undefined || JSON.stringify(base) !== JSON.stringify(existing)))
    writes.push({ key: 'actions', value: base, layer });
  return writes;
}

export type LegacyMigrationHost = {
  read: (key: string) => LayerValues;
  write: (change: SettingWrite) => Promise<void>;
  /** Whether this layer was already migrated. */
  done: (layer: SettingLayer) => boolean;
  markDone: (layer: SettingLayer) => Promise<void>;
  /** Layers that exist right now. Workspace is missing when no folder is open. */
  layers: readonly SettingLayer[];
};

/**
 * Copies old values once per layer. A layer whose write fails is not marked,
 * so the next activation tries it again.
 */
export async function runLegacyMigration(host: LegacyMigrationHost): Promise<SettingWrite[]> {
  const written: SettingWrite[] = [];
  for (const layer of host.layers) {
    if (host.done(layer)) continue;
    let ok = true;
    for (const change of planLegacyMigration(host.read, layer)) {
      try {
        await host.write(change);
        written.push(change);
      } catch {
        ok = false;
      }
    }
    if (ok) await host.markDone(layer);
  }
  return written;
}
