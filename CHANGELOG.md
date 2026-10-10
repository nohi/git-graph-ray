# Changelog

## v0.2.0

### Features

- Add Undo and Redo for local Git operations. The header buttons and Ctrl/Cmd+Z or Ctrl/Cmd+Shift+Z apply one step. History stays in the window (up to 50 entries) and is discarded when the repository no longer matches it.
- Preview the before and after graphs, ref changes, and the Git commands that will run. `git-graph-ray.undo.preview` (default on) skips the graphs; a remote warning or a hard reset with uncommitted changes still asks first.
- Switch the preview between a vertical stack and side by side, and hide unrelated branches. Commits and branch labels that exist on only one side are faded and dashed.
- Record commits and amends made in Source Control, and undo them with `git reset --soft` so the changes stay staged.
- Warn when an operation involves a remote. Remote-tracking refs are not moved. Worktree operations and interactive rebase are not recorded.

### Changes

- Rename Filter to Branches/Tags, and add icons to Branches/Tags, Dates, and Find.
- Label Undo, Redo, Fetch, and Refresh, and color header buttons by action: filter, Git, and jump.

### Features

- Add a Signature column on the right of the commit list. It shows whether a commit is signed and the type (GPG, SSH, or X.509) without verifying every commit. The column is visible by default.
- Add a collapsible Signature row under Committer Date in the details panel. It starts collapsed and expands in place.
- Show verification fields when Git can check the signature: status, signer, key, fingerprint, primary key, and trust.
- Read extra fields from the signature itself. SSH shows key type, hash algorithm, namespace, and fingerprint. GPG shows the public-key algorithm, hash algorithm, signature time, key expiration, and signature expiration.

### Changes

- Remove `repository.commits.showSignatureStatus`. The details panel always includes signature information.

### Fixes

- Keep an SSH-signed commit marked signed when Git reports no signature because `gpg.ssh.allowedSignersFile` is not configured.

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
