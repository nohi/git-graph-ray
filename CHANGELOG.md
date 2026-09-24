# Changelog

## v0.1.4

### Fixes

- Draw rounded lane changes as VS Code-style elbows instead of full-height S-curves, including when commit details stretch the graph.

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
