import * as vscode from 'vscode';
import { defaultDialogs } from '../shared/dialogs';
import { defaultViewConfig, parseGitVersion } from '../shared/graph';
import type { ColumnVisibility, RefSort, ViewConfig } from '../shared/types';

const SECTION = 'git-graph-ray';

export function cfg<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration(SECTION).get<T>(key) ?? fallback;
}

export function getGitPathSetting(): string | string[] | undefined {
  return vscode.workspace.getConfiguration('git').get<string | string[]>('path');
}

export function getCustomPrProviders(): Array<{ name: string; templateUrl: string }> {
  return cfg('customPullRequestProviders', [] as Array<{ name: string; templateUrl: string }>);
}

export function getGlobPatterns(): Array<{ name: string; glob: string }> {
  return cfg('customBranchGlobPatterns', [] as Array<{ name: string; glob: string }>);
}

export function getEmojiMaps(): Array<{ shortcode: string; emoji: string }> {
  return cfg('customEmojiShortcodeMappings', [] as Array<{ shortcode: string; emoji: string }>);
}

export function getMenuVisibility(): Record<string, Record<string, boolean>> {
  return cfg('contextMenuActionsVisibility', {} as Record<string, Record<string, boolean>>);
}

export async function updateSetting<T>(key: string, value: T): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update(key, value, vscode.ConfigurationTarget.Global);
}

export function getViewConfig(gitVersion = ''): ViewConfig {
  const c = vscode.workspace.getConfiguration(SECTION);
  const defaults = defaultViewConfig();
  const colours = c.get<string[]>('graph.colours') ?? defaults.graphColours;
  const columns = c.get<ColumnVisibility>('defaultColumnVisibility') ?? defaults.columnVisibility;
  const d = defaultDialogs();
  return {
    graphColours: colours.length ? colours : defaults.graphColours,
    graphStyle: c.get('graph.style') ?? defaults.graphStyle,
    uncommittedChanges: c.get('graph.uncommittedChanges') ?? defaults.uncommittedChanges,
    theme: c.get('graph.theme') ?? 'classic',
    dateFormat: c.get('date.format') ?? defaults.dateFormat,
    columnVisibility: {
      Author: columns.Author ?? true,
      AuthorDate: columns.AuthorDate ?? true,
      Commit: columns.Commit ?? true,
      Committer: columns.Committer ?? false,
      CommitterDate: columns.CommitterDate ?? false,
    },
    muteMergeCommits: c.get('repository.commits.mute.mergeCommits') ?? true,
    muteNonAncestorsOfHead: c.get('repository.commits.mute.commitsThatAreNotAncestorsOfHead') ?? false,
    showRemoteBranches: c.get('repository.showRemoteBranches') ?? true,
    showStashes: c.get('repository.showStashes') ?? true,
    showTags: c.get('repository.showTags') ?? true,
    showWorktrees: c.get('repository.showWorktrees') ?? true,
    includeCommitsMentionedByReflogs: c.get('repository.includeCommitsMentionedByReflogs') ?? false,
    onlyFollowFirstParent: c.get('repository.onlyFollowFirstParent') ?? false,
    showRemoteHeads: c.get('repository.showRemoteHeads') ?? true,
    showUncommittedChanges: c.get('repository.showUncommittedChanges') ?? true,
    showUntrackedFiles: c.get('repository.showUntrackedFiles') ?? true,
    showCommitsOnlyReferencedByTags: c.get('repository.showCommitsOnlyReferencedByTags') ?? true,
    combineLocalAndRemote: c.get('referenceLabels.combineLocalAndRemoteBranchLabels') ?? true,
    referenceLabelAlignment: c.get('referenceLabels.alignment') ?? defaults.referenceLabelAlignment,
    markdown: c.get('markdown') ?? true,
    enhancedAccessibility: c.get('enhancedAccessibility') ?? false,
    autoCenter: c.get('commitDetailsView.autoCenter') ?? false,
    detailsMaxHeight: Math.max(88, c.get('commitDetailsView.maxHeight') ?? defaults.detailsMaxHeight),
    detailsLocation: c.get('commitDetailsView.location') ?? defaults.detailsLocation,
    fileViewType: c.get('commitDetailsView.fileView.type') ?? defaults.fileViewType,
    compactFolders: c.get('commitDetailsView.fileView.fileTree.compactFolders') ?? true,
    fetchAvatars: c.get('repository.commits.fetchAvatars') ?? false,
    loadMoreAutomatically: c.get('repository.commits.loadMoreAutomatically') ?? true,
    branchSort: c.get<RefSort>('repository.refs.branchSort') ?? defaults.branchSort,
    tagSort: c.get<RefSort>('repository.refs.tagSort') ?? defaults.tagSort,
    refsListLimit: Math.max(1, c.get('repository.refs.listLimit') ?? defaults.refsListLimit),
    dialogs: {
      addTagPushToRemote: c.get('dialog.addTag.pushToRemote') ?? d.addTagPushToRemote,
      addTagType: c.get('dialog.addTag.type') ?? d.addTagType,
      applyStashReinstateIndex: c.get('dialog.applyStash.reinstateIndex') ?? d.applyStashReinstateIndex,
      cherryPickNoCommit: c.get('dialog.cherryPick.noCommit') ?? d.cherryPickNoCommit,
      cherryPickRecordOrigin: c.get('dialog.cherryPick.recordOrigin') ?? d.cherryPickRecordOrigin,
      createBranchCheckOut: c.get('dialog.createBranch.checkOut') ?? d.createBranchCheckOut,
      deleteBranchForce: c.get('dialog.deleteBranch.forceDelete') ?? d.deleteBranchForce,
      fetchIntoLocalForce: c.get('dialog.fetchIntoLocalBranch.forceFetch') ?? d.fetchIntoLocalForce,
      fetchRemotePrune: c.get('dialog.fetchRemote.prune') ?? d.fetchRemotePrune,
      fetchRemotePruneTags: c.get('dialog.fetchRemote.pruneTags') ?? d.fetchRemotePruneTags,
      spaceSubstitution: c.get('dialog.general.referenceInputSpaceSubstitution') ?? d.spaceSubstitution,
      mergeNoCommit: c.get('dialog.merge.noCommit') ?? d.mergeNoCommit,
      mergeNoFastForward: c.get('dialog.merge.noFastForward') ?? d.mergeNoFastForward,
      mergeSquash: c.get('dialog.merge.squashCommits') ?? d.mergeSquash,
      mergeSquashMessageFormat: c.get('dialog.merge.squashMessageFormat') ?? d.mergeSquashMessageFormat,
      popStashReinstateIndex: c.get('dialog.popStash.reinstateIndex') ?? d.popStashReinstateIndex,
      pullNoFastForward: c.get('dialog.pullBranch.noFastForward') ?? d.pullNoFastForward,
      pullSquash: c.get('dialog.pullBranch.squashCommits') ?? d.pullSquash,
      pullSquashMessageFormat: c.get('dialog.pullBranch.squashMessageFormat') ?? d.pullSquashMessageFormat,
      rebaseIgnoreDate: c.get('dialog.rebase.ignoreDate') ?? d.rebaseIgnoreDate,
      rebaseInteractive: c.get('dialog.rebase.launchInteractiveRebase') ?? d.rebaseInteractive,
      resetBranchMode: c.get('dialog.resetCurrentBranchToCommit.mode') ?? d.resetBranchMode,
      resetUncommittedMode: c.get('dialog.resetUncommittedChanges.mode') ?? d.resetUncommittedMode,
      stashIncludeUntracked: c.get('dialog.stashUncommittedChanges.includeUntracked') ?? d.stashIncludeUntracked,
    },
    keyboard: {
      find: c.get('keyboardShortcut.find') ?? defaults.keyboard.find,
      refresh: c.get('keyboardShortcut.refresh') ?? defaults.keyboard.refresh,
      scrollToHead: c.get('keyboardShortcut.scrollToHead') ?? defaults.keyboard.scrollToHead,
      scrollToStash: c.get('keyboardShortcut.scrollToStash') ?? defaults.keyboard.scrollToStash,
    },
    gitVersion,
    gitMajorMinor: parseGitVersion(gitVersion),
    rayCatEnabled: c.get<boolean>('rayCat.enabled') ?? false,
    rayCatCount: Math.max(1, Math.min(10, Math.round(c.get<number>('rayCat.count') ?? 1))),
    fetchAndPrune: c.get('repository.fetchAndPrune') ?? false,
    fetchAndPruneTags: c.get('repository.fetchAndPruneTags') ?? false,
  };
}

export function viewColumn(): vscode.ViewColumn {
  const v = cfg('openNewTabEditorGroup', 'Active');
  const map: Record<string, vscode.ViewColumn> = {
    Active: vscode.ViewColumn.Active,
    Beside: vscode.ViewColumn.Beside,
    One: vscode.ViewColumn.One,
    Two: vscode.ViewColumn.Two,
    Three: vscode.ViewColumn.Three,
    Four: vscode.ViewColumn.Four,
    Five: vscode.ViewColumn.Five,
    Six: vscode.ViewColumn.Six,
    Seven: vscode.ViewColumn.Seven,
    Eight: vscode.ViewColumn.Eight,
    Nine: vscode.ViewColumn.Nine,
  };
  return map[v] ?? vscode.ViewColumn.Active;
}
