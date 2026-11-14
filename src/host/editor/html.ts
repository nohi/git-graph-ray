export function nonce(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const SHELL = `
<header class="bar">
  <label class="sr-only" for="repo" data-i18n>Repository</label>
  <select id="repo"></select>
  <button type="button" id="btn-repo-help" aria-label="About repository picker" data-i18n-aria-label>?</button>
  <div id="pop-repo-help" popover="manual" class="pop repo-help">
    <p data-i18n>Selects the working copy used for HEAD, uncommitted changes, and Git actions. Other worktrees still appear as chips when Show worktrees is on. Use Branches/Tags to choose which branches, tags, and worktree tips to load.</p>
  </div>
  <span class="bar-gap" aria-hidden="true"></span>
  <span class="hist-group">
    <button type="button" id="btn-undo" class="with-icon tone-git is-disabled" aria-disabled="true" aria-label="Undo" title="Nothing to undo" data-i18n data-i18n-aria-label data-i18n-title><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.2 3.2 3 6.4l3.2 3.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.4 6.4h6.1a3.5 3.5 0 0 1 0 7H8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>Undo</button>
    <button type="button" id="btn-undo-menu" class="hist-more tone-git is-disabled" commandfor="pop-undo" command="toggle-popover" aria-disabled="true" aria-pressed="false" aria-label="Undo history" title="Undo history" data-i18n-aria-label data-i18n-title><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </span>
  <div id="pop-undo" popover class="pop hist-pop"></div>
  <span class="hist-group">
    <button type="button" id="btn-redo" class="with-icon tone-git is-disabled" aria-disabled="true" aria-label="Redo" title="Nothing to redo" data-i18n data-i18n-aria-label data-i18n-title><svg class="icon-flip" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.2 3.2 3 6.4l3.2 3.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.4 6.4h6.1a3.5 3.5 0 0 1 0 7H8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>Redo</button>
    <button type="button" id="btn-redo-menu" class="hist-more tone-git is-disabled" commandfor="pop-redo" command="toggle-popover" aria-disabled="true" aria-pressed="false" aria-label="Redo history" title="Redo history" data-i18n-aria-label data-i18n-title><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </span>
  <div id="pop-redo" popover class="pop hist-pop"></div>
  <span class="bar-gap" aria-hidden="true"></span>
  <button type="button" id="btn-fetch" class="with-icon tone-git" hidden title="Fetch" aria-label="Fetch" data-i18n data-i18n-aria-label data-i18n-title><svg class="icon-fetch" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13.2 6.2A5.2 5.2 0 0 0 3.4 5.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.8 9.8A5.2 5.2 0 0 0 12.6 10.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M3.4 2.6v2.7h2.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 13.4v-2.7h-2.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg><svg class="icon-spin" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="14 20"/></svg>Fetch</button>
  <button type="button" id="btn-reload" class="with-icon" title="Refresh" aria-label="Refresh" data-i18n data-i18n-aria-label data-i18n-title><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13.1 8a5.1 5.1 0 1 1-1.5-3.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M13.2 2.4v3.1H10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Refresh</button>
  <span class="bar-end">
    <button type="button" id="btn-refs" class="with-icon tone-filter" commandfor="pop-refs" command="toggle-popover" aria-pressed="false" data-i18n><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.2 3h11.6L9.4 8.1V12.2L6.6 13.4V8.1L2.2 3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>Branches/Tags</button>
    <div id="pop-refs" popover class="pop">
      <div class="pop-refs-body">
        <search>
          <input type="search" id="ref-q" placeholder="Find a branch, tag, or worktree" data-i18n-placeholder />
        </search>
        <div class="ref-toggles">
          <label data-i18n><input type="checkbox" id="show-all" /> Show all</label>
          <label data-i18n><input type="checkbox" id="show-remotes" /> Remotes</label>
          <label class="ref-toggle-line" data-i18n><input type="checkbox" id="show-same-commit" checked /> Show other branches on the same commit</label>
        </div>
        <div class="ref-tabs" role="tablist">
          <button type="button" role="tab" id="ref-tab-branch" aria-selected="true" data-i18n>Branch</button>
          <button type="button" role="tab" id="ref-tab-tag" aria-selected="false" data-i18n>Tag</button>
          <button type="button" role="tab" id="ref-tab-worktree" aria-selected="false" data-i18n>Worktree</button>
        </div>
        <div id="ref-list"></div>
        <p id="ref-jump-miss" class="ref-jump-miss" hidden></p>
        <div class="dlg-actions">
          <button type="button" id="ref-ok" class="btn-primary" data-i18n>OK</button>
        </div>
      </div>
      <div class="pop-frame" data-edge="n" aria-hidden="true"></div>
      <div class="pop-frame" data-edge="e" aria-hidden="true"></div>
      <div class="pop-frame" data-edge="s" aria-hidden="true"></div>
      <div class="pop-frame" data-edge="w" aria-hidden="true"></div>
      <div class="pop-frame" data-edge="nw" aria-hidden="true"></div>
      <div class="pop-frame" data-edge="ne" aria-hidden="true"></div>
      <div class="pop-frame" data-edge="sw" aria-hidden="true"></div>
      <div class="pop-frame" data-edge="se" aria-hidden="true"></div>
    </div>
    <button type="button" id="btn-dates" class="with-icon tone-filter" commandfor="pop-dates" command="toggle-popover" aria-pressed="false" title="Filter commits by date" data-i18n data-i18n-title><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.2 3h11.6L9.4 8.1V12.2L6.6 13.4V8.1L2.2 3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>Dates</button>
    <div id="pop-dates" popover class="pop">
      <search>
        <input type="search" id="date-q" placeholder="Find a year or month" data-i18n-placeholder />
      </search>
      <div class="ref-toggles">
        <label data-i18n><input type="checkbox" id="date-show-all" checked /> Show all</label>
      </div>
      <div class="ref-tabs" role="tablist">
        <button type="button" role="tab" id="date-tab-author" aria-selected="true" data-i18n>Author date</button>
        <button type="button" role="tab" id="date-tab-committer" aria-selected="false" data-i18n>Committer date</button>
      </div>
      <div id="date-list"></div>
      <div class="dlg-actions">
        <button type="button" id="date-ok" class="btn-primary" data-i18n>OK</button>
      </div>
    </div>
    <button type="button" id="btn-contributor" class="with-icon tone-filter" commandfor="pop-contributor" command="toggle-popover" aria-pressed="false" title="Filter commits by author or committer" data-i18n data-i18n-title><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.2 3h11.6L9.4 8.1V12.2L6.6 13.4V8.1L2.2 3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>Contributor</button>
    <div id="pop-contributor" popover class="pop">
      <search>
        <input type="search" id="person-q" placeholder="Find a name" data-i18n-placeholder />
      </search>
      <div class="ref-toggles">
        <label data-i18n><input type="checkbox" id="person-show-all" checked /> Show all</label>
      </div>
      <div class="ref-tabs" role="tablist">
        <button type="button" role="tab" id="person-tab-author" aria-selected="true" data-i18n>Author</button>
        <button type="button" role="tab" id="person-tab-committer" aria-selected="false" data-i18n>Committer</button>
      </div>
      <div id="person-list"></div>
      <div class="dlg-actions">
        <button type="button" id="person-activity" class="btn-quiet" title="View contributor activity" data-i18n data-i18n-title>Activity</button>
        <button type="button" id="person-ok" class="btn-primary" data-i18n>OK</button>
      </div>
    </div>
    <button type="button" id="btn-head" class="tone-jump" title="Jump to HEAD" data-i18n data-i18n-title>HEAD</button>
    <button type="button" id="btn-date" class="tone-jump" title="Go back to Date" aria-pressed="false" data-i18n data-i18n-title>Go back to Date</button>
    <div id="pop-date" popover="manual" class="pop date-jump">
      <label data-i18n>Date <input type="date" id="date-jump-input" /></label>
      <fieldset class="date-kind">
        <legend class="sr-only" data-i18n>Date field</legend>
        <label data-i18n><input type="radio" name="date-kind" id="date-kind-author" value="author" checked /> Author date</label>
        <label data-i18n><input type="radio" name="date-kind" id="date-kind-committer" value="committer" /> Committer date</label>
      </fieldset>
      <button type="button" id="date-jump-go" data-i18n>Go</button>
      <p id="date-jump-miss" class="date-jump-miss" hidden data-i18n>No commit found for that date.</p>
    </div>
    <button type="button" id="btn-find" class="with-icon" commandfor="pop-find" command="toggle-popover" title="Find" aria-label="Find" aria-pressed="false" data-i18n data-i18n-aria-label data-i18n-title><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.2 10.2 13.2 13.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>Find</button>
    <div id="pop-find" popover class="pop find">
      <div class="find-row">
        <search>
          <input type="search" id="find-q" placeholder="Find commits" data-i18n-placeholder />
        </search>
        <button type="button" id="find-case" class="find-toggle" aria-pressed="false" title="Match Case" data-i18n-title>Aa</button>
        <button type="button" id="find-regex" class="find-toggle" aria-pressed="false" title="Use Regular Expression" data-i18n-title>.*</button>
        <button type="button" id="find-diff" class="find-toggle" aria-pressed="false" title="Search in diffs (git log -G)" data-i18n-title>&#8209;G</button>
        <span id="find-count">0/-</span>
        <button type="button" id="find-prev" class="find-nav" title="Previous (Shift+F3)" data-i18n-title>↑</button>
        <button type="button" id="find-next" class="find-nav" title="Next (F3)" data-i18n-title>↓</button>
      </div>
      <p id="find-err" class="find-err" hidden></p>
    </div>
    <button type="button" id="btn-graph" class="with-icon tone-graph" title="Graph Settings" aria-label="Graph Settings" aria-pressed="false" data-i18n-aria-label data-i18n-title><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.2 4h4.3M9.9 4h4M2.2 8h1.3M6.9 8h7M2.2 12h6.1M11.7 12h2.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8.2" cy="4" r="1.35" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="5.2" cy="8" r="1.35" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="12" r="1.35" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
    <button type="button" id="btn-settings" title="Repository Settings" aria-label="Repository Settings" aria-pressed="false" data-i18n-aria-label data-i18n-title>⚙</button>
    <button type="button" id="btn-help" commandfor="dlg-help" command="show-modal" title="Help" data-i18n-title>?</button>
  </span>
</header>
<div id="fail" class="fail" hidden>
  <p id="fail-msg"></p>
  <button type="button" id="fail-close" aria-label="Dismiss error" data-i18n-aria-label>×</button>
</div>
<div id="conflict" class="notice-bar" hidden>
  <p id="conflict-msg"></p>
  <span id="conflict-files" class="conflict-files"></span>
  <button type="button" id="conflict-continue" data-i18n>Continue</button>
  <button type="button" id="conflict-abort" data-i18n>Abort</button>
</div>
<div id="path-filter" class="notice-bar" hidden>
  <p id="path-filter-msg"></p>
  <button type="button" id="path-filter-clear" data-i18n>Show all commits</button>
</div>
<div id="git-busy-overlay" hidden></div>
<div id="git-busy-hint" hidden role="status" aria-live="polite"><span class="sr-only" data-i18n>Working</span></div>
<div class="board" id="board">
  <div class="cols-clip" id="cols-clip">
    <div class="cols" id="head">
      <div class="h graph" data-i18n>Graph<div class="col-resizer" data-col="graph"></div></div>
      <div class="h desc" data-i18n>Description<div class="col-resizer" data-col="desc"></div></div>
      <div class="h author" data-i18n>Author<div class="col-resizer" data-col="author"></div></div>
      <div class="h adate" data-i18n>Author Date<div class="col-resizer" data-col="adate"></div></div>
      <div class="h commit" data-i18n>Commit<div class="col-resizer" data-col="commit"></div></div>
      <div class="h committer" data-i18n>Committer<div class="col-resizer" data-col="committer"></div></div>
      <div class="h cdate" data-i18n>Committer Date<div class="col-resizer" data-col="cdate"></div></div>
      <div class="h signature" data-i18n>Signature<div class="col-resizer" data-col="signature"></div></div>
    </div>
  </div>
  <div class="scroll" id="scroll">
    <div class="spacer" id="spacer">
      <div class="g-clip" id="g-clip"><svg class="g" id="svg"></svg></div>
      <div id="rows"></div>
      <div id="inline-details" class="details inline" hidden></div>
    </div>
  </div>
</div>
<section id="dock" class="details dock" hidden></section>
<div id="pop-cols" popover class="pop">
  <label data-i18n><input type="checkbox" data-col="Author" /> Author</label>
  <label data-i18n><input type="checkbox" data-col="AuthorDate" /> Author Date</label>
  <label data-i18n><input type="checkbox" data-col="Commit" /> Commit</label>
  <label data-i18n><input type="checkbox" data-col="Committer" /> Committer</label>
  <label data-i18n><input type="checkbox" data-col="CommitterDate" /> Committer Date</label>
  <label data-i18n><input type="checkbox" data-col="Signature" /> Signature</label>
</div>
<div id="pop-ctx" popover class="menu"></div>
<div id="pop-confirm" popover class="pop confirm-tip">
  <p id="confirm-msg"></p>
  <div class="dlg-actions">
    <button type="button" id="confirm-ok">Delete</button>
    <button type="button" id="confirm-cancel" data-i18n>Cancel</button>
  </div>
</div>
<dialog id="dlg-help">
  <form method="dialog">
    <h2 data-i18n>Shortcuts</h2>
    <dl id="help-keys" class="help-keys"></dl>
    <h3 class="help-sub" data-i18n>Also</h3>
    <section class="help-group">
      <h4 class="help-group-h" data-i18n>Fetching and reloading</h4>
      <ul class="help-list">
        <li data-i18n>Fetch runs immediately. Prune, prune tags, and auto fetch are in Graph Settings (and VS Code Settings). Auto fetch is off until you enable it.</li>
        <li data-i18n>A commit or amend in Source Control reloads the graph. Turn that off in Graph Settings, or with git-graph-ray.history.autoRefresh. Refresh still reloads.</li>
      </ul>
    </section>
    <section class="help-group">
      <h4 class="help-group-h" data-i18n>Settings</h4>
      <ul class="help-list">
        <li data-i18n>Graph Settings sets the theme, background, and lane priority. A larger priority keeps that branch further left. Repository Settings edits remotes, issue links, and the pull request provider.</li>
      </ul>
    </section>
    <section class="help-group">
      <h4 class="help-group-h" data-i18n>Branches, tags, and labels</h4>
      <ul class="help-list">
        <li data-i18n>Double-click a branch or tag label to check it out.</li>
        <li data-i18n>Right-click a branch, remote branch, or tag label and choose Set label colour. The pattern starts as that name, and you can widen it (feature/hoge to feature/*). Pick the colour in the square or type a hex value such as #FF8888. The same globs can be edited in git-graph-ray.labels.colors. The first match wins.</li>
        <li data-i18n>Ctrl/Cmd+click local branch labels to select them, then right-click a local branch, remote branch, tag, or commit and choose Rebase selected branches. Right-click a local or remote branch and choose Rebase current branch on this branch. Right-click a local branch, remote branch, or tag and choose Rebase interactive to rebase the current branch onto it in the integrated terminal. The terminal closes when the rebase succeeds.</li>
      </ul>
    </section>
    <section class="help-group">
      <h4 class="help-group-h" data-i18n>Selecting commits and comparing</h4>
      <ul class="help-list">
        <li data-i18n>Shift+click two commits to select the rows between them. Ctrl/Cmd+click adds or removes individual commits, including ones that are not next to each other. Two selected commits show the changes on each side since their common parent. Snapshot in the file list shows the direct diff. Three or more close the details. Right-click a selected commit to cherry-pick them. Merge commits are skipped.</li>
        <li data-i18n>Right-click a commit or branch and choose Compare with… to pick a branch, tag, or commit, or Compare with HEAD. The diff opens on changes since the common parent. Snapshot switches back to the direct diff.</li>
      </ul>
    </section>
    <section class="help-group">
      <h4 class="help-group-h" data-i18n>Files and folders</h4>
      <ul class="help-list">
        <li data-i18n>In commit details, Ctrl/Cmd+click files to select them. On uncommitted changes, stash or patch just those files. On a commit, create a patch from them.</li>
        <li data-i18n>In the file tree, Ctrl/Cmd+click a folder to expand or collapse it and every nested folder. Right-click a folder to expand, collapse, or collapse child folders.</li>
      </ul>
    </section>
    <section class="help-group">
      <h4 class="help-group-h" data-i18n>Filtering the graph</h4>
      <ul class="help-list">
        <li data-i18n>Branches/Tags chooses which branches, tags, and worktree tips to load. The button to the left of a branch, tag, or worktree scrolls the graph to that commit. Show other branches on the same commit keeps branch labels that point at a checked ref's commit even when those branches are not checked. Uncheck it to hide them. Tags and worktrees on that commit stay. Show all loads every ref, so the checkbox waits until a narrower filter is applied.</li>
        <li data-i18n>Dates filters the graph by author date or committer date. Uncheck a year or month to hide those commits. Show all restores the tab you are on. OK applies the filter.</li>
        <li data-i18n>Contributor filters the graph by author or committer name. Uncheck a name to hide those commits. Show all restores the tab you are on. OK applies the filter.</li>
      </ul>
    </section>
    <div class="dlg-actions">
      <button type="button" id="help-settings" data-i18n>Open Settings</button>
      <button value="ok" data-i18n>Close</button>
    </div>
  </form>
</dialog>
<dialog id="dlg-compare">
  <h2 data-i18n>Compare with…</h2>
  <input type="search" id="cmp-q" placeholder="Branch, tag, or commit hash" data-i18n-placeholder autocomplete="off" spellcheck="false" />
  <div id="cmp-list" role="listbox"></div>
  <p id="cmp-empty" hidden data-i18n>No matching branch, tag, or commit.</p>
  <p id="cmp-more" hidden data-i18n>More matches are hidden. Keep typing to narrow the list.</p>
  <div class="dlg-actions">
    <button type="button" id="cmp-cancel" data-i18n>Cancel</button>
  </div>
</dialog>
<dialog id="dlg-git">
  <form id="git-form" method="dialog">
    <h2 id="git-title"></h2>
    <div id="git-body"></div>
    <div class="dlg-actions">
      <button id="git-ok" value="ok" type="submit" class="btn-primary" data-i18n>OK</button>
      <button id="git-cancel" type="button" data-i18n>Cancel</button>
    </div>
  </form>
</dialog>
<dialog id="dlg-undo">
  <h2 id="undo-title">Undo</h2>
  <p id="undo-warning" class="dlg-warn" hidden></p>
  <div id="undo-options" class="undo-options" hidden>
    <label data-i18n><input type="checkbox" id="undo-side" /> Side by side</label>
    <label data-i18n><input type="checkbox" id="undo-unrelated" /> Show unrelated branches</label>
    <label data-i18n><input type="checkbox" id="undo-head" /> Show HEAD</label>
  </div>
  <div id="undo-graphs" class="undo-graphs" hidden></div>
  <ul id="undo-changes" class="undo-changes"></ul>
  <h3 class="undo-cmd-h" data-i18n>Commands</h3>
  <pre id="undo-cmds" class="undo-cmds"></pre>
  <div class="dlg-actions">
    <button type="button" id="undo-ok">Undo</button>
    <button type="button" id="undo-cancel" data-i18n>Cancel</button>
  </div>
</dialog>
<div id="pop-graph" popover="manual" class="pop settings">
  <section class="settings-block">
    <h3 class="settings-h" data-i18n>Appearance</h3>
    <label class="settings-row" data-i18n>Theme
      <select id="s-theme">
        <option value="classic">classic</option>
        <option value="Ray">Ray</option>
        <option value="Ray Wave">Ray Wave</option>
        <option value="Ray Cycle">Ray Cycle</option>
        <option value="Ray Stream">Ray Stream</option>
      </select>
    </label>
    <label class="settings-row" data-i18n>Background color
      <select id="s-bg">
        <option value="auto">auto</option>
        <option value="dark" selected>dark</option>
        <option value="light">light</option>
      </select>
    </label>
    <label class="settings-row" data-i18n><input type="checkbox" id="s-raycat" /> Show Ray Cat</label>
    <label class="settings-row" data-i18n>Ray Cat count
      <input type="number" id="s-raycat-count" min="1" max="10" step="1" />
    </label>
    <p class="settings-warn" data-i18n>Ray themes and Ray Cat use more CPU and battery.</p>
  </section>
  <section class="settings-block">
    <h3 class="settings-h" data-i18n>General</h3>
    <div class="settings-stack">
      <label data-i18n><input type="checkbox" id="s-remotes" /> Show remotes</label>
      <label data-i18n><input type="checkbox" id="s-stashes" /> Show stashes</label>
      <label data-i18n><input type="checkbox" id="s-tags" /> Show tags</label>
      <label data-i18n><input type="checkbox" id="s-worktrees" /> Show worktrees</label>
      <label data-i18n><input type="checkbox" id="s-reflogs" /> Show reflogs</label>
      <label data-i18n><input type="checkbox" id="s-first" /> First parent only</label>
      <label data-i18n><input type="checkbox" id="s-prune" /> Fetch prune</label>
      <label data-i18n><input type="checkbox" id="s-prune-tags" /> Fetch prune tags</label>
      <label data-i18n><input type="checkbox" id="s-auto-fetch" /> Auto fetch</label>
      <label class="settings-row" data-i18n>Auto fetch interval (seconds)
        <input type="number" id="s-auto-fetch-interval" min="15" step="1" />
      </label>
      <label data-i18n><input type="checkbox" id="s-auto-refresh" /> Refresh after Source Control commit</label>
      <label data-i18n><input type="checkbox" id="s-undo-preview" /> Preview Undo and Redo</label>
    </div>
  </section>
  <section class="settings-block">
    <h3 class="settings-h" data-i18n>Graph lane priority</h3>
    <p class="settings-note" data-i18n>Larger numbers stay further left. * matches any text, including /.</p>
    <div id="lane-list"></div>
    <button type="button" id="add-lane" data-i18n>Add pattern</button>
  </section>
</div>
<div id="pop-settings" popover="manual" class="pop settings">
  <section class="settings-block">
    <h3 class="settings-h" data-i18n>Remotes</h3>
    <div id="remote-list"></div>
    <button type="button" id="add-remote" data-i18n>Add remote</button>
  </section>
  <section class="settings-block">
    <h3 class="settings-h" data-i18n>Issue linking</h3>
    <div class="settings-row issue-row">
      <input id="issue-re" placeholder="regex" data-i18n-placeholder />
      <input id="issue-url" placeholder="https://…/$1" />
      <label class="issue-global" data-i18n><input type="checkbox" id="issue-global" /> Use globally</label>
    </div>
    <div class="settings-save"><button type="button" id="issue-save" class="btn-primary" data-i18n>Save</button></div>
  </section>
  <section class="settings-block">
    <h3 class="settings-h" data-i18n>Pull request</h3>
    <select id="pr-provider"></select>
    <div class="settings-save"><button type="button" id="pr-save" class="btn-primary" data-i18n>Save</button></div>
  </section>
</div>
<div id="ray-cats" class="ray-cats" hidden></div>
`;

export function graphHtml(webviewCsp: string, script: string, css: string, n: string, l10nJson?: string, lang = 'en'): string {
  const bundle =
    l10nJson == null || l10nJson === ''
      ? ''
      : `<script type="application/json" id="gg-l10n">${l10nJson.replace(/</g, '\\u003c')}</script>\n`;
  return `<!doctype html>
<html lang="${lang === 'ja' ? 'ja' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webviewCsp} https: data:; style-src ${webviewCsp} 'unsafe-inline'; script-src ${webviewCsp} 'nonce-${n}';" />
  <link rel="stylesheet" href="${css}" />
  <title>Git Graph Ray</title>
</head>
<body data-theme="classic" data-bg="dark" style="margin:0;padding:0;width:100%">
${SHELL}
${bundle}<script nonce="${n}" src="${script}"></script>
</body>
</html>`;
}
