# Changelog

## v0.1.3

### Features

- Let Push branch pick remotes (multi-select when several exist), optionally set-upstream, and choose normal / force-with-lease / force.

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
