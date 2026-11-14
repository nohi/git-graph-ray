# Upgrading to v0.8

v0.8.0 replaced every `git-graph-ray.*` setting key with a shorter scheme
(`history`, `startup`, `fetch`, `labels`, `details`, `keys`, `actions`, …).
The old keys are no longer registered, so values saved under them are ignored.

Since v0.9.0 the extension copies old values to the new keys automatically,
once for User Settings and once for each Workspace Settings file:

- A new key that already has a value keeps it. Old values never overwrite.
- Old entries are left in `settings.json` so they can be checked and deleted.
- `commitDetailsView.autoCenter` and `enhancedAccessibility` have no new key
  and are not copied.

If you prefer to migrate by hand, the tables below map every old key to its
new key. Values transfer as-is except where the Notes column says otherwise.

## Settings

| Old key | New key | Notes |
| --- | --- | --- |
| `git-graph-ray.commitDetailsView.maxHeight` | `git-graph-ray.details.maxHeight` |  |
| `git-graph-ray.commitDetailsView.fileView.fileTree.compactFolders` | `git-graph-ray.details.foldSingleFolders` |  |
| `git-graph-ray.commitDetailsView.fileView.type` | `git-graph-ray.details.files` | `File Tree` → `tree`, `File List` → `list` |
| `git-graph-ray.commitDetailsView.location` | `git-graph-ray.details.place` | `Inline` → `inline`, `Docked to Bottom` → `bottom` |
| `git-graph-ray.markdown` | `git-graph-ray.details.markdown` |  |
| `git-graph-ray.contextMenuActionsVisibility` | `git-graph-ray.menus` |  |
| `git-graph-ray.customBranchGlobPatterns` | `git-graph-ray.branches.globs` | rows: `glob` is now `pattern` |
| `git-graph-ray.customEmojiShortcodeMappings` | `git-graph-ray.emoji` | rows: `shortcode` is now `code` |
| `git-graph-ray.customPullRequestProviders` | `git-graph-ray.pullRequests` | rows: `templateUrl` is now `url` |
| `git-graph-ray.date.format` | `git-graph-ray.when.format` | `Date & Time` → `datetime`, `Date Only` → `date`, `ISO Date & Time` → `iso`, `ISO Date Only` → `isoDate`, `Relative` → `relative` |
| `git-graph-ray.defaultColumnVisibility` | `git-graph-ray.columns` |  |
| `git-graph-ray.fileEncoding` | `git-graph-ray.files.encoding` |  |
| `git-graph-ray.graph.colours` | `git-graph-ray.graph.palette` |  |
| `git-graph-ray.graph.style` | `git-graph-ray.graph.bend` | `rounded` → `curve`, `angular` → `corner` |
| `git-graph-ray.graph.uncommittedChanges` | `git-graph-ray.history.openCircle` | `Open Circle at the Uncommitted Changes` → `changes`, `Open Circle at the Checked Out Commit` → `head` |
| `git-graph-ray.integratedTerminalShell` | `git-graph-ray.terminal.shell` |  |
| `git-graph-ray.keyboardShortcut.find` | `git-graph-ray.keys.find` | `CTRL/CMD + X` → `mod+x`, `UNASSIGNED` clears |
| `git-graph-ray.keyboardShortcut.refresh` | `git-graph-ray.keys.refresh` | `CTRL/CMD + X` → `mod+x`, `UNASSIGNED` clears |
| `git-graph-ray.keyboardShortcut.scrollToHead` | `git-graph-ray.keys.head` | `CTRL/CMD + X` → `mod+x`, `UNASSIGNED` clears |
| `git-graph-ray.keyboardShortcut.scrollToStash` | `git-graph-ray.keys.stash` | `CTRL/CMD + X` → `mod+x`, `UNASSIGNED` clears |
| `git-graph-ray.maxDepthOfRepoSearch` | `git-graph-ray.startup.searchDepth` |  |
| `git-graph-ray.openNewTabEditorGroup` | `git-graph-ray.startup.editorColumn` | `Active` → `active`, `Beside` → `beside`, `One`–`Nine` → `1`–`9` |
| `git-graph-ray.openToTheRepoOfTheActiveTextEditorDocument` | `git-graph-ray.startup.repoOfActiveFile` |  |
| `git-graph-ray.referenceLabels.alignment` | `git-graph-ray.labels.layout` | `Normal` → `together`, both split options → `split` |
| `git-graph-ray.referenceLabels.combineLocalAndRemoteBranchLabels` | `git-graph-ray.labels.combine` |  |
| `git-graph-ray.referenceLabels.colours` | `git-graph-ray.labels.colors` |  |
| `git-graph-ray.referenceLabels.remoteBranchPrefix` | `git-graph-ray.labels.remote` | `Icon` → `icon`, `Text` → `text` |
| `git-graph-ray.repository.commits.fetchAvatars` | `git-graph-ray.history.avatars` |  |
| `git-graph-ray.repository.commits.initialLoad` | `git-graph-ray.history.pageSize` |  |
| `git-graph-ray.repository.commits.loadMore` | `git-graph-ray.history.pageMore` |  |
| `git-graph-ray.repository.commits.loadMoreAutomatically` | `git-graph-ray.history.autoPage` |  |
| `git-graph-ray.repository.commits.mute.commitsThatAreNotAncestorsOfHead` | `git-graph-ray.history.dimNotOnHead` |  |
| `git-graph-ray.repository.commits.mute.mergeCommits` | `git-graph-ray.history.muteMerges` |  |
| `git-graph-ray.repository.commits.order` | `git-graph-ray.history.order` | `date` → `date`, `author-date` → `author`, `topo` → `topo` |
| `git-graph-ray.repository.fetchAndPrune` | `git-graph-ray.fetch.prune` |  |
| `git-graph-ray.repository.fetchAndPruneTags` | `git-graph-ray.fetch.pruneTags` |  |
| `git-graph-ray.dialog.fetchRemote.prune` | `git-graph-ray.fetch.prune` | Only when `repository.fetchAndPrune` is unset |
| `git-graph-ray.dialog.fetchRemote.pruneTags` | `git-graph-ray.fetch.pruneTags` | Only when `repository.fetchAndPruneTags` is unset |
| `git-graph-ray.repository.autoFetch` | `git-graph-ray.fetch.auto` |  |
| `git-graph-ray.repository.autoFetchInterval` | `git-graph-ray.fetch.everySeconds` |  |
| `git-graph-ray.repository.includeCommitsMentionedByReflogs` | `git-graph-ray.history.reflog` |  |
| `git-graph-ray.repository.onLoad.scrollToHead` | `git-graph-ray.startup.scrollToHead` |  |
| `git-graph-ray.repository.onLoad.showCheckedOutBranch` | `git-graph-ray.startup.onlyCheckedOut` |  |
| `git-graph-ray.repository.onLoad.showSpecificBranches` | `git-graph-ray.startup.branches` |  |
| `git-graph-ray.repository.onlyFollowFirstParent` | `git-graph-ray.history.firstParent` |  |
| `git-graph-ray.repository.remoteTags.cacheSeconds` | `git-graph-ray.fetch.tagCacheSeconds` |  |
| `git-graph-ray.repository.showCommitsOnlyReferencedByTags` | `git-graph-ray.history.tagOnlyCommits` |  |
| `git-graph-ray.repository.showRemoteBranches` | `git-graph-ray.history.remotes` |  |
| `git-graph-ray.repository.showRemoteHeads` | `git-graph-ray.history.remoteHeads` |  |
| `git-graph-ray.repository.showStashes` | `git-graph-ray.history.stashes` |  |
| `git-graph-ray.repository.showTags` | `git-graph-ray.history.tags` |  |
| `git-graph-ray.repository.showWorktrees` | `git-graph-ray.history.worktrees` |  |
| `git-graph-ray.repository.refs.branchSort` | `git-graph-ray.refs.branchSort` |  |
| `git-graph-ray.repository.refs.tagSort` | `git-graph-ray.refs.tagSort` |  |
| `git-graph-ray.repository.refs.listLimit` | `git-graph-ray.refs.listLimit` |  |
| `git-graph-ray.repository.showUncommittedChanges` | `git-graph-ray.history.uncommitted` |  |
| `git-graph-ray.repository.showUntrackedFiles` | `git-graph-ray.history.untracked` |  |
| `git-graph-ray.repository.sign.commits` | `git-graph-ray.sign.commits` |  |
| `git-graph-ray.repository.sign.tags` | `git-graph-ray.sign.tags` |  |
| `git-graph-ray.repository.useMailmap` | `git-graph-ray.history.mailmap` |  |
| `git-graph-ray.repositoryDropdownOrder` | `git-graph-ray.startup.repoOrder` | `Full Path` → `path`, `Name` → `name`, `Workspace Full Path` → `workspace` |
| `git-graph-ray.retainContextWhenHidden` | `git-graph-ray.startup.keepWebview` |  |
| `git-graph-ray.showStatusBarItem` | `git-graph-ray.startup.statusBar` |  |
| `git-graph-ray.sourceCodeProviderIntegrationLocation` | `git-graph-ray.startup.scmButton` | `Inline` → `bar`, `More Actions` → `menu` |

## Dialog defaults

The old `dialog.*` keys fold into fields of the single `git-graph-ray.actions`
object. The whole object migrates only when `actions` has no value yet.

| Old key | New field | Notes |
| --- | --- | --- |
| `git-graph-ray.dialog.addTag.pushToRemote` | `actions.tagPush` |  |
| `git-graph-ray.dialog.addTag.type` | `actions.tagAnnotated` | `Annotated` → `true`, `Lightweight` → `false` |
| `git-graph-ray.dialog.applyStash.reinstateIndex` | `actions.stashKeepIndex` |  |
| `git-graph-ray.dialog.cherryPick.noCommit` | `actions.cherryNoCommit` |  |
| `git-graph-ray.dialog.cherryPick.recordOrigin` | `actions.cherryRecordOrigin` |  |
| `git-graph-ray.dialog.createBranch.checkOut` | `actions.branchCheckout` |  |
| `git-graph-ray.dialog.deleteBranch.forceDelete` | `actions.branchForceDelete` |  |
| `git-graph-ray.dialog.fetchIntoLocalBranch.forceFetch` | `actions.fetchIntoForce` |  |
| `git-graph-ray.dialog.general.referenceInputSpaceSubstitution` | `actions.nameSpaces` | `None` → `keep`, `Hyphen` → `hyphen`, `Underscore` → `underscore` |
| `git-graph-ray.dialog.merge.noCommit` | `actions.mergeNoCommit` |  |
| `git-graph-ray.dialog.merge.noFastForward` | `actions.mergeNoFastForward` |  |
| `git-graph-ray.dialog.merge.squashCommits` | `actions.mergeSquash` |  |
| `git-graph-ray.dialog.merge.squashMessageFormat` | `actions.mergeSquashMessage` | `Default` → `subject`, `Git SQUASH_MSG` → `file` |
| `git-graph-ray.dialog.popStash.reinstateIndex` | `actions.popKeepIndex` |  |
| `git-graph-ray.dialog.pullBranch.noFastForward` | `actions.pullNoFastForward` |  |
| `git-graph-ray.dialog.pullBranch.rebase` | `actions.pullRebase` |  |
| `git-graph-ray.dialog.pullBranch.squashCommits` | `actions.pullSquash` |  |
| `git-graph-ray.dialog.pullBranch.squashMessageFormat` | `actions.pullSquashMessage` | `Default` → `subject`, `Git SQUASH_MSG` → `file` |
| `git-graph-ray.dialog.rebase.ignoreDate` | `actions.rebaseIgnoreDate` |  |
| `git-graph-ray.dialog.rebase.launchInteractiveRebase` | `actions.rebaseInteractive` |  |
| `git-graph-ray.dialog.resetCurrentBranchToCommit.mode` | `actions.resetMode` | `Soft` → `soft`, `Mixed` → `mixed`, `Hard` → `hard` |
| `git-graph-ray.dialog.resetUncommittedChanges.mode` | `actions.resetUncommitted` | `Mixed` → `mixed`, `Hard` → `hard` |
| `git-graph-ray.dialog.stashUncommittedChanges.includeUntracked` | `actions.stashUntracked` |  |
