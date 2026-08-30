import { firstCommitIndexForDate, formatDate, localDayBounds } from '../shared/date';
import { applyEmoji, fillPrUrl, formatCommitMessageHtml } from '../shared/issueLinks';
import { ancestorHashes, colourForLane, DETAILS_MAX, DETAILS_MIN, edgePath, estimateDetailsHeight, gitAtLeast, graphWidth, laneX, rayStreamGradient, RAY_STREAM_PERIOD, ROW, rowY, scrollNeededToRevealDetails, shortcutMatches } from '../shared/graph';
import { layoutCommits } from '../shared/layout';
import { buildFileTree } from '../shared/fileTree';
import { decideNamedRemoteCheckout, startCheckoutFromRef } from '../shared/checkout';
import { applySpaceSubstitution, defaultRepoSettings, type RepoSettings } from '../shared/dialogs';
import { detailsMetaRows, commitMessageText, type DetailsMetaRow } from '../shared/detailsMeta';
import { filterRefsForTab, sortFilterRefs, windowRefs, refDisplayName, refLogArg, groupChipRefs, remoteShortName, type FilterTab } from '../shared/refsList';
import { compileFindRegex, formatFindCount, highlightFind, matchCommit } from '../shared/commitFind';
import { branchMenuEntries, commitMenuEntries, menuHtml } from '../shared/commitMenu';
import { UNCOMMITTED, type ColumnVisibility, type CommitDetails, type GraphCommit, type GraphRef } from '../shared/types';
import type { GitAction, GraphSnapshot, HostToView, ViewToHost } from '../shared/protocol';
import { anchoredPopoverPlacement, type AnchoredPopoverAlign } from '../shared/popover';
import { syncRayCats } from './rayCat';
import './styles.css';

type AnchoredPopoverOpts = { align?: AnchoredPopoverAlign; maxWidth?: number };

const vscode = acquireVsCodeApi();
const post = (m: ViewToHost) => vscode.postMessage(m);

let snap: GraphSnapshot | null = null;
let selected: string | null = null;
let compare: string | undefined;
let details: CommitDetails | null = null;
let detailsH: number | null = null;
let autoDetailsH = 180;
let fitGen = 0;
let userG: number | null = null;
let dialogOk: (() => void) | null = null;
let confirmOk: (() => void) | null = null;
let faces = new Map<string, string>();
let findHits: number[] = [];
let findI = 0;
let findDiffHashes: string[] | null = null;
let findDiffTimer: ReturnType<typeof setTimeout> | null = null;
let findPendingDir = 0;
let filterDraft: { showAll: boolean; showRemotes: boolean; tab: FilterTab; picked: Set<string>; shown: number } | null = null;
let stashI = 0;
let ctxRef: GraphRef | null = null;
let ctxCommit: GraphCommit | null = null;
let ctxFile: { path: string; oldPath?: string } | null = null;
let pendingDateJump: { day: string; field: 'author' | 'committer' } | null = null;

type El = HTMLElement & HTMLInputElement & HTMLSelectElement & { showPopover?: () => void; hidePopover?: () => void };
const $ = (id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as El;
};

function sendReady(): void {
  post({ type: 'ready' });
}

window.addEventListener('message', (ev: MessageEvent<HostToView>) => {
  const m = ev.data;
  if (m.type === 'snapshot') {
    setGitBusy(false);
    snap = m.payload;
    applySnap();
  } else if (m.type === 'patch' && snap) {
    if (m.payload.loading) setGitBusy(true);
    snap = { ...snap, ...m.payload, config: m.payload.config ?? snap.config };
    applySnap();
  } else if (m.type === 'more' && snap) {
    snap.commits = [...snap.commits, ...m.commits];
    snap.hasMore = m.hasMore;
    paint();
    continueDateJump();
  } else if (m.type === 'info') {
    details = m.payload;
    if (!details) {
      compare = undefined;
      paint();
      return;
    }
    if (detailsH == null) autoDetailsH = estimateFromDetails(details);
    paint();
    scheduleFitDetails();
  } else if (m.type === 'fail') {
    setGitBusy(false);
    $('fail-msg').textContent = m.message;
    $('fail').hidden = !m.message;
  } else if (m.type === 'busy') {
    setGitBusy(m.on, m.fetch);
  } else if (m.type === 'notice') {
    /* action kinds used to show here; Fetch already has its own button */
  } else if (m.type === 'face') {
    faces.set(m.email, m.dataUri);
    paint();
  } else if (m.type === 'facesReset') {
    faces.clear();
    paint();
  } else if (m.type === 'findDiffs') {
    findDiffHashes = m.hashes;
    const err = $('find-err');
    err.hidden = !m.error;
    err.textContent = m.error ?? '';
    runFind(findPendingDir);
    findPendingDir = 0;
  } else if (m.type === 'jump') {
    selected = m.selected;
    compare = m.compare;
    scrollToHash(m.selected);
  } else if (m.type === 'picked') {
    const input = document.querySelector<HTMLInputElement>(`[data-pick="${m.requestId}"]`);
    if (input) input.value = m.path ?? '';
  }
});

function applySnap(): void {
  if (!snap) return;
  vscode.setState({ repo: snap.repoPath });
  document.body.dataset.theme = snap.config.theme;
  document.body.classList.toggle('hide-Author', !snap.config.columnVisibility.Author);
  document.body.classList.toggle('hide-AuthorDate', !snap.config.columnVisibility.AuthorDate);
  document.body.classList.toggle('hide-Commit', !snap.config.columnVisibility.Commit);
  document.body.classList.toggle('hide-Committer', !snap.config.columnVisibility.Committer);
  document.body.classList.toggle('hide-CommitterDate', !snap.config.columnVisibility.CommitterDate);
  $('s-theme').value = snap.config.theme;
  $('s-raycat').checked = snap.config.rayCatEnabled;
  $('s-raycat-count').value = String(snap.config.rayCatCount);
  $('s-raycat-count').disabled = !snap.config.rayCatEnabled;
  syncRayCats($('ray-cats') as unknown as HTMLCanvasElement, snap.config.rayCatEnabled, snap.config.rayCatCount);
  fillRepos();
  if (!$('pop-refs').matches(':popover-open')) filterDraft = null;
  fillRefs();
  $('btn-fetch').hidden = snap.remotes.length === 0;
  $('s-remotes').checked = snap.repoSettings.showRemotes ?? snap.config.showRemoteBranches;
  $('s-stashes').checked = snap.repoSettings.showStashes ?? snap.config.showStashes;
  $('s-tags').checked = snap.repoSettings.showTags ?? snap.config.showTags;
  $('s-worktrees').checked = snap.repoSettings.showWorktrees ?? snap.config.showWorktrees;
  $('s-reflogs').checked = snap.repoSettings.showReflogs ?? snap.config.includeCommitsMentionedByReflogs;
  $('s-first').checked = snap.repoSettings.firstParent ?? snap.config.onlyFollowFirstParent;
  $('s-prune').checked = snap.config.fetchAndPrune;
  $('s-prune-tags').checked = snap.config.fetchAndPruneTags;
  fillRemotes();
  fillPr();
  if (snap.repoSettings.issueLinking) {
    $('issue-re').value = snap.repoSettings.issueLinking.regex;
    $('issue-url').value = snap.repoSettings.issueLinking.url;
    $('issue-global').checked = Boolean(snap.repoSettings.issueLinking.global);
  }
  for (const cb of document.querySelectorAll<HTMLInputElement>('#pop-cols input')) {
    cb.checked = snap.config.columnVisibility[cb.dataset.col as keyof ColumnVisibility];
  }
  if (snap.config.fetchAvatars) post({ type: 'faces', emails: [...new Set(snap.commits.map((c) => c.authorEmail).filter(Boolean))] });
  runFind(0);
  fillHelp();
}

function fillRepos(): void {
  if (!snap) return;
  const sel = $('repo');
  sel.innerHTML = snap.repos.map((r) => `<option value="${esc(r.path)}" ${r.path === snap!.repoPath ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  sel.hidden = snap.repos.length < 2;
  $('btn-repo-help').hidden = sel.hidden;
  if (sel.hidden) $('pop-repo-help').hidePopover?.();
}

function filterCatalog(): GraphRef[] {
  if (!snap) return [];
  const globs = snap.globPatterns.map((g) => ({ kind: 'head' as const, name: `glob:${g.name}`, hash: g.glob }));
  return [...(snap.filterRefs ?? []), ...globs];
}

function startFilterDraft(): void {
  if (!snap) return;
  filterDraft = {
    showAll: snap.selectedBranches === 'all',
    showRemotes: snap.config.showRemoteBranches,
    tab: 'branch',
    picked: new Set(snap.selectedBranches === 'all' ? [] : snap.selectedBranches),
    shown: snap.config.refsListLimit,
  };
}

function applyFilter(): void {
  if (!filterDraft) return;
  const branches = filterDraft.showAll ? 'all' : [...filterDraft.picked];
  post({ type: 'setFilter', branches, showRemotes: filterDraft.showRemotes });
}

function fillRefs(): void {
  if (!snap) return;
  if ($('pop-refs').matches(':popover-open') && !filterDraft) startFilterDraft();
  const draft = filterDraft ?? {
    showAll: snap.selectedBranches === 'all',
    showRemotes: snap.config.showRemoteBranches,
    tab: 'branch' as FilterTab,
    picked: new Set(snap.selectedBranches === 'all' ? [] : snap.selectedBranches),
    shown: snap.config.refsListLimit,
  };
  $('show-all').checked = draft.showAll;
  $('show-remotes').checked = draft.showRemotes;
  for (const tab of ['branch', 'tag', 'worktree'] as const) {
    $(`ref-tab-${tab}`).setAttribute('aria-selected', tab === draft.tab ? 'true' : 'false');
  }
  const sorted = sortFilterRefs(
    filterRefsForTab(filterCatalog(), draft.tab, { remotes: draft.showRemotes, query: $('ref-q').value }),
    draft.tab,
    snap.config.branchSort,
    snap.config.tagSort,
  );
  const list = $('ref-list');
  const top = list.scrollTop;
  const visible = windowRefs(sorted, draft.shown);
  list.innerHTML = visible
    .map((r) => {
      const rev = refLogArg(r);
      const detached = r.kind === 'head' && r.name === 'HEAD';
      const kindTitle = r.kind === 'head' ? 'Branch' : r.kind === 'remote' ? 'Remote' : r.kind === 'tag' ? 'Tag' : r.kind === 'worktree' ? 'Worktree' : r.kind;
      return `<label class="ref-item kind-${r.kind}${detached ? ' detached' : ''}"><input type="checkbox" data-ref="${esc(rev)}" ${draft.picked.has(rev) ? 'checked' : ''}/><span class="ref-mark" title="${esc(kindTitle)}"></span><span class="ref-name">${esc(refDisplayName(r))}</span></label>`;
    })
    .join('');
  list.scrollTop = top;
}

function fillRemotes(): void {
  if (!snap) return;
  $('remote-list').innerHTML = snap.remotes
    .map(
      (r) =>
        `<div class="remote-row"><span class="remote-name">${esc(r.name)}</span><button type="button" class="remote-act" data-ed="${esc(r.name)}">Edit</button><button type="button" class="remote-del" data-del="${esc(r.name)}">Delete</button></div>`,
    )
    .join('');
}

function fillPr(): void {
  if (!snap) return;
  const names = ['GitHub', 'GitLab', 'Bitbucket', ...snap.customPrProviders.map((p) => p.name)];
  $('pr-provider').innerHTML = names.map((n) => `<option>${esc(n)}</option>`).join('');
}

function detailsAnchor(): string | null {
  return compare ?? selected;
}

function paintGraphSvg(svg: HTMLElement, markup: string, stream: boolean, height: number): void {
  if (!stream) {
    svg.innerHTML = markup;
    return;
  }
  const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const grad = svg.querySelector('#ray-stream');
  if (!grad) svg.insertAdjacentHTML('afterbegin', rayStreamGradient(height, animate));
  else {
    const h = Math.max(Math.round(height), 1);
    grad.setAttribute('y1', String(h));
    grad.setAttribute('y2', String(h - RAY_STREAM_PERIOD));
  }
  for (const n of [...svg.querySelectorAll(':scope > path, :scope > circle')]) n.remove();
  svg.insertAdjacentHTML('beforeend', markup);
}

function detailsHeightCap(): number {
  return snap?.config.detailsMaxHeight ?? DETAILS_MAX;
}

function estimateFromDetails(d: CommitDetails): number {
  const dates = snap
    ? { author: formatDate(d.authorDate, snap.config.dateFormat), committer: formatDate(d.committerDate, snap.config.dateFormat) }
    : { author: '', committer: '' };
  return estimateDetailsHeight({
    message: commitMessageText(d),
    fileCount: d.files.length,
    metaRowCount: detailsMetaRows(d, dates).length,
    maxHeight: detailsHeightCap(),
  });
}

function currentDetailsHeight(): number {
  if (detailsH != null) return Math.max(DETAILS_MIN, detailsH);
  return autoDetailsH;
}

function measureNaturalDetailsHeight(): number {
  const body = document.querySelector('.details-body');
  if (!(body instanceof HTMLElement)) return DETAILS_MIN;
  const meta = body.querySelector('.meta');
  const files = body.querySelector('.files');
  const toolbar = body.querySelector('.files-toolbar');
  const metaH = meta instanceof HTMLElement ? meta.scrollHeight : 0;
  const filesH =
    (toolbar instanceof HTMLElement ? toolbar.offsetHeight : 0) + (files instanceof HTMLElement ? files.scrollHeight : 0);
  return Math.max(metaH, filesH) + 6;
}

function scheduleFitDetails(): void {
  const gen = ++fitGen;
  requestAnimationFrame(() => {
    if (gen !== fitGen || !details) return;
    if (detailsH == null) {
      const next = Math.min(detailsHeightCap(), Math.max(DETAILS_MIN, measureNaturalDetailsHeight()));
      if (Math.abs(next - autoDetailsH) > 2) {
        autoDetailsH = next;
        paint();
      }
    }
    ensureDetailsVisible();
  });
}

function ensureDetailsVisible(): void {
  if (!snap || !details || snap.config.detailsLocation === 'Docked to Bottom') return;
  const anchor = detailsAnchor();
  if (!anchor) return;
  const idx = snap.commits.findIndex((c) => c.hash === anchor);
  if (idx < 0) return;
  const scroll = $('scroll');
  const inline = document.getElementById('inline-details');
  const h =
    inline instanceof HTMLElement && !inline.hidden ? inline.getBoundingClientRect().height : currentDetailsHeight();
  const next = scrollNeededToRevealDetails({
    rowIndex: idx,
    rowHeight: ROW,
    detailsHeight: h,
    scrollTop: scroll.scrollTop,
    viewHeight: scroll.clientHeight,
  });
  if (next != null) scroll.scrollTop = next;
}

function paint(): void {
  if (!snap) return;
  const layout = layoutCommits(snap.commits);
  const anchor = detailsAnchor();
  const gap =
    details && snap.config.detailsLocation === 'Inline' && anchor
      ? { after: snap.commits.findIndex((c) => c.hash === anchor), height: currentDetailsHeight() }
      : null;
  const height = snap.commits.length * ROW + (gap ? gap.height : 0);
  $('spacer').style.height = `${height}px`;
  const svg = $('svg');
  svg.setAttribute('width', String(graphWidth(layout.maxLanes)));
  svg.setAttribute('height', String(height));
  if (userG != null) document.documentElement.style.setProperty('--g', `${userG}px`);
  else document.documentElement.style.removeProperty('--g');
  const ancestors = snap.config.muteNonAncestorsOfHead ? ancestorHashes(snap.commits, snap.head) : null;
  const pathD: string[] = [];
  for (const e of layout.edges) {
    const colour = colourForLane(e.lane, snap.config.graphColours, snap.config.theme);
    const x1 = laneX(e.fromLane);
    const y1 = rowY(e.fromRow, gap);
    const x2 = laneX(e.toLane);
    const y2 = rowY(Math.min(e.toRow, snap.commits.length - 1), gap);
    const d = edgePath(x1, y1, x2, y2, snap.config.graphStyle);
    pathD.push(`<path d="${d}" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" ${e.committed ? '' : 'stroke-dasharray="4 3"'} />`);
  }
  for (const v of layout.vertices) {
    const c = snap.commits[v.row];
    const colour = colourForLane(v.lane, snap.config.graphColours, snap.config.theme);
    const open =
      (c?.hash === UNCOMMITTED && snap.config.uncommittedChanges.startsWith('Open Circle at the Uncommitted')) ||
      (c?.hash === snap.head && (snap.config.uncommittedChanges.includes('Checked Out') || !snap.currentBranch));
    const isHead = c?.hash === snap.head && c.hash !== UNCOMMITTED;
    pathD.push(
      `<circle cx="${laneX(v.lane)}" cy="${rowY(v.row, gap)}" r="${isHead ? 5.5 : 4}" fill="${open ? 'none' : colour}" stroke="${colour}" />`,
    );
    if (isHead) {
      pathD.push(
        `<circle cx="${laneX(v.lane)}" cy="${rowY(v.row, gap)}" r="8" fill="none" stroke="${colour}" stroke-opacity="0.35" />`,
      );
    }
  }
  paintGraphSvg(svg, pathD.join(''), snap.config.theme === 'Ray Stream', height);
  const scroll = $('scroll');
  const viewTop = scroll.scrollTop - 8 * ROW;
  const viewBot = scroll.scrollTop + scroll.clientHeight + 16 * ROW;
  let start = 0;
  while (start < snap.commits.length && start * ROW + (gap && start > gap.after ? gap.height : 0) + ROW < viewTop) start++;
  let end = start;
  while (end < snap.commits.length && end * ROW + (gap && end > gap.after ? gap.height : 0) < viewBot) end++;
  const rows = $('rows');
  rows.innerHTML = '';
  for (let i = start; i < end; i++) {
    const c = snap.commits[i]!;
    const v = layout.vertices[i];
    const mut =
      (snap.config.muteMergeCommits && c.parents.length > 1) || (ancestors && c.hash !== UNCOMMITTED && !ancestors.has(c.hash));
    const el = document.createElement('div');
    el.className = `row${mut ? ' muted' : ''}${c.hash === selected ? ' sel' : ''}${c.hash === compare ? ' cmp' : ''}${c.hash === snap.head ? ' head-commit' : ''}`;
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.right = '0';
    el.style.top = `${i * ROW + (gap && i > gap.after ? gap.height : 0)}px`;
    el.dataset.hash = c.hash;
    const avatar = faces.get(c.authorEmail);
    const desc = `${chips(c)}<span class="subj">${subjectHtml(c.subject)}</span>`;
    el.innerHTML = `<div class="cell graph"></div>
      <div class="cell desc">${desc}</div>
      <div class="cell author">${avatar ? `<img src="${avatar}" width="14" height="14" alt="" /> ` : ''}${findMark(c.authorName)}</div>
      <div class="cell adate">${esc(formatDate(c.authorDate, snap.config.dateFormat))}</div>
      <div class="cell commit">${findMark(c.hash.slice(0, 7))}</div>
      <div class="cell committer">${findMark(c.committerName)}</div>
      <div class="cell cdate">${esc(formatDate(c.committerDate, snap.config.dateFormat))}</div>`;
    void v;
    rows.append(el);
  }
  const more = snap.hasMore ? `<div class="row" id="more" style="position:absolute;top:${height}px">Load more</div>` : '';
  if (more) rows.insertAdjacentHTML('beforeend', more);
  renderDetails();
  syncGraphClip();
}

function emojiMaps() {
  return snap?.emoji ?? [];
}

function chips(c: GraphCommit): string {
  if (!snap) return '';
  const align = snap.config.referenceLabelAlignment;
  const groups = groupChipRefs(c.refs, snap.config.combineLocalAndRemote);
  const mk = (r: GraphRef, short = false) => {
    const detached = r.kind === 'head' && r.name === 'HEAD';
    const current = r.kind === 'head' && Boolean(snap!.currentBranch) && r.name === snap!.currentBranch;
    const ico = r.kind === 'head' || r.kind === 'tag' ? '<span class="chip-ico" aria-hidden="true"></span>' : '';
    const label = short && r.kind === 'remote' ? remoteShortName(r) : refDisplayName(r);
    return `<span class="chip ${r.kind}${detached ? ' detached' : ''}${current ? ' current' : ''}" data-kind="${r.kind}" data-name="${esc(r.name)}" data-hash="${esc(r.hash)}" data-remote="${esc(r.remote ?? '')}" data-wt="${esc(r.worktreePath ?? '')}">${ico}${findMark(label)}</span>`;
  };
  const html = (g: ReturnType<typeof groupChipRefs>[number]) =>
    g.kind === 'pair' ? `<span class="chip-pair">${mk(g.local)}${mk(g.remote, true)}</span>` : mk(g.ref);
  const left = groups.filter((g) => {
    const k = g.kind === 'pair' ? g.local.kind : g.ref.kind;
    return k === 'head' || k === 'remote' || k === 'stash' || k === 'worktree';
  });
  if (align.includes('Tags (on the right)')) return `<span class="refs">${left.map(html).join('')}</span>`;
  return `<span class="refs">${groups.map(html).join('')}</span>`;
}

function renderDetails(): void {
  const dock = $('dock');
  const inline = $('inline-details');
  if (!snap) return;
  if (snap.config.detailsLocation === 'Docked to Bottom') {
    inline.hidden = true;
    inline.innerHTML = '';
    dock.hidden = !details;
    if (!details) {
      dock.innerHTML = '';
      return;
    }
    dock.style.height = `${currentDetailsHeight()}px`;
    dock.innerHTML = `<div class="sash-y" id="sash-y" data-dir="up"></div><div class="details-body">${detailsHtml(details)}</div>`;
    return;
  }
  dock.hidden = true;
  dock.innerHTML = '';
  const anchor = detailsAnchor();
  if (!details || !anchor) {
    inline.hidden = true;
    inline.innerHTML = '';
    return;
  }
  const idx = snap.commits.findIndex((c) => c.hash === anchor);
  if (idx < 0) {
    inline.hidden = true;
    inline.innerHTML = '';
    return;
  }
  inline.hidden = false;
  inline.style.top = `${(idx + 1) * ROW}px`;
  inline.style.height = `${currentDetailsHeight()}px`;
  inline.innerHTML = `<div class="details-body">${detailsHtml(details)}</div><div class="sash-y" id="sash-y"></div>`;
}

function detailsHtml(d: CommitDetails): string {
  if (!snap) return '';
  const issue = snap.repoSettings.issueLinking;
  const body = formatCommitMessageHtml(applyEmoji(commitMessageText(d), emojiMaps()), snap.config.markdown, issue);
  const tree = snap.config.fileViewType !== 'File List';
  const files = tree
    ? treeHtml(buildFileTree(d.files, snap.config.compactFolders))
    : fileListHtml(d.files);
  const rows = detailsMetaRows(d, {
    author: formatDate(d.authorDate, snap.config.dateFormat),
    committer: formatDate(d.committerDate, snap.config.dateFormat),
  });
  const table = rows.length ? `<div class="meta-table">${rows.map(metaRowHtml).join('')}</div>` : '';
  return `<div class="meta">${table}<div class="meta-msg">${body}</div>
  </div><div class="sash" id="sash-x"></div><div class="files-pane">
    <div class="files-toolbar">
      <button type="button" class="fv-btn" data-fv="File Tree" aria-pressed="${tree}">Tree</button>
      <button type="button" class="fv-btn" data-fv="File List" aria-pressed="${!tree}">List</button>
    </div>
    <div class="files">${files}</div>
  </div>`;
}

const COPY_SVG =
  '<svg class="copy-ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2h7a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm3 11h6V5H7v8zM4 12h1V4h6V3H4v9z"/></svg>';

function copyBtns(copies: DetailsMetaRow['copies']): string {
  return copies
    .map(
      (c) =>
        `<button type="button" class="copy-btn" data-copy="${esc(c.text)}" title="${esc(c.title)}">${COPY_SVG}${c.label ? `<span>${esc(c.label)}</span>` : ''}</button>`,
    )
    .join('');
}

function metaRowHtml(row: DetailsMetaRow): string {
  const hash = Boolean(row.hashLink) || row.label === 'Commit';
  const value = row.hashLink
    ? `<a href="#" data-parent="${esc(row.hashLink)}">${esc(row.value)}</a>`
    : esc(row.value);
  return `<div class="meta-row"><div class="meta-label">${esc(row.label)}</div><div class="meta-main"><div class="meta-value${hash ? ' mono' : ''}">${value}</div><div class="copy-btns">${copyBtns(row.copies)}</div></div></div>`;
}

function statusTitle(st: string): string {
  return ({ A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed', C: 'Copied', U: 'Untracked', T: 'Type change' } as Record<string, string>)[st] ?? st;
}

function joinRepoPath(rel: string): string {
  const root = snap?.repoPath ?? '';
  if (!root) return rel;
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${sep}${rel.replaceAll('\\', '/').replaceAll('/', sep)}`;
}

const ICON_DIFF =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 1.5h5A1.5 1.5 0 0 1 8.5 3v10A1.5 1.5 0 0 1 7 14.5H2A1.5 1.5 0 0 1 .5 13V3A1.5 1.5 0 0 1 2 1.5zm0 1A.5.5 0 0 0 1.5 3v10a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5zm7 0h5A1.5 1.5 0 0 1 15.5 3v10a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 13V3A1.5 1.5 0 0 1 9 1.5zm0 1A.5.5 0 0 0 8.5 3v10a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5z"/></svg>';
const ICON_OPEN =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.5 2.5H14v8h-1.5V4H6.5zm-4 3H10v8H2.5zM4 7v5h4.5V7z"/></svg>';
const ICON_BLOB =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2.5h7l3 3V13.5H3zm1 1v9h8V6H9V3.5zm2 3h5v1H6zm0 2.5h5v1H6z"/></svg>';
const ICON_COPY_REL =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2h7a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm3 11h6V5H7v8zM4 12h1V4h6V3H4v9z"/></svg>';
const ICON_COPY_FULL =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2h7a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm3 11h6V5H7v8zM4 12h1V4h6V3H4v9z"/><path fill="currentColor" d="M2 7h3v1H3v3H2z"/></svg>';

function fileActionsHtml(): string {
  return `<span class="file-actions">
    <button type="button" class="file-act" data-fa="diff" title="Diff">${ICON_DIFF}</button>
    <button type="button" class="file-act" data-fa="open" title="Open File">${ICON_OPEN}</button>
    <button type="button" class="file-act" data-fa="blob" title="View at revision">${ICON_BLOB}</button>
    <button type="button" class="file-act" data-fa="copy-full" title="Copy Full Path">${ICON_COPY_FULL}</button>
    <button type="button" class="file-act" data-fa="copy-rel" title="Copy Relative Path">${ICON_COPY_REL}</button>
  </span>`;
}

function fileRow(path: string, name: string, status: string, oldPath = '', dir = ''): string {
  const added = status === 'A' || status === 'U';
  return `<div class="file scm-file" data-path="${esc(path)}" data-old="${esc(oldPath)}" data-st="${status}">
    <span class="badge st-${status}" title="${statusTitle(status)}">${status}</span>
    <span class="file-name" data-open="${added ? 'blob' : 'diff'}">${esc(name)}</span>
    ${fileActionsHtml()}
    ${dir ? `<span class="file-dir">${esc(dir)}</span>` : ''}
  </div>`;
}

function fileListHtml(files: CommitDetails['files']): string {
  return files
    .map((f) => {
      const i = f.path.lastIndexOf('/');
      const name = i >= 0 ? f.path.slice(i + 1) : f.path;
      const dir = i >= 0 ? f.path.slice(0, i) : '';
      return fileRow(f.path, name, f.status, f.oldPath ?? '', dir);
    })
    .join('');
}

function treeHtml(nodes: ReturnType<typeof buildFileTree>): string {
  return `<ul class="scm-tree">${nodes.map((n) => treeNode(n)).join('')}</ul>`;
}

function treeNode(n: ReturnType<typeof buildFileTree>[number]): string {
  if (n.children) {
    return `<li><details open class="scm-folder"><summary>${esc(n.name)}</summary>${treeHtml(n.children)}</details></li>`;
  }
  return `<li>${fileRow(n.path ?? '', n.name, n.status ?? '')}</li>`;
}

function paintDetails(): void {
  paint();
}

function refreshFileView(): void {
  if (!snap || !details) return;
  const tree = snap.config.fileViewType !== 'File List';
  for (const btn of document.querySelectorAll<HTMLElement>('.fv-btn')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.fv === (tree ? 'File Tree' : 'File List')));
  }
  const files = document.querySelector('.files');
  if (files) {
    files.innerHTML = tree ? treeHtml(buildFileTree(details.files, snap.config.compactFolders)) : fileListHtml(details.files);
  }
  if (detailsH == null) scheduleFitDetails();
}

function scrollToHash(hash: string): void {
  if (!snap) return;
  const i = snap.commits.findIndex((c) => c.hash === hash);
  if (i >= 0) $('scroll').scrollTop = i * ROW - 80;
}

function todayInputValue(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function dateJumpField(): 'author' | 'committer' {
  return $('date-kind-committer').checked ? 'committer' : 'author';
}

function continueDateJump(): void {
  if (!snap || !pendingDateJump) return;
  const miss = $('date-jump-miss');
  miss.hidden = true;
  const hit = firstCommitIndexForDate(
    snap.commits,
    localDayBounds(pendingDateJump.day),
    pendingDateJump.field,
    UNCOMMITTED,
  );
  if (hit.index >= 0) {
    scrollToHash(snap.commits[hit.index]!.hash);
    pendingDateJump = null;
    $('pop-date').hidePopover?.();
    return;
  }
  if (hit.status === 'need-more' && snap.hasMore) {
    post({ type: 'more' });
    return;
  }
  pendingDateJump = null;
  miss.hidden = false;
}

function startDateJump(): void {
  const day = $('date-jump-input').value;
  if (!day || !snap) return;
  pendingDateJump = { day, field: dateJumpField() };
  continueDateJump();
}

function esc(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
}

function findFlags() {
  return { regex: findPressed('find-regex'), ignoreCase: !findPressed('find-case') };
}

function findMark(text: string): string {
  return highlightFind(text, $('find-q').value, findFlags());
}

function subjectHtml(subject: string): string {
  const text = applyEmoji(subject, emojiMaps());
  const q = $('find-q').value;
  const flags = findFlags();
  let out = '';
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('`', i);
    if (start < 0) {
      out += highlightFind(text.slice(i), q, flags);
      break;
    }
    const end = text.indexOf('`', start + 1);
    if (end < 0) {
      out += highlightFind(text.slice(i), q, flags);
      break;
    }
    out += highlightFind(text.slice(i, start), q, flags);
    out += `<code>${highlightFind(text.slice(start + 1, end), q, flags)}</code>`;
    i = end + 1;
  }
  return out;
}

function syncGraphClip(): void {
  const cell = document.querySelector('#head .h.graph');
  const clip = document.getElementById('g-clip');
  if (!(cell instanceof HTMLElement) || !(clip instanceof HTMLElement)) return;
  const w = Math.max(0, Math.round(cell.getBoundingClientRect().width));
  document.documentElement.style.setProperty('--g-clip', `${w}px`);
  clip.style.width = `${w}px`;
}

function vis(cat: string, id: string): boolean {
  return snap?.menuVisibility[cat]?.[id] !== false;
}

function setGitBusy(on: boolean, fetch = false): void {
  $('btn-reload').classList.toggle('spinning', on);
  if (on && fetch) $('btn-fetch').classList.add('spinning');
  if (!on) $('btn-fetch').classList.remove('spinning');
}

function sendGit(action: GitAction): void {
  setGitBusy(true, action.kind === 'fetchRemote');
  post({ type: 'git', action });
}

function fillHelp(): void {
  const k = snap?.config.keyboard ?? {
    find: 'CTRL/CMD + F',
    refresh: 'CTRL/CMD + R',
    scrollToHead: 'CTRL/CMD + H',
    scrollToStash: 'CTRL/CMD + S',
  };
  const rows: Array<[string, string]> = [
    ['Find', k.find],
    ['Find next', 'F3'],
    ['Find previous', 'Shift+F3'],
    ['Refresh', k.refresh],
    ['Jump to HEAD', k.scrollToHead],
    ['Jump to stash', k.scrollToStash],
  ];
  $('help-keys').innerHTML = rows.map(([l, v]) => `<dt>${esc(l)}</dt><dd><kbd>${esc(v)}</kbd></dd>`).join('');
}

function applyAnchoredPopoverPlacement(
  pop: HTMLElement,
  place: ReturnType<typeof anchoredPopoverPlacement>,
): void {
  pop.style.position = 'fixed';
  pop.style.inset = 'auto';
  pop.style.margin = '0';
  pop.style.width = 'max-content';
  pop.style.maxWidth = `${place.maxWidth}px`;
  pop.style.top = `${place.top}px`;
  if (place.align === 'left') {
    pop.style.left = `${place.left}px`;
    pop.style.right = 'auto';
  } else {
    pop.style.left = 'auto';
    pop.style.right = `${place.right}px`;
  }
}

function positionAnchoredPopover(pop: HTMLElement, btn: HTMLElement, opts: AnchoredPopoverOpts = {}): void {
  const r = btn.getBoundingClientRect();
  const rect = { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  applyAnchoredPopoverPlacement(pop, anchoredPopoverPlacement(rect, pop.offsetHeight, viewport, opts));
  applyAnchoredPopoverPlacement(pop, anchoredPopoverPlacement(rect, pop.offsetHeight, viewport, opts));
}

function positionPopover(pop: HTMLElement, x: number, y: number): void {
  pop.style.inset = 'auto';
  pop.style.margin = '0';
  pop.style.position = 'fixed';
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  pop.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 4))}px`;
  pop.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 4))}px`;
}

function placePopover(pop: HTMLElement, x: number, y: number): void {
  positionPopover(pop, x, y);
  pop.showPopover?.();
  positionPopover(pop, x, y);
}

function bindPopoverAnchor(btnId: string, popId: string, opts: AnchoredPopoverOpts = {}): void {
  const btn = $(btnId);
  const pop = $(popId);
  pop.addEventListener('beforetoggle', (ev) => {
    if ((ev as ToggleEvent).newState !== 'open') return;
    positionAnchoredPopover(pop, btn, opts);
  });
  pop.addEventListener('toggle', () => {
    const open = pop.matches(':popover-open');
    btn.setAttribute('aria-pressed', open ? 'true' : 'false');
    if (open) positionAnchoredPopover(pop, btn, opts);
  });
}

const ANCHOR_POPS: Array<[string, string, AnchoredPopoverOpts?]> = [
  ['btn-refs', 'pop-refs'],
  ['btn-settings', 'pop-settings'],
  ['btn-find', 'pop-find'],
  ['btn-date', 'pop-date'],
  ['btn-repo-help', 'pop-repo-help', { align: 'left', maxWidth: 400 }],
];

function repositionOpenAnchoredPopovers(): void {
  for (const [btnId, popId, opts] of ANCHOR_POPS) {
    const pop = $(popId);
    if (pop.matches(':popover-open')) positionAnchoredPopover(pop, $(btnId), opts);
  }
}

function openCtx(html: string, x: number, y: number): void {
  const pop = $('pop-ctx');
  pop.innerHTML = html;
  placePopover(pop, x, y);
}

function gitDialog(title: string, body: string, onOk: () => void): void {
  dialogOk = onOk;
  $('git-title').textContent = title;
  $('git-body').innerHTML = body;
  const dlg = $('dlg-git') as unknown as HTMLDialogElement;
  dlg.showModal();
  const field = $('git-body').querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]), textarea');
  (field ?? $('git-ok')).focus();
}

function clickPoint(ev: Event): { x: number; y: number } {
  const m = ev as MouseEvent;
  if (Number.isFinite(m.clientX) && Number.isFinite(m.clientY)) return { x: m.clientX, y: m.clientY };
  return { x: 16, y: 16 };
}

function showConfirmTip(message: string, onOk: () => void, x: number, y: number, okLabel = 'Delete'): void {
  confirmOk = onOk;
  $('confirm-msg').textContent = message;
  $('confirm-ok').textContent = okLabel;
  placePopover($('pop-confirm'), x, y);
}

function closeConfirmTip(): void {
  confirmOk = null;
  $('pop-confirm').hidePopover?.();
}

const COL_VAR: Record<string, string> = {
  graph: '--g',
  desc: '--d',
  author: '--a',
  adate: '--ad',
  commit: '--c',
  committer: '--cm',
  cdate: '--cd',
};

function bindColResize(): void {
  const head = $('head');
  head.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const handle = (ev.target as HTMLElement).closest<HTMLElement>('.col-resizer');
    if (!handle) return;
    const cls = handle.dataset.col;
    if (!cls || !COL_VAR[cls]) return;
    ev.preventDefault();
    const key = COL_VAR[cls]!;
    const col = handle.parentElement as HTMLElement;
    const startX = ev.clientX;
    const startW = col.getBoundingClientRect().width;
    handle.setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent) => {
      const w = Math.max(48, startW + (e.clientX - startX));
      if (key === '--g') userG = w;
      document.documentElement.style.setProperty(key, `${w}px`);
      syncGraphClip();
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      if (key === '--g') paint();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  head.addEventListener('dblclick', (ev) => {
    const handle = (ev.target as HTMLElement).closest<HTMLElement>('.col-resizer');
    if (!handle) return;
    ev.preventDefault();
    autosizeColumn(handle.dataset.col ?? '');
  });
}

function autosizeColumn(cls: string): void {
  const key = COL_VAR[cls];
  if (!key) return;
  if (cls === 'graph') {
    const w = Math.max(48, $('svg').getBoundingClientRect().width + 8);
    userG = w;
    document.documentElement.style.setProperty(key, `${w}px`);
    paint();
    return;
  }
  const headCell = document.querySelector(`#head .h.${cls}`) as HTMLElement | null;
  let max = headCell ? Math.ceil(headCell.scrollWidth) : 48;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;left:-9999px;top:0;width:max-content;overflow:visible;white-space:nowrap;display:flex;align-items:center;visibility:hidden;';
  document.body.append(probe);
  for (const cell of document.querySelectorAll<HTMLElement>(`#rows .cell.${cls}`)) {
    probe.innerHTML = cell.innerHTML;
    const style = getComputedStyle(cell);
    probe.style.font = style.font;
    probe.style.padding = style.padding;
    probe.style.gap = style.gap;
    max = Math.max(max, Math.ceil(probe.scrollWidth));
  }
  probe.remove();
  document.documentElement.style.setProperty(key, `${Math.max(48, max + 8)}px`);
}

function detailsMax(): number {
  const sc = document.getElementById('scroll');
  const cap = sc ? Math.floor(sc.clientHeight * 0.85) : DETAILS_MAX;
  return Math.max(DETAILS_MIN, cap);
}

function bindSashes(): void {
  document.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const t = ev.target as HTMLElement;
    const sashX = t.closest?.('#sash-x') as HTMLElement | null;
    const sashY = t.closest?.('#sash-y') as HTMLElement | null;
    if (sashX) {
      ev.preventDefault();
      const startX = ev.clientX;
      const meta = document.querySelector('.details-body .meta');
      const startW = meta?.getBoundingClientRect().width ?? 384;
      sashX.setPointerCapture(ev.pointerId);
      const move = (e: PointerEvent) => {
        const w = Math.max(220, Math.min(720, startW + (e.clientX - startX)));
        document.documentElement.style.setProperty('--details-meta', `${w}px`);
      };
      const up = () => {
        sashX.removeEventListener('pointermove', move);
        sashX.removeEventListener('pointerup', up);
      };
      sashX.addEventListener('pointermove', move);
      sashX.addEventListener('pointerup', up);
    }
    if (sashY) {
      ev.preventDefault();
      const invert = sashY.dataset.dir === 'up';
      const startY = ev.clientY;
      const startH = currentDetailsHeight();
      sashY.setPointerCapture(ev.pointerId);
      const move = (e: PointerEvent) => {
        const delta = e.clientY - startY;
        detailsH = Math.max(DETAILS_MIN, Math.min(detailsMax(), startH + (invert ? -delta : delta)));
        const inline = document.getElementById('inline-details');
        if (inline && !inline.hidden) {
          inline.style.height = `${detailsH}px`;
          if (snap) $('spacer').style.height = `${snap.commits.length * ROW + detailsH}px`;
        }
        const dock = document.getElementById('dock');
        if (dock && !dock.hidden) dock.style.height = `${detailsH}px`;
      };
      const up = () => {
        sashY.removeEventListener('pointermove', move);
        sashY.removeEventListener('pointerup', up);
        paint();
      };
      sashY.addEventListener('pointermove', move);
      sashY.addEventListener('pointerup', up);
    }
  });
  document.addEventListener('dblclick', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest?.('#sash-x')) document.documentElement.style.removeProperty('--details-meta');
    if (t.closest?.('#sash-y')) {
      detailsH = null;
      if (details) autoDetailsH = estimateFromDetails(details);
      paint();
      scheduleFitDetails();
    }
  });
}

function bindDialogs(): void {
  const dlg = $('dlg-git') as unknown as HTMLDialogElement;
  const form = $('git-form') as unknown as HTMLFormElement;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const submitter = (ev as SubmitEvent).submitter as HTMLButtonElement | null;
    dlg.close();
    const ok = dialogOk;
    dialogOk = null;
    if (!submitter || submitter.id === 'git-ok' || submitter.value === 'ok') ok?.();
  });
  $('git-cancel').addEventListener('click', () => {
    dialogOk = null;
    dlg.close();
  });
  dlg.addEventListener('cancel', () => {
    dialogOk = null;
  });
  dlg.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      dialogOk = null;
      ev.stopPropagation();
      return;
    }
    if (ev.key !== 'Enter' || ev.isComposing) return;
    const t = ev.target as HTMLElement;
    if (t.closest('textarea')) return;
    if (t.id === 'git-cancel') return;
    ev.preventDefault();
    ev.stopPropagation();
    form.requestSubmit($('git-ok') as unknown as HTMLButtonElement);
  });
}

function sub(mode: string): string {
  return applySpaceSubstitution(($('git-body').querySelector('input,textarea') as HTMLInputElement | null)?.value ?? '', mode as 'None');
}

function postDiff(file: { path: string; oldPath?: string }): void {
  if (!details) return;
  post({
    type: 'diff',
    hash: details.hash,
    path: file.path,
    oldPath: file.oldPath,
    compare: details.compare,
  });
}

function showCopiedToast(x: number, y: number): void {
  document.querySelectorAll('.copied-toast').forEach((n) => n.remove());
  const tip = document.createElement('div');
  tip.className = 'copied-toast';
  tip.textContent = 'Copied';
  document.body.append(tip);
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  tip.style.left = `${Math.max(4, Math.min(x - w / 2, window.innerWidth - w - 4))}px`;
  tip.style.top = `${Math.max(4, y - h - 8)}px`;
  window.setTimeout(() => tip.remove(), 2000);
}

function flashCopied(el: HTMLElement): void {
  el.classList.add('copied');
  const r = el.getBoundingClientRect();
  showCopiedToast(r.left + r.width / 2, r.top);
  window.setTimeout(() => el.classList.remove('copied'), 2000);
}

function viewFileAtRevision(file: HTMLElement): void {
  if (!details) return;
  const path = file.dataset.path ?? '';
  const added = file.dataset.st === 'A' || file.dataset.st === 'U';
  if (details.hash === UNCOMMITTED && added) {
    post({ type: 'openWorkFile', path });
    return;
  }
  post({ type: 'showBlob', hash: details.hash === UNCOMMITTED ? 'HEAD' : details.hash, path });
}

function runFileAction(kind: string, file: HTMLElement): void {
  if (!details) return;
  const path = file.dataset.path ?? '';
  if (kind === 'diff') {
    postDiff({ path, oldPath: file.dataset.old || undefined });
    return;
  }
  if (kind === 'open') {
    post({ type: 'openWorkFile', path });
    return;
  }
  if (kind === 'blob') {
    viewFileAtRevision(file);
    return;
  }
  if (kind === 'copy-rel') {
    post({ type: 'copy', text: path });
    return;
  }
  if (kind === 'copy-full') post({ type: 'copy', text: joinRepoPath(path) });
}

function onDetailsClick(ev: MouseEvent): boolean {
  const t = ev.target as HTMLElement;
  const fv = t.closest<HTMLElement>('[data-fv]');
  if (fv && snap && details) {
    const value = fv.dataset.fv as 'File Tree' | 'File List';
    snap.config.fileViewType = value;
    post({ type: 'setFileView', value });
    refreshFileView();
    return true;
  }
  const act = t.closest<HTMLElement>('[data-fa]');
  if (act && details) {
    const file = t.closest<HTMLElement>('.file');
    if (file) {
      runFileAction(act.dataset.fa ?? '', file);
      if (act.dataset.fa === 'copy-full' || act.dataset.fa === 'copy-rel') flashCopied(act);
    }
    return true;
  }
  const name = t.closest<HTMLElement>('.file-name');
  if (name && details) {
    const file = t.closest<HTMLElement>('.file');
    if (file) {
      if (name.dataset.open === 'blob') viewFileAtRevision(file);
      else postDiff({ path: file.dataset.path ?? '', oldPath: file.dataset.old || undefined });
    }
    return true;
  }
  const copy = t.closest<HTMLElement>('[data-copy]');
  if (copy?.dataset.copy) {
    ev.preventDefault();
    post({ type: 'copy', text: copy.dataset.copy });
    flashCopied(copy);
    return true;
  }
  const parent = t.closest<HTMLElement>('[data-parent]');
  if (parent?.dataset.parent) {
    ev.preventDefault();
    selected = parent.dataset.parent;
    compare = undefined;
    post({ type: 'openRow', hash: selected });
    return true;
  }
  return false;
}

function bind(): void {
  $('repo').addEventListener('change', (e) => post({ type: 'pickRepo', path: (e.target as HTMLSelectElement).value }));
  $('s-theme').addEventListener('change', (e) => post({ type: 'setTheme', value: (e.target as HTMLSelectElement).value as GraphSnapshot['config']['theme'] }));
  $('s-raycat').addEventListener('change', postRayCat);
  $('s-raycat-count').addEventListener('change', postRayCat);
  $('btn-head').addEventListener('click', () => snap?.head && scrollToHash(snap.head));
  $('date-jump-go').addEventListener('click', startDateJump);
  $('date-jump-input').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      startDateJump();
    }
  });
  $('btn-reload').addEventListener('click', () => {
    setGitBusy(true);
    post({ type: 'reload' });
  });
  $('btn-fetch').addEventListener('click', () => {
    if (!snap) return;
    sendGit({
      kind: 'fetchRemote',
      prune: snap.config.fetchAndPrune,
      pruneTags: snap.config.fetchAndPruneTags,
    });
  });
  $('fail-close').addEventListener('click', () => {
    $('fail-msg').textContent = '';
    $('fail').hidden = true;
  });
  $('show-remotes').addEventListener('change', (e) => {
    e.stopPropagation();
    if (!filterDraft) startFilterDraft();
    if (filterDraft) filterDraft.showRemotes = (e.target as HTMLInputElement).checked;
    fillRefs();
  });
  $('show-all').addEventListener('change', (e) => {
    if (!filterDraft) startFilterDraft();
    if (filterDraft) filterDraft.showAll = (e.target as HTMLInputElement).checked;
  });
  $('ref-list').addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    if (!box.dataset.ref) return;
    if (!filterDraft) startFilterDraft();
    if (!filterDraft) return;
    filterDraft.showAll = false;
    $('show-all').checked = false;
    if (box.checked) filterDraft.picked.add(box.dataset.ref);
    else filterDraft.picked.delete(box.dataset.ref);
  });
  $('ref-list').addEventListener('scroll', () => {
    if (!filterDraft || !snap) return;
    const list = $('ref-list');
    if (list.scrollTop + list.clientHeight < list.scrollHeight - 24) return;
    filterDraft.shown += snap.config.refsListLimit;
    fillRefs();
  });
  $('ref-q').addEventListener('input', () => {
    if (filterDraft) filterDraft.shown = snap?.config.refsListLimit ?? 200;
    fillRefs();
  });
  $('pop-refs').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const t = ev.target as HTMLElement;
    if (t.closest('.ref-tabs') || t.id === 'ref-ok') return;
    ev.preventDefault();
    applyFilter();
  });
  $('ref-ok').addEventListener('click', applyFilter);
  for (const tab of ['branch', 'tag', 'worktree'] as const) {
    $(`ref-tab-${tab}`).addEventListener('click', () => {
      if (!filterDraft) startFilterDraft();
      if (!filterDraft) return;
      filterDraft.tab = tab;
      filterDraft.shown = snap?.config.refsListLimit ?? 200;
      fillRefs();
    });
  }
  $('pop-refs').addEventListener('toggle', (ev) => {
    if ((ev as ToggleEvent).newState === 'open') {
      startFilterDraft();
      fillRefs();
      $('ref-q').focus();
      return;
    }
    filterDraft = null;
  });
  $('scroll').addEventListener('scroll', () => {
    paint();
    if (snap?.hasMore && snap.config.loadMoreAutomatically) {
      const s = $('scroll');
      if (s.scrollTop + s.clientHeight > s.scrollHeight - 80) post({ type: 'more' });
    }
  });
  $('scroll').addEventListener('mousedown', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-fv], .file-act')) ev.preventDefault();
  });
  $('dock').addEventListener('mousedown', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-fv], .file-act')) ev.preventDefault();
  });
  $('scroll').addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.id === 'more') {
      post({ type: 'more' });
      return;
    }
    if (onDetailsClick(ev)) return;
    const chip = t.closest<HTMLElement>('.chip');
    if (chip) {
      if (ev.detail === 2) checkoutChip(chip);
      return;
    }
    const row = t.closest<HTMLElement>('.row');
    if (!row?.dataset.hash) return;
    const hash = row.dataset.hash;
    if (ev.ctrlKey || ev.metaKey) {
      if (selected && hash !== selected) {
        compare = hash;
        post({ type: 'compare', a: selected, b: compare });
        paint();
      }
      return;
    }
    if (details && (hash === selected || hash === compare)) {
      selected = null;
      compare = undefined;
      details = null;
      post({ type: 'openRow', hash: null });
    } else {
      selected = hash!;
      compare = undefined;
      post({ type: 'openRow', hash: selected });
    }
    paint();
  });
  $('dock').addEventListener('click', (ev) => {
    onDetailsClick(ev);
  });
  $('scroll').addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const t = ev.target as HTMLElement;
    const chip = t.closest<HTMLElement>('.chip');
    const row = t.closest<HTMLElement>('.row');
    if (chip) {
      menuRef(chip, ev.clientX, ev.clientY);
      return;
    }
    if (row?.dataset.hash) menuCommit(row.dataset.hash, ev.clientX, ev.clientY);
  });
  $('head').addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    placePopover($('pop-cols'), ev.clientX, ev.clientY);
  });
  $('pop-cols').addEventListener('change', () => {
    if (!snap) return;
    const v = { ...snap.config.columnVisibility };
    for (const cb of document.querySelectorAll<HTMLInputElement>('#pop-cols input')) {
      v[cb.dataset.col as keyof ColumnVisibility] = cb.checked;
    }
    post({ type: 'setColumns', value: v });
  });
  $('find-q').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const dir = ev.shiftKey ? -1 : 1;
      if (findPressed('find-diff')) {
        findPendingDir = dir;
        if (findDiffTimer) clearTimeout(findDiffTimer);
        requestFindDiffs();
        return;
      }
      runFind(dir);
    }
  });
  $('find-q').addEventListener('input', () => scheduleFind());
  $('find-next').addEventListener('click', () => runFind(1));
  $('find-prev').addEventListener('click', () => runFind(-1));
  for (const id of ['find-case', 'find-regex', 'find-diff'] as const) {
    $(id).addEventListener('click', () => {
      const btn = $(id);
      btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      scheduleFind();
    });
  }
  $('btn-repo-help').addEventListener('click', () => {
    const pop = $('pop-repo-help');
    if (pop.matches(':popover-open')) pop.hidePopover?.();
    else pop.showPopover?.();
  });
  $('btn-help').addEventListener('click', fillHelp);
  $('help-settings').addEventListener('click', () => {
    ($('dlg-help') as unknown as HTMLDialogElement).close();
    post({ type: 'openSettings' });
  });
  for (const id of ['s-remotes', 's-stashes', 's-tags', 's-worktrees', 's-reflogs', 's-first'] as const) {
    $(id).addEventListener('change', saveSettings);
  }
  $('issue-save').addEventListener('click', saveSettings);
  $('pr-save').addEventListener('click', saveSettings);
  const postFetchPrune = () =>
    post({ type: 'setFetchPrune', prune: $('s-prune').checked, pruneTags: $('s-prune-tags').checked });
  $('s-prune').addEventListener('change', postFetchPrune);
  $('s-prune-tags').addEventListener('change', postFetchPrune);
  $('add-remote').addEventListener('click', () => {
    gitDialog(
      'Add remote',
      `<label class="dlg-field">Name <input id="rn" placeholder="name" /></label><label class="dlg-field">URL <input id="ru" placeholder="url" /></label>`,
      () => {
        const name = (document.getElementById('rn') as HTMLInputElement).value;
        const url = (document.getElementById('ru') as HTMLInputElement).value;
        setGitBusy(true);
        post({ type: 'addRemote', name, fetchUrl: url });
      },
    );
  });
  $('remote-list').addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-del], [data-ed]');
    if (!t || !snap) return;
    ev.stopPropagation();
    if (t.dataset.ed) {
      const rem = snap.remotes.find((x) => x.name === t.dataset.ed);
      if (!rem) return;
      gitDialog(
        'Edit remote',
        `<label class="dlg-field">Name <input id="rn" value="${esc(rem.name)}" /></label>
         <label class="dlg-field">Fetch URL <input id="ru" value="${esc(rem.fetchUrl)}" /></label>
         <label class="dlg-field">Push URL <input id="pu" value="${esc(rem.pushUrl)}" /></label>`,
        () => {
          setGitBusy(true);
          post({
            type: 'editRemote',
            name: rem.name,
            newName: (document.getElementById('rn') as HTMLInputElement).value,
            fetchUrl: (document.getElementById('ru') as HTMLInputElement).value,
            pushUrl: (document.getElementById('pu') as HTMLInputElement).value,
          });
        },
      );
      return;
    }
    if (!t.dataset.del) return;
    const name = t.dataset.del;
    const r = t.getBoundingClientRect();
    showConfirmTip(`Delete remote "${name}"?`, () => {
      setGitBusy(true);
      post({ type: 'deleteRemote', name });
    }, r.left, r.bottom + 4);
  });
  $('confirm-ok').addEventListener('click', () => {
    const ok = confirmOk;
    confirmOk = null;
    $('pop-confirm').hidePopover?.();
    ok?.();
  });
  $('confirm-cancel').addEventListener('click', closeConfirmTip);
  $('pop-confirm').addEventListener('toggle', (ev) => {
    if ((ev as ToggleEvent).newState === 'closed') confirmOk = null;
  });
  $('pop-ctx').addEventListener('click', onMenu);
  document.addEventListener('contextmenu', (ev) => {
    const file = (ev.target as HTMLElement).closest<HTMLElement>('.file');
    if (!file || !details) return;
    ev.preventDefault();
    ctxFile = { path: file.dataset.path ?? '', oldPath: file.dataset.old || undefined };
    openCtx(
      `${btn('f-diff', 'Diff')}${btn('f-open', 'Open file')}${btn('f-blob', 'View at revision')}${btn('f-copy', 'Copy path')}`,
      ev.clientX,
      ev.clientY,
    );
  });
  bindPopoverAnchor('btn-refs', 'pop-refs');
  bindPopoverAnchor('btn-settings', 'pop-settings');
  bindPopoverAnchor('btn-find', 'pop-find');
  bindPopoverAnchor('btn-date', 'pop-date');
  bindPopoverAnchor('btn-repo-help', 'pop-repo-help', { align: 'left', maxWidth: 400 });
  document.addEventListener('pointerdown', (ev) => {
    const pop = $('pop-repo-help');
    if (!pop.matches(':popover-open')) return;
    const t = ev.target as Node;
    if (pop.contains(t) || $('btn-repo-help').contains(t)) return;
    pop.hidePopover?.();
  });
  $('pop-date').addEventListener('toggle', () => {
    if (!$('pop-date').matches(':popover-open')) return;
    if (!$('date-jump-input').value) $('date-jump-input').value = todayInputValue();
    $('date-jump-miss').hidden = true;
    $('date-jump-input').focus();
  });
  $('btn-date').addEventListener('click', () => {
    const pop = $('pop-date');
    if (pop.matches(':popover-open')) pop.hidePopover?.();
    else pop.showPopover?.();
  });
  $('btn-settings').addEventListener('click', () => {
    const pop = $('pop-settings');
    if (pop.matches(':popover-open')) pop.hidePopover?.();
    else pop.showPopover?.();
  });
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', repositionOpenAnchoredPopovers);
  bindColResize();
  bindSashes();
  bindDialogs();
  const graphHead = document.querySelector('#head .h.graph');
  if (graphHead) new ResizeObserver(() => syncGraphClip()).observe(graphHead);
  new ResizeObserver(() => {
    syncGraphClip();
    repositionOpenAnchoredPopovers();
  }).observe($('board'));
}

function postRayCat(): void {
  const count = Math.max(1, Math.min(10, Math.round(Number($('s-raycat-count').value) || 1)));
  $('s-raycat-count').value = String(count);
  const enabled = $('s-raycat').checked;
  $('s-raycat-count').disabled = !enabled;
  syncRayCats($('ray-cats') as unknown as HTMLCanvasElement, enabled, count);
  post({ type: 'setRayCat', enabled, count });
}

function saveSettings(): void {
  if (!snap) return;
  const settings: RepoSettings = {
    ...defaultRepoSettings(),
    ...snap.repoSettings,
    showRemotes: $('s-remotes').checked,
    showStashes: $('s-stashes').checked,
    showTags: $('s-tags').checked,
    showWorktrees: $('s-worktrees').checked,
    showReflogs: $('s-reflogs').checked,
    firstParent: $('s-first').checked,
    issueLinking: $('issue-re').value ? { regex: $('issue-re').value, url: $('issue-url').value, global: $('issue-global').checked } : null,
    pullRequest: { provider: $('pr-provider').value },
  };
  post({ type: 'saveRepoSettings', settings });
}

function findPressed(id: string): boolean {
  return $(id).getAttribute('aria-pressed') === 'true';
}

function scheduleFind(): void {
  if (findDiffTimer) clearTimeout(findDiffTimer);
  if (findPressed('find-diff')) {
    findDiffTimer = setTimeout(() => requestFindDiffs(), 280);
    return;
  }
  findDiffHashes = null;
  runFind(0);
}

function requestFindDiffs(): void {
  const q = $('find-q').value;
  const err = $('find-err');
  if (!q) {
    findDiffHashes = [];
    err.hidden = true;
    runFind(0);
    return;
  }
  if (findPressed('find-regex') && !compileFindRegex(q, !findPressed('find-case'))) {
    findDiffHashes = [];
    err.hidden = false;
    err.textContent = 'Invalid regular expression';
    runFind(0);
    return;
  }
  err.hidden = true;
  post({ type: 'findInDiffs', pattern: q, ignoreCase: !findPressed('find-case'), regex: findPressed('find-regex') });
}

function runFind(dir: number): void {
  if (!snap) return;
  const q = $('find-q').value;
  const err = $('find-err');
  const flags = { regex: findPressed('find-regex'), ignoreCase: !findPressed('find-case') };
  if (flags.regex && q && !compileFindRegex(q, flags.ignoreCase)) {
    err.hidden = false;
    err.textContent = 'Invalid regular expression';
    $('find-count').textContent = formatFindCount(0, 0);
    findHits = [];
    paint();
    return;
  }
  if (!findPressed('find-diff')) err.hidden = true;
  if (!q) {
    findHits = [];
    $('find-count').textContent = formatFindCount(0, 0, false);
    paint();
    return;
  }
  if (findPressed('find-diff')) {
    const allow = new Set(findDiffHashes ?? []);
    findHits = snap.commits.map((c, i) => ({ c, i })).filter(({ c }) => allow.has(c.hash)).map((x) => x.i);
  } else {
    findHits = snap.commits.map((c, i) => ({ c, i })).filter(({ c }) => matchCommit(c, q, flags)).map((x) => x.i);
  }
  if (!findHits.length) {
    $('find-count').textContent = formatFindCount(0, 0);
    paint();
    return;
  }
  if (dir === 0) findI = Math.min(findI, findHits.length - 1);
  else findI = (findI + dir + findHits.length) % findHits.length;
  $('find-count').textContent = formatFindCount(findI + 1, findHits.length);
  paint();
  if (dir === 0) return;
  const hash = snap.commits[findHits[findI]!]!.hash;
  selected = hash;
  scrollToHash(hash);
}

function onKey(ev: KeyboardEvent): void {
  if (!snap) return;
  if (ev.key === 'Escape') {
    if ((ev.target as HTMLElement).closest('dialog')) {
      dialogOk = null;
      return;
    }
    const dlg = document.querySelector('dialog[open]') as HTMLDialogElement | null;
    if (dlg) {
      dialogOk = null;
      dlg.close();
      return;
    }
    if ($('pop-confirm').matches(':popover-open')) {
      closeConfirmTip();
      return;
    }
    $('pop-settings').hidePopover?.();
    $('pop-ctx').hidePopover?.();
    $('pop-find').hidePopover?.();
    $('pop-date').hidePopover?.();
    $('pop-refs').hidePopover?.();
    $('pop-repo-help').hidePopover?.();
    if (details) {
      details = null;
      selected = null;
      compare = undefined;
      post({ type: 'openRow', hash: null });
      paint();
    }
    return;
  }
  if (ev.key === 'F3') {
    if (document.querySelector('dialog[open]')) return;
    ev.preventDefault();
    runFind(ev.shiftKey ? -1 : 1);
    return;
  }
  if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && details && selected) {
    if (document.querySelector('dialog[open], [popover]:popover-open')) return;
    if ((ev.target as HTMLElement).closest('input, textarea, select')) return;
    ev.preventDefault();
    const dir = ev.key === 'ArrowDown' ? 1 : -1;
    const i = snap.commits.findIndex((c) => c.hash === selected);
    const next = snap.commits[i + dir];
    if (!next) return;
    selected = next.hash;
    compare = undefined;
    post({ type: 'openRow', hash: selected });
    paint();
    return;
  }
  if (shortcutMatches(snap.config.keyboard.find, ev)) {
    ev.preventDefault();
    $('pop-find').showPopover?.();
    $('find-q').focus();
  }
  if (shortcutMatches(snap.config.keyboard.refresh, ev)) {
    ev.preventDefault();
    setGitBusy(true);
    post({ type: 'reload' });
  }
  if (shortcutMatches(snap.config.keyboard.scrollToHead, ev) && snap.head) {
    ev.preventDefault();
    scrollToHash(snap.head);
  }
  if (shortcutMatches(snap.config.keyboard.scrollToStash, ev)) {
    ev.preventDefault();
    const idxs = snap.commits.map((c, i) => (c.refs.some((r) => r.kind === 'stash') ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) return;
    stashI = ev.shiftKey ? (stashI - 1 + idxs.length) % idxs.length : (stashI + 1) % idxs.length;
    scrollToHash(snap.commits[idxs[stashI]!]!.hash);
  }
}

function checkoutChip(chip: HTMLElement): void {
  if (!snap) return;
  const kind = chip.dataset.kind ?? '';
  if (kind !== 'head' && kind !== 'remote') return;
  const plan = startCheckoutFromRef(
    snap.commits,
    { kind, name: chip.dataset.name ?? '', remote: chip.dataset.remote, hash: chip.dataset.hash },
    snap.currentBranch,
  );
  runPlan(plan);
}

function runPlan(plan: ReturnType<typeof startCheckoutFromRef>): void {
  if (plan.kind === 'local') sendGit({ kind: 'checkoutBranch', name: plan.name });
  if (plan.kind === 'promptCreate') {
    gitDialog(
      'Checkout remote branch',
      `<p>Checkout <code>${esc(plan.remoteBranch)}</code>?</p><label>Local name <input id="ln" value="${esc(plan.localName)}" /></label>`,
      () => {
        sendGit({
          kind: 'checkoutRemote',
          remoteBranch: plan.remoteBranch,
          localName: (document.getElementById('ln') as HTMLInputElement).value,
        });
      },
    );
  }
  if (plan.kind === 'confirmPull') {
    gitDialog(
      'Checkout existing branch',
      `<p>Local branch <code>${esc(plan.name)}</code> is at a different commit.</p>
       <label><input type="checkbox" id="do-pull" checked /> Pull from ${esc(plan.remote)} after checkout</label>`,
      () => {
        const pull = (document.getElementById('do-pull') as HTMLInputElement).checked;
        sendGit({
          kind: 'checkoutBranch',
          name: plan.name,
          pullAfterwards: pull
            ? {
                remote: plan.remote,
                branch: plan.branch,
                noFastForward: snap!.config.dialogs.pullNoFastForward,
                squash: snap!.config.dialogs.pullSquash,
                squashMessageFormat: snap!.config.dialogs.pullSquashMessageFormat,
              }
            : undefined,
        });
      },
    );
  }
}

function menuRef(chip: HTMLElement, x: number, y: number): void {
  const kind = chip.dataset.kind ?? '';
  const name = chip.dataset.name ?? '';
  const items: string[] = [];
  if (kind === 'worktree') {
    if (vis('worktree', 'open')) items.push(btn('wt-open', 'Open here'));
    if (vis('worktree', 'openNew')) items.push(btn('wt-new', 'Open new window'));
    if (vis('worktree', 'remove')) items.push(btn('wt-del', 'Remove'));
  } else if (kind === 'stash') {
    if (vis('stash', 'apply')) items.push(btn('st-apply', 'Apply'));
    if (vis('stash', 'pop')) items.push(btn('st-pop', 'Pop'));
    if (vis('stash', 'branch')) items.push(btn('st-br', 'Branch'));
    if (vis('stash', 'drop')) items.push(btn('st-drop', 'Drop'));
    items.push(btn('copy', 'Copy name'));
  } else if (kind === 'tag') {
    if (vis('tag', 'delete')) items.push(btn('tag-del', 'Delete'));
    if (vis('tag', 'push')) items.push(btn('tag-push', 'Push'));
    items.push(btn('copy', 'Copy name'));
  } else if (kind === 'head') {
    if (name === 'HEAD') items.push(btn('copy', 'Copy name'));
    else {
      ctxCommit = null;
      ctxFile = null;
      ctxRef = { kind: kind as GraphRef['kind'], name, hash: chip.dataset.hash ?? '', remote: chip.dataset.remote, worktreePath: chip.dataset.wt };
      openCtx(
        menuHtml(branchMenuEntries({ current: name === snap?.currentBranch, visible: (id) => vis('branch', id) })),
        x,
        y,
      );
      return;
    }
  } else if (kind === 'remote') {
    if (vis('remote', 'checkout')) items.push(btn('rm-co', 'Checkout'));
    if (vis('remote', 'delete')) items.push(btn('rm-del', 'Delete'));
    if (vis('remote', 'fetchInto')) items.push(btn('rm-fi', 'Fetch into local'));
    if (vis('remote', 'pull')) items.push(btn('rm-pl', 'Pull'));
    if (vis('remote', 'pr')) items.push(btn('pr', 'Create PR'));
    items.push(btn('copy', 'Copy name'));
  }
  ctxCommit = null;
  ctxFile = null;
  ctxRef = { kind: kind as GraphRef['kind'], name, hash: chip.dataset.hash ?? '', remote: chip.dataset.remote, worktreePath: chip.dataset.wt };
  openCtx(items.join(''), x, y);
}

function menuCommit(hash: string, x: number, y: number): void {
  const c = snap?.commits.find((x) => x.hash === hash);
  if (!c || !snap) return;
  ctxCommit = c;
  ctxRef = null;
  ctxFile = null;
  if (hash === UNCOMMITTED) {
    const items: string[] = [];
    if (vis('uncommitted', 'stash')) items.push(btn('u-st', 'Stash'));
    if (vis('uncommitted', 'reset')) items.push(btn('u-rs', 'Reset'));
    if (vis('uncommitted', 'clean')) items.push(btn('u-cl', 'Clean'));
    if (vis('uncommitted', 'scm')) items.push(btn('u-scm', 'Open SCM'));
    openCtx(items.join(''), x, y);
    return;
  }
  openCtx(
    menuHtml(
      commitMenuEntries({
        canReword: gitAtLeast(snap.config.gitMajorMinor, 2, 54),
        isMerge: c.parents.length > 1,
        visible: (id) => vis('commit', id),
      }),
    ),
    x, y,
  );
}

function btn(id: string, label: string): string {
  return `<button type="button" data-act="${id}">${label}</button>`;
}

function onMenu(ev: Event): void {
  const id = (ev.target as HTMLElement).dataset.act;
  if (!id || !snap) return;
  $('pop-ctx').hidePopover?.();
  const d = snap.config.dialogs;
  const sp = d.spaceSubstitution;
  const act = (a: GitAction) => sendGit(a);
  if (ctxRef) {
    const r = ctxRef;
    if (id === 'copy') {
      post({ type: 'copy', text: r.name });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'wt-open' && r.worktreePath) act({ kind: 'worktreeOpen', path: r.worktreePath, newWindow: false });
    if (id === 'wt-new' && r.worktreePath) act({ kind: 'worktreeOpen', path: r.worktreePath, newWindow: true });
    if (id === 'wt-del' && r.worktreePath) {
      const p = clickPoint(ev);
      showConfirmTip(`Remove worktree ${r.worktreePath}?`, () => act({ kind: 'worktreeRemove', path: r.worktreePath!, force: false }), p.x, p.y, 'Remove');
    }
    if (id === 'st-apply') act({ kind: 'stashApply', name: r.name.split(' ')[0] ?? r.name, pop: false, reinstateIndex: d.applyStashReinstateIndex });
    if (id === 'st-pop') act({ kind: 'stashApply', name: r.name.split(' ')[0] ?? r.name, pop: true, reinstateIndex: d.popStashReinstateIndex });
    if (id === 'st-drop') {
      const p = clickPoint(ev);
      showConfirmTip(`Drop stash ${r.name}?`, () => act({ kind: 'stashDrop', name: r.name.split(' ')[0] ?? r.name }), p.x, p.y, 'Drop');
    }
    if (id === 'st-br') gitDialog('Branch from stash', `<input id="bn" />`, () => act({ kind: 'stashCreateBranch', name: applySpaceSubstitution((document.getElementById('bn') as HTMLInputElement).value, sp), stash: r.name.split(' ')[0] ?? r.name }));
    if (id === 'tag-del') {
      const p = clickPoint(ev);
      showConfirmTip(`Delete tag ${r.name}?`, () => act({ kind: 'deleteTag', name: r.name }), p.x, p.y);
    }
    if (id === 'tag-push') gitDialog('Push tag', `<input id="rm" value="${esc(snap.remotes[0]?.name ?? 'origin')}" />`, () => act({ kind: 'pushTag', name: r.name, remote: (document.getElementById('rm') as HTMLInputElement).value }));
    if (id === 'br-co') runPlan({ kind: 'local', name: r.name });
    if (id === 'br-rn') gitDialog('Rename', `<input id="nn" value="${esc(r.name)}" />`, () => act({ kind: 'renameBranch', oldName: r.name, newName: applySpaceSubstitution((document.getElementById('nn') as HTMLInputElement).value, sp) }));
    if (id === 'br-del') gitDialog('Delete branch', `<label><input type="checkbox" id="fr" ${d.deleteBranchForce ? 'checked' : ''}/> force</label>`, () => act({ kind: 'deleteBranch', name: r.name, force: (document.getElementById('fr') as HTMLInputElement).checked }));
    if (id === 'br-mg') gitDialog('Merge', checks(d), () => act({ kind: 'merge', ref: r.name, noCommit: val('nc'), noFastForward: val('nff'), squash: val('sq'), squashMessageFormat: d.mergeSquashMessageFormat }));
    if (id === 'br-rb') gitDialog('Rebase', `<label><input type="checkbox" id="id" ${d.rebaseIgnoreDate ? 'checked' : ''}/> ignore date</label><label><input type="checkbox" id="ir" ${d.rebaseInteractive ? 'checked' : ''}/> interactive</label>`, () => act({ kind: 'rebase', ref: r.name, ignoreDate: (document.getElementById('id') as HTMLInputElement).checked, interactive: (document.getElementById('ir') as HTMLInputElement).checked }));
    if (id === 'br-ps') gitDialog('Push', `<input id="rm" value="${esc(snap.remotes[0]?.name ?? 'origin')}" />`, () => act({ kind: 'pushBranch', name: r.name, remote: (document.getElementById('rm') as HTMLInputElement).value, setUpstream: true }));
    if (id === 'rm-co') runPlan(decideNamedRemoteCheckout(snap.commits, r.name, r.name.slice(r.name.indexOf('/') + 1), r.hash, snap.currentBranch));
    if (id === 'rm-del') {
      const p = clickPoint(ev);
      showConfirmTip(`Delete remote branch ${r.name}?`, () => act({ kind: 'deleteRemoteBranch', remote: r.remote ?? r.name.split('/')[0]!, name: r.name }), p.x, p.y);
    }
    if (id === 'rm-fi') act({ kind: 'fetchIntoLocal', local: r.name.slice(r.name.indexOf('/') + 1), remoteRef: r.name, force: d.fetchIntoLocalForce });
    if (id === 'rm-pl') act({ kind: 'pullBranch', remote: r.remote ?? 'origin', branch: r.name.slice(r.name.indexOf('/') + 1), noFastForward: d.pullNoFastForward, squash: d.pullSquash, squashMessageFormat: d.pullSquashMessageFormat });
    if (id === 'pr') openPr(r.name);
  }
  if (ctxCommit) {
    const c = ctxCommit;
    if (id === 'copyh') {
      post({ type: 'copy', text: c.hash });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'copys') {
      post({ type: 'copy', text: c.subject });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'u-st') act({ kind: 'stash', includeUntracked: d.stashIncludeUntracked });
    if (id === 'u-rs') act({ kind: 'reset', hash: 'HEAD', mode: d.resetUncommittedMode.toLowerCase() as 'mixed' | 'hard' });
    if (id === 'u-cl') {
      const p = clickPoint(ev);
      showConfirmTip('Delete untracked files?', () => act({ kind: 'cleanUntracked', directories: true }), p.x, p.y);
    }
    if (id === 'u-scm') act({ kind: 'openScm' });
    if (id === 'c-tag') gitDialog('Add tag', `<input id="tn" /><label><input type="checkbox" id="an" ${d.addTagType === 'Annotated' ? 'checked' : ''}/> annotated</label>`, () => act({ kind: 'addTag', hash: c.hash, name: applySpaceSubstitution((document.getElementById('tn') as HTMLInputElement).value, sp), annotated: (document.getElementById('an') as HTMLInputElement).checked, pushTo: d.addTagPushToRemote ? snap!.remotes[0]?.name : undefined }));
    if (id === 'c-br') gitDialog('Create branch', `<input id="bn" /><label><input type="checkbox" id="co" ${d.createBranchCheckOut ? 'checked' : ''}/> checkout</label>`, () => act({ kind: 'createBranch', hash: c.hash, name: applySpaceSubstitution((document.getElementById('bn') as HTMLInputElement).value, sp), checkout: (document.getElementById('co') as HTMLInputElement).checked }));
    if (id === 'c-co') act({ kind: 'checkoutCommit', hash: c.hash });
    if (id === 'c-cp') gitDialog('Cherry-pick', `<label><input type="checkbox" id="nc" ${d.cherryPickNoCommit ? 'checked' : ''}/> no commit</label>`, () => act({ kind: 'cherryPick', hash: c.hash, noCommit: (document.getElementById('nc') as HTMLInputElement).checked, recordOrigin: d.cherryPickRecordOrigin }));
    if (id === 'c-rv') gitDialog('Revert', 'Revert this commit?', () => act({ kind: 'revert', hash: c.hash }));
    if (id === 'c-dr') {
      const p = clickPoint(ev);
      showConfirmTip('Drop this commit and rewrite history?', () => act({ kind: 'dropCommit', hash: c.hash }), p.x, p.y, 'Drop');
    }
    if (id === 'c-mg') gitDialog('Merge', checks(d), () => act({ kind: 'merge', ref: c.hash, noCommit: val('nc'), noFastForward: val('nff'), squash: val('sq'), squashMessageFormat: d.mergeSquashMessageFormat }));
    if (id === 'c-rb') gitDialog('Rebase', `<label><input type="checkbox" id="id" ${d.rebaseIgnoreDate ? 'checked' : ''}/> ignore date</label>`, () => act({ kind: 'rebase', ref: c.hash, ignoreDate: (document.getElementById('id') as HTMLInputElement).checked, interactive: false }));
    if (id === 'c-rbi') act({ kind: 'rebase', ref: c.hash, ignoreDate: false, interactive: true });
    if (id === 'c-rs') gitDialog('Reset', 'Reset current branch?', () => act({ kind: 'reset', hash: c.hash, mode: d.resetBranchMode.toLowerCase() as 'soft' | 'mixed' | 'hard' }));
    if (id === 'c-wt') {
      const rid = 'p' + Date.now();
      gitDialog('Worktree', `<input data-pick="${rid}" id="wp" /><button type="button" id="pk">Browse</button>`, () => act({ kind: 'worktreeAdd', hash: c.hash, path: (document.getElementById('wp') as HTMLInputElement).value }));
      document.getElementById('pk')?.addEventListener('click', () => post({ type: 'pickFolder', requestId: rid }));
    }
    if (id === 'c-rw') gitDialog('Reword', `<textarea id="msg">${esc(c.subject)}</textarea>`, () => act({ kind: 'reword', hash: c.hash, message: (document.getElementById('msg') as HTMLTextAreaElement).value }));
  }
  if (ctxFile && details) {
    if (id === 'f-diff') postDiff(ctxFile);
    if (id === 'f-open') post({ type: 'openWorkFile', path: ctxFile.path });
    if (id === 'f-blob') post({ type: 'showBlob', hash: details.hash === '*' ? 'HEAD' : details.hash, path: ctxFile.path });
    if (id === 'f-copy') {
      post({ type: 'copy', text: ctxFile.path });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
  }
}

function checks(d: GraphSnapshot['config']['dialogs']): string {
  return `<label><input type="checkbox" id="nc" ${d.mergeNoCommit ? 'checked' : ''}/> no commit</label>
    <label><input type="checkbox" id="nff" ${d.mergeNoFastForward ? 'checked' : ''}/> no ff</label>
    <label><input type="checkbox" id="sq" ${d.mergeSquash ? 'checked' : ''}/> squash</label>`;
}

function val(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement).checked;
}

function openPr(branch: string): void {
  if (!snap) return;
  const p = snap.repoSettings.pullRequest?.provider ?? 'GitHub';
  const custom = snap.customPrProviders.find((x) => x.name === p);
  const tpl =
    custom?.templateUrl ??
    (p === 'GitLab'
      ? 'https://gitlab.com/$1/-/merge_requests/new?merge_request[source_branch]=$2'
      : p === 'Bitbucket'
        ? 'https://bitbucket.org/$1/pull-requests/new?source=$2'
        : 'https://github.com/$1/compare/$2');
  const origin = snap.remotes[0]?.fetchUrl ?? '';
  const repo = origin.replace(/^.*[:/]([^/]+\/[^/.]+)(?:\.git)?$/, '$1');
  post({ type: 'openUrl', url: fillPrUrl(tpl, { repo, source: branch, dest: snap.currentBranch ?? 'main' }) });
}

void sub;
try {
  bind();
  sendReady();
} catch (err) {
  const el = document.getElementById('fail');
  if (el) {
    el.hidden = false;
    el.textContent = err instanceof Error ? err.message : String(err);
  }
}
