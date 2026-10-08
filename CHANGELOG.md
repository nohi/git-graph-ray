# Changelog

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
