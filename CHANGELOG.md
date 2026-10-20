# Changelog

## Unreleased

### Features

- Rebase selected local branches onto a remote branch, a tag, or a commit. Ctrl/Cmd+click the branches, then right-click that target.
- Rebase the current branch interactively onto a local branch, remote branch, or tag from that label's context menu. It opens in the integrated terminal, the same way a commit already does.

## v0.6.1

### Fixes

- Size the Rename branch dialog to the same width as Create branch.

## v0.6.0

### Features

- Keep matching branches on the left with `git-graph-ray.graph.lanePriority`. Keys are globs (`release*` matches `release/1.0`) and values are priorities. A larger number stays further left. The highest match wins. Add, edit, and delete patterns from Graph Settings.
- Split the toolbar settings into Graph Settings (appearance, general, lane priority) and Repository Settings (remotes, issue linking, pull request).
- Colour branch and tag labels with `git-graph-ray.referenceLabels.colours`. Keys are globs (`release*` matches `release/1.0`) and values are hex colours. The first match wins. The same colour is used on the graph, in Branches/Tags, and in Compare with….
- Right-click a branch, remote branch, or tag label and choose Set label colour. The dialog starts from that name, so `feature/hoge` can be edited to `feature/*`. The colour is chosen in the picker or typed as hex.

### Changes

- Leave ignore date unchecked in the Rebase dialog. `git-graph-ray.dialog.rebase.ignoreDate` defaults to off.

### Fixes

- Set label colour still saves when VS Code reports that `git-graph-ray.referenceLabels.colours` is not a registered configuration. The colour is kept and copied into User Settings once the setting is registered.
- Highlight the commit a comparison starts from in gold, so it is distinct from the usual selection color. The other commit stays purple.

## v0.5.2

### Fixes

- Branch and tag labels use the same font size as the commit title.

## v0.5.0

### Features

- Pull can rebase. The Pull dialog chooses rebase, no fast-forward, or squash. Rebase turns the other two off.
- Shift+click selects the commits between two rows. Ctrl/Cmd+click adds or removes individual commits, so the selection does not have to be contiguous. Two selected commits show the diff between them. Three or more close the details. Cherry-pick applies the selection oldest first and skips merge commits.
- Stash the files selected in uncommitted changes, with an optional message. Untracked files in the selection are included.
- Open a conflicted file in the VS Code merge editor from its name on the in-progress banner.
- Create a patch from a commit, a commit range, selected files, or the working tree. Apply a patch to the working tree, or as commits when the file is a format-patch mailbox.
- Auto fetch while the graph tab is open. It is off by default. The interval is `git-graph-ray.repository.autoFetchInterval` (default 180 seconds, minimum 15).
- Attach every remote of the same branch to the local label on that commit. One or two remotes show the remote name with a cloud icon. Three or more show cloud icons until clicked, then the names. An arrow collapses them again.
- Remote branch labels can show a wide cloud icon instead of the `remotes/` prefix (`/origin/main`). Set `git-graph-ray.referenceLabels.remoteBranchPrefix` to `Text` to show `remotes/origin/main` again.

### Changes

- Draw only the on-screen part of the graph, and join vertical segments of the same stroke into one path. Scrolling updates commit rows only when the visible window, details gap, or selection changes.
- Branch and tag labels use a larger font in the same chip height, so the letters fill the space above the text.
- Show other branches on the same commit in Branches/Tags. Uncheck it to hide local and remote branch labels that point at a checked ref's commit but were not checked. Tags, worktrees, and detached HEAD stay. It is on by default.

## v0.4.0

### Features

- Rebase several local branches onto one branch. Ctrl/Cmd+click branch labels to select them, then right-click the target branch and choose Rebase selected branches on this branch.
- In the confirmation dialog, choose ignore date, whether to return to the previous branch or stay on the last branch, and whether a failure skips that branch or stops the rest. Interactive rebase stays on the single-branch action.
- On a conflict, abort the rebase before skipping or stopping. The same choice applies to other failures, such as a branch checked out in another worktree. Already up to date counts as success.
- Disable the action while tracked changes are uncommitted or another Git operation is in progress. Untracked files alone do not block it.
- Record the whole batch as one undo.
- Highlight the selected branches on the graph. Their history stays bright, including the lane segments that pass other commits, and the other lines fade.
- Compare a commit, local branch, or remote branch with another revision. Right-click and choose Compare with… to search local branches, remote branches, tags, or a commit hash, or choose Compare with HEAD.
- Show that diff in the same commit details view as Ctrl/Cmd+click. The details panel opens on the row of the commit or branch you right-clicked.
- Choose one or more remotes when adding a tag. Nothing is selected by default. Selected remotes are pushed after the local tag is created. A failed push stops there and leaves the local tag.
- Choose one or more remotes when pushing a tag.
- Show a check beside a remote that already has the tag on the same commit, and a warning when that remote tag points at a different commit. A spinner shows while the lookup is in progress.
- Show the Git error in the Add Tag and Push Tag dialogs when `git ls-remote --tags` fails. Creating or deleting the local tag still works.
- Reuse `git ls-remote --tags` results for `git-graph-ray.repository.remoteTags.cacheSeconds` (default 300 seconds). Set it to 0 to query every time. Pushing or deleting a remote tag from this extension drops that remote's cache.

### Changes

- `git-graph-ray.dialog.addTag.pushToRemote` pre-selects the preferred remote (origin, or the first remote) in the Add Tag dialog.

### Fixes

- Dim the first curve of a branch that was not selected. Only lines that already carry the selected history stay bright.

## v0.3.0

### Features

- Filter the graph by author or committer from the Contributor popover.
- Open a Contributors tab that lists each person's commits and added and deleted lines. Open it from the Activity button in that popover, or with the View Contributors command.
- Limit the Contributors list to the last 7, 30, or 90 days, the last 12 months, or a custom date range. The Author tab uses author date. The Committer tab uses committer date.
- Search subject, author, hash, commit message, ref names, and diffs across the whole history. Jump to a hit that is not loaded yet. A `+` after the count means the search stopped at the cap.
- Open the history of a file from its row or context menu. The graph follows that path until Show all commits.
- Open `git blame` for a file in an editor.
- Show an in-progress merge, rebase, cherry-pick, or revert, including conflicted files, with Continue and Abort.
- Show how many commits the checked-out branch is ahead of and behind its upstream.
- In the commit details file tree, Ctrl/Cmd+click a folder to expand or collapse it together with every nested folder.
- Right-click a folder to Expand, Collapse, or Collapse child folders. Collapse child folders keeps that folder open and closes the folders inside it.
- Copy a folder path, copy its full path, or open the folder in the file manager from the folder context menu.
- Copy a file's full path from the file context menu. The F and R buttons on each file row copy the full path and the relative path.
- Show added lines in green and deleted lines in red on each file. Hide a side that is zero, and hide counts for binary files.

### Changes

- Rebuild the graph lines only when the commits, date filter, details gap, or theme change. Scrolling updates the visible rows and leaves the open commit details in place.
- Keep column widths, the date filter, and the selected commit when the graph for that repository is opened again.
- Set the commit details left pane minimum to 470px and the right pane minimum to 300px. When the two panes together are at least 940px, the divider starts in the middle.
- Double-click the divider to fit the left pane to the metadata rows, excluding the commit message. The pane stays within the window and does not go below its minimum.
- Show the full-hash copy control as an icon and F. The email, name, and name-and-email copy controls are icons only.
- Scroll the page horizontally while commit details are open when the window is narrower than the graph column plus both pane minimums.
- Use the Explorer chevron for expanding and collapsing folders in the commit details file tree.

## v0.2.2

- Update README and screenshots. Old screenshots were moved out of the resources directory.

## v0.2.1

### Changes

- Lower the minimum Visual Studio Code version to 1.120 so the extension can appear in Cursor from the Open VSX Registry.

### Fixes

- Update npm package for fixing vulnerabilities

## v0.2.0

### Features

- Add Undo and Redo for local Git operations. The header buttons and Ctrl/Cmd+Z or Ctrl/Cmd+Shift+Z apply one step. History stays in the window (up to 50 entries) and is discarded when the repository no longer matches it.
- Preview the before and after graphs, ref changes, and the Git commands that will run. `git-graph-ray.undo.preview` (default on) skips the graphs; a remote warning or a hard reset with uncommitted changes still asks first.
- Switch the preview between a vertical stack and side by side, and hide unrelated branches. Commits and branch labels that exist on only one side are faded and dashed.
- Record commits and amends made in Source Control, and undo them with `git reset --soft` so the changes stay staged.
- Warn when an operation involves a remote. Remote-tracking refs are not moved. Worktree operations and interactive rebase are not recorded.
- Undo or redo several steps at once from the history menu beside Undo and Redo.
- Add Show HEAD to the undo preview so the checked-out branch stays visible.
- Add a Signature column on the right of the commit list. It shows whether a commit is signed and the type (GPG, SSH, or X.509) without verifying every commit. The column is visible by default.
- Add a collapsible Signature row under Committer Date in the details panel. It starts collapsed and expands in place.
- Show verification fields when Git can check the signature: status, signer, key, fingerprint, primary key, and trust.
- Read extra fields from the signature itself. SSH shows key type, hash algorithm, namespace, and fingerprint. GPG shows the public-key algorithm, hash algorithm, signature time, key expiration, and signature expiration.
- Warn when deleting a local branch that is not fully merged, and keep OK disabled until force is checked. The check matches `git branch -d`: merged into the upstream when one exists, otherwise into HEAD.
- Open Git action dialogs beside the pointer, and keep them inside the window.
- Log each Git command this extension runs to the Output channel Git Graph Ray, in the same `> git ... [Nms]` form as the VS Code Git extension. Quote values that a terminal would not accept as bare words, so the line can be pasted into a terminal.

### Changes

- Change extension icon.
- Rename Filter to Branches/Tags, and add icons to Branches/Tags, Dates, and Find.
- Label Undo, Redo, Fetch, and Refresh, and color header buttons by action: filter, Git, and jump.
- Remove `repository.commits.showSignatureStatus`. The details panel always includes signature information.
- Draw worktree labels with a folder icon.
- Style OK and Save as primary buttons, and leave Cancel as a normal button.
- Write `git log --format` separators as `%x1e` and `%x1f` instead of raw control characters.

### Fixes

- Keep an SSH-signed commit marked signed when Git reports no signature because `gpg.ssh.allowedSignersFile` is not configured.
- Show branch, tag, and other labels on commits that load when scrolling further down the graph.

## v0.1.5

### Features

- Add a Dates filter that hides loaded commits by author date or committer date. Uncheck a year or month; the graph line stays connected across the hidden commits.
- Add a Create worktree dialog with a parent folder, folder name, destination preview, and a warning when the path is inside the main worktree.

### Fixes

- Show the Committer Date column at its own width when Committer is hidden, instead of collapsing it into the hidden column.
- Make column resize set the column's actual width, and scroll horizontally when the columns do not fit.

## v0.1.4

### Fixes

- Reuse the open Git Graph Ray tab when the editor restarts or the status bar button is pressed, instead of opening another tab each time.
- Draw rounded lane changes as VS Code-style elbows instead of full-height S-curves, including when commit details stretch the graph.
- Peel merge-commit edges off at the merge even when the second parent is the next row.

## v0.1.3

### Features

- Let Push branch pick remotes (multi-select when several exist), optionally set-upstream, and choose normal / force-with-lease / force.
- Show a wait cursor and a spinner next to the pointer while Git actions (checkout, merge, rebase, cherry-pick, reset, refresh, fetch) run, even if the mouse stays still.

### Changes

- Dim only commit text when Mute Merge Commits is on; keep the graph column at full opacity.
- Include `CHANGELOG.md` in the VSIX so Marketplace Resources can show Changelog.

### Fixes

- Show Push branch and Create PR when right-clicking the checked-out branch.
- Adjust modal padding.

## v0.1.2

### Fixes

- Fix `Webview is disposed` error when closing the Git Graph Ray tab.
- Stop Refresh from looping about every second on newer VS Code.
- Do not jump or scroll to the open commit details panel on refresh or checkout.

## v0.1.1

First alpha release.
