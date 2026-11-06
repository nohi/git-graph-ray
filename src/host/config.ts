import * as vscode from 'vscode';
import { defaultDialogs } from '../shared/dialogs';
import { atLeastOne } from '../shared/graphRefresh';
import { defaultViewConfig, parseGitVersion } from '../shared/graph';
import { parseLanePriority } from '../shared/layout';
import { isUnregisteredConfigurationMessage, labelColourSettingValue, parseRefColours, refColoursToSetting } from '../shared/refColours';
import { settingWriteScope } from '../shared/settingScope';
import type { ColumnVisibility, RefSort, ViewConfig } from '../shared/types';

const SECTION = 'git-graph-ray';

export function cfg<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration(SECTION).get<T>(key) ?? fallback;
}

export function getGitPathSetting(): string | string[] | undefined {
  return vscode.workspace.getConfiguration('git').get<string | string[]>('path');
}

export function getCustomPrProviders(): Array<{ name: string; templateUrl: string }> {
  const rows = cfg('pullRequests', [] as Array<{ name: string; url: string }>);
  return rows.map((row) => ({ name: row.name, templateUrl: row.url }));
}

export function getGlobPatterns(): Array<{ name: string; glob: string }> {
  const rows = cfg('branches.globs', [] as Array<{ name: string; pattern: string }>);
  return rows.map((row) => ({ name: row.name, glob: row.pattern }));
}

export function getEmojiMaps(): Array<{ shortcode: string; emoji: string }> {
  const rows = cfg('emoji', [] as Array<{ code: string; emoji: string }>);
  return rows.map((row) => ({ shortcode: row.code, emoji: row.emoji }));
}

export function getMenuVisibility(): Record<string, Record<string, boolean>> {
  return cfg('menus', {} as Record<string, Record<string, boolean>>);
}

export async function updateSetting<T>(key: string, value: T): Promise<void> {
  const inspected = vscode.workspace.getConfiguration(SECTION).inspect(key);
  const target =
    settingWriteScope(inspected?.workspaceValue) === 'workspace'
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  await vscode.workspace.getConfiguration(SECTION).update(key, value, target);
}

export function historyPage(key: 'history.pageSize' | 'history.pageMore', fallback: number): number {
  return atLeastOne(cfg<number>(key, fallback), fallback);
}

/** Colours saved while `labels.colors` is missing from the window's configuration registry. */
export const LABEL_COLOUR_STATE_KEY = 'referenceLabelColours';

export async function saveLabelColours(context: vscode.ExtensionContext, colours: Record<string, string>): Promise<void> {
  try {
    await updateSetting('labels.colors', colours);
    await context.globalState.update(LABEL_COLOUR_STATE_KEY, undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isUnregisteredConfigurationMessage(message)) throw error;
    await context.globalState.update(LABEL_COLOUR_STATE_KEY, colours);
  }
}

/** Move colours kept during an unregistered write into User Settings once the key is registered. */
export async function migrateLabelColours(context: vscode.ExtensionContext): Promise<void> {
  const stored = context.globalState.get<unknown>(LABEL_COLOUR_STATE_KEY);
  if (stored === undefined) return;
  const inspected = vscode.workspace.getConfiguration(SECTION).inspect('labels.colors');
  if (inspected?.defaultValue === undefined) return;
  const hasUserValue =
    inspected.globalValue !== undefined || inspected.workspaceValue !== undefined || inspected.workspaceFolderValue !== undefined;
  if (!hasUserValue) {
    try {
      await updateSetting('labels.colors', refColoursToSetting(parseRefColours(stored)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isUnregisteredConfigurationMessage(message)) return;
      throw error;
    }
  }
  await context.globalState.update(LABEL_COLOUR_STATE_KEY, undefined);
}

type ActionSettings = {
  tagAnnotated?: boolean;
  tagPush?: boolean;
  stashKeepIndex?: boolean;
  popKeepIndex?: boolean;
  cherryNoCommit?: boolean;
  cherryRecordOrigin?: boolean;
  branchCheckout?: boolean;
  branchForceDelete?: boolean;
  fetchIntoForce?: boolean;
  nameSpaces?: string;
  mergeNoCommit?: boolean;
  mergeNoFastForward?: boolean;
  mergeSquash?: boolean;
  mergeSquashMessage?: string;
  pullNoFastForward?: boolean;
  pullRebase?: boolean;
  pullSquash?: boolean;
  pullSquashMessage?: string;
  rebaseIgnoreDate?: boolean;
  rebaseInteractive?: boolean;
  resetMode?: string;
  resetUncommitted?: string;
  stashUntracked?: boolean;
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** `graph.bend` stays at the setting boundary. Drawing still uses rounded and angular paths. */
function graphBend(value: unknown): 'rounded' | 'angular' {
  return value === 'corner' ? 'angular' : 'rounded';
}

export function getViewConfig(gitVersion = '', storedLabelColours?: unknown): ViewConfig {
  const c = vscode.workspace.getConfiguration(SECTION);
  const defaults = defaultViewConfig();
  const colours = c.get<string[]>('graph.palette') ?? defaults.graphColours;
  const columns = c.get<ColumnVisibility>('columns') ?? defaults.columnVisibility;
  const d = defaultDialogs();
  const actions = c.get<ActionSettings>('actions') ?? {};
  return {
    graphColours: colours.length ? colours : defaults.graphColours,
    graphStyle: graphBend(c.get('graph.bend')),
    lanePriority: parseLanePriority(c.get('graph.lanePriority')),
    uncommittedChanges: pick(c.get('history.openCircle'), ['changes', 'head'], defaults.uncommittedChanges),
    theme: c.get('graph.theme') ?? 'classic',
    background: pick(c.get('graph.background'), ['auto', 'dark', 'light'], 'dark'),
    dateFormat: pick(c.get('when.format'), ['datetime', 'date', 'iso', 'isoDate', 'relative'], defaults.dateFormat),
    columnVisibility: {
      Author: columns.Author ?? true,
      AuthorDate: columns.AuthorDate ?? true,
      Commit: columns.Commit ?? true,
      Committer: columns.Committer ?? false,
      CommitterDate: columns.CommitterDate ?? false,
      Signature: columns.Signature ?? true,
    },
    muteMergeCommits: c.get('history.muteMerges') ?? true,
    muteNonAncestorsOfHead: c.get('history.dimNotOnHead') ?? false,
    showRemoteBranches: c.get('history.remotes') ?? true,
    showStashes: c.get('history.stashes') ?? true,
    showTags: c.get('history.tags') ?? true,
    showWorktrees: c.get('history.worktrees') ?? true,
    includeCommitsMentionedByReflogs: c.get('history.reflog') ?? false,
    onlyFollowFirstParent: c.get('history.firstParent') ?? false,
    showRemoteHeads: c.get('history.remoteHeads') ?? true,
    showUncommittedChanges: c.get('history.uncommitted') ?? true,
    showUntrackedFiles: c.get('history.untracked') ?? true,
    showCommitsOnlyReferencedByTags: c.get('history.tagOnlyCommits') ?? true,
    combineLocalAndRemote: c.get('labels.combine') ?? true,
    referenceLabelAlignment: pick(c.get('labels.layout'), ['together', 'split'], defaults.referenceLabelAlignment),
    remoteBranchPrefix: c.get('labels.remote') === 'text' ? 'text' : 'icon',
    referenceLabelColours: parseRefColours(labelColourSettingValue(c.inspect('labels.colors'), storedLabelColours)),
    markdown: c.get('details.markdown') ?? true,
    detailsMaxHeight: Math.max(88, c.get('details.maxHeight') ?? defaults.detailsMaxHeight),
    detailsLocation: pick(c.get('details.place'), ['inline', 'bottom'], defaults.detailsLocation),
    fileViewType: pick(c.get('details.files'), ['tree', 'list'], defaults.fileViewType),
    compactFolders: c.get('details.foldSingleFolders') ?? true,
    fetchAvatars: c.get('history.avatars') ?? false,
    loadMoreAutomatically: c.get('history.autoPage') ?? true,
    commitOrder: pick(c.get('history.order'), ['date', 'author', 'topo'], defaults.commitOrder),
    branchSort: c.get<RefSort>('refs.branchSort') ?? defaults.branchSort,
    tagSort: c.get<RefSort>('refs.tagSort') ?? defaults.tagSort,
    refsListLimit: Math.max(1, c.get('refs.listLimit') ?? defaults.refsListLimit),
    dialogs: {
      addTagPushToRemote: actions.tagPush ?? d.addTagPushToRemote,
      addTagType: actions.tagAnnotated === false ? 'Lightweight' : 'Annotated',
      applyStashReinstateIndex: actions.stashKeepIndex ?? d.applyStashReinstateIndex,
      cherryPickNoCommit: actions.cherryNoCommit ?? d.cherryPickNoCommit,
      cherryPickRecordOrigin: actions.cherryRecordOrigin ?? d.cherryPickRecordOrigin,
      createBranchCheckOut: actions.branchCheckout ?? d.createBranchCheckOut,
      deleteBranchForce: actions.branchForceDelete ?? d.deleteBranchForce,
      fetchIntoLocalForce: actions.fetchIntoForce ?? d.fetchIntoLocalForce,
      spaceSubstitution: pick(actions.nameSpaces, ['keep', 'hyphen', 'underscore'], d.spaceSubstitution),
      mergeNoCommit: actions.mergeNoCommit ?? d.mergeNoCommit,
      mergeNoFastForward: actions.mergeNoFastForward ?? d.mergeNoFastForward,
      mergeSquash: actions.mergeSquash ?? d.mergeSquash,
      mergeSquashMessageFormat: pick(actions.mergeSquashMessage, ['subject', 'file'], d.mergeSquashMessageFormat),
      popStashReinstateIndex: actions.popKeepIndex ?? d.popStashReinstateIndex,
      pullNoFastForward: actions.pullNoFastForward ?? d.pullNoFastForward,
      pullRebase: actions.pullRebase ?? d.pullRebase,
      pullSquash: actions.pullSquash ?? d.pullSquash,
      pullSquashMessageFormat: pick(actions.pullSquashMessage, ['subject', 'file'], d.pullSquashMessageFormat),
      rebaseIgnoreDate: actions.rebaseIgnoreDate ?? d.rebaseIgnoreDate,
      rebaseInteractive: actions.rebaseInteractive ?? d.rebaseInteractive,
      resetBranchMode: pick(actions.resetMode, ['soft', 'mixed', 'hard'], d.resetBranchMode),
      resetUncommittedMode: pick(actions.resetUncommitted, ['mixed', 'hard'], d.resetUncommittedMode),
      stashIncludeUntracked: actions.stashUntracked ?? d.stashIncludeUntracked,
    },
    keyboard: {
      find: c.get('keys.find') ?? defaults.keyboard.find,
      refresh: c.get('keys.refresh') ?? defaults.keyboard.refresh,
      scrollToHead: c.get('keys.head') ?? defaults.keyboard.scrollToHead,
      scrollToStash: c.get('keys.stash') ?? defaults.keyboard.scrollToStash,
    },
    gitVersion,
    gitMajorMinor: parseGitVersion(gitVersion),
    rayCatEnabled: c.get<boolean>('rayCat.enabled') ?? false,
    rayCatCount: Math.max(1, Math.min(10, Math.round(c.get<number>('rayCat.count') ?? 1))),
    fetchAndPrune: c.get('fetch.prune') ?? false,
    fetchAndPruneTags: c.get('fetch.pruneTags') ?? false,
    autoFetch: c.get('fetch.auto') ?? false,
    autoFetchInterval: autoFetchIntervalSeconds(c.get('fetch.everySeconds')),
    autoRefresh: c.get('history.autoRefresh') ?? true,
    undoPreview: c.get('undo.preview') ?? true,
  };
}

export function viewColumn(): vscode.ViewColumn {
  const v = cfg('startup.editorColumn', 'active');
  const map: Record<string, vscode.ViewColumn> = {
    active: vscode.ViewColumn.Active,
    beside: vscode.ViewColumn.Beside,
    '1': vscode.ViewColumn.One,
    '2': vscode.ViewColumn.Two,
    '3': vscode.ViewColumn.Three,
    '4': vscode.ViewColumn.Four,
    '5': vscode.ViewColumn.Five,
    '6': vscode.ViewColumn.Six,
    '7': vscode.ViewColumn.Seven,
    '8': vscode.ViewColumn.Eight,
    '9': vscode.ViewColumn.Nine,
  };
  return map[v] ?? vscode.ViewColumn.Active;
}

/** Seconds between automatic fetches. Values below 15 seconds are raised so a zero does not hammer the remote. */
export function autoFetchIntervalSeconds(value: unknown = cfg<number>('fetch.everySeconds', 180)): number {
  const seconds = typeof value === 'number' ? value : 180;
  if (!Number.isFinite(seconds)) return 180;
  return Math.max(15, Math.round(seconds));
}
