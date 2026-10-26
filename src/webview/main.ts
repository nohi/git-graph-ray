import { firstCommitIndexForDate, formatDate, localDayBounds } from '../shared/date';
import { applyEmoji, fillPrUrl, formatCommitMessageHtml } from '../shared/issueLinks';
import { ancestorHashes, branchHistoryHashes, colourForLane, DETAILS_MAX, DETAILS_MIN, edgeCurveAt, edgePath, estimateDetailsHeight, gitAtLeast, graphWidth, laneX, rayStreamGradient, RAY_STREAM_PERIOD, ROW, rowTop, rowY, scrollNeededToRevealDetails, shortcutMatches, visibleRowRange } from '../shared/graph';
import {
  commitHidden,
  copyDateFilter,
  dateBuckets,
  emptyDateFilter,
  filterBuckets,
  hideAllMonths,
  hideMonth,
  hideYear,
  revealCommitMonths,
  showAllMonths,
  visibleCommitIndices,
  yearCheck,
  type DateField,
  type DateFilter,
} from '../shared/dateFilter';
import {
  copyPersonFilter,
  emptyPersonFilter,
  filterPeople,
  hideAllPeople,
  hidePerson,
  personBuckets,
  personHidden,
  personKey,
  personLabel,
  revealCommitPeople,
  showAllPeople,
  type PersonField,
  type PersonFilter,
} from '../shared/personFilter';
import { foldBridgeEdges, historyEdgeHot, historyLanes, lanePriorityToSetting, layoutCommits, removeLanePriority, upsertLanePriority, type Edge, type Layout } from '../shared/layout';
import { edgeTouchesRange, renderEdges, renderNodes, type DrawnEdge, type DrawnNode } from '../shared/graphPaint';
import { buildFileTree, FOLDER_MENU, folderFoldPlan, wantsNestedFolderToggle, type FolderFoldPlan } from '../shared/fileTree';
import { decideNamedRemoteCheckout, startCheckoutFromRef } from '../shared/checkout';
import { applySpaceSubstitution, defaultRepoSettings, type RepoSettings } from '../shared/dialogs';
import { mergeDialogHtml, rebaseDialogHtml } from '../shared/branchDialog';
import { deleteBranchConfirm, deleteBranchDialogHtml, type BranchMergeState } from '../shared/deleteBranch';
import { addTagDialogHtml, parsePushMode, pushBranchDialogHtml, pushTagDialogHtml, tagOnRemoteIcon, tagRemoteLoadingIcon } from '../shared/pushDialog';
import { remoteTagErrorText, tagOnRemote, type RemoteTagError, type RemoteTagTip } from '../shared/remoteTags';
import {
  defaultWorktreeLocation,
  suggestedWorktreeFolder,
  worktreeDialogHtml,
  worktreeFormState,
} from '../shared/worktreeDialog';
import { detailsMetaRows, commitMessageText, type DetailsMetaRow, type MetaCopyIcon } from '../shared/detailsMeta';
import { DETAILS_FILES_MIN, DETAILS_META_DEFAULT, draggedDetailsMeta, fittedDetailsMeta } from '../shared/detailsPane';
import { signatureColumn, signatureInfoRows, signatureSummary, type SignatureInfoRow } from '../shared/signature';
import {
  DEFAULT_LABEL_COLOUR,
  hexToHsv,
  hsvToHex,
  labelColourDialogHtml,
  normalizeHex,
  refColoursToSetting,
  refLabelColour,
  removeRefColour,
  upsertRefColour,
  type Hsv,
} from '../shared/refColours';
import { filterRefsForTab, sortFilterRefs, windowRefs, refDisplayName, refJumpHash, refLogArg, groupChipRefs, remoteChipText, remoteLabelsUseIcons, remoteShortName, REMOTE_LABEL_FOLD, type FilterTab } from '../shared/refsList';
import { compileFindRegex, formatFindCount, highlightFind } from '../shared/commitFind';
import { formatRefChange, presentPreview } from '../shared/undo';
import { branchMenuEntries, commitMenuEntries, menuHtml, remoteMenuEntries, tagMenuEntries } from '../shared/commitMenu';
import { cherryPickPlan, displayedRange, patchFileName, toggleCommitSelection } from '../shared/historyActions';
import { comparePick, type CompareCandidate } from '../shared/comparePick';
import { rebaseRevision } from '../shared/gitArgs';
import {
  parseRebaseCheckout,
  parseRebaseOnFailure,
  rebaseBranchesDialogHtml,
  rebaseTargetBranches,
} from '../shared/rebaseBranches';
import { UNCOMMITTED, type ColumnVisibility, type CommitDetails, type GraphCommit, type GraphRef } from '../shared/types';
import type { GitAction, GraphSnapshot, HostToView, ViewToHost } from '../shared/protocol';
import {
  REFS_POPOVER_DEFAULT_WIDTH,
  REFS_POPOVER_MIN_HEIGHT,
  REFS_POPOVER_MIN_WIDTH,
  anchoredPopoverPlacement,
  cursorDialogPlacement,
  fitPopoverSpan,
  isPopoverEdge,
  resizePopoverRect,
  type AnchoredPopoverAlign,
  type PopoverEdge,
  type PopoverRect,
} from '../shared/popover';
import { rayCatAddTag, rayCatBurnBranch, rayCatCherryPick, rayCatCreateBranch, rayCatDeleteTag, rayCatPull, rayCatPushBranch, rayCatRenameBranch, syncRayCats } from './rayCat';
import { startContributorsPage } from './contributors';
import './styles.css';

type AnchoredPopoverOpts = { align?: AnchoredPopoverAlign; maxWidth?: number };

const vscode = acquireVsCodeApi();
const post = (m: ViewToHost) => vscode.postMessage(m);

type WebviewState = {
  repo?: string;
  signatureOpen?: boolean;
  columns?: Record<string, number>;
  dateAuthor?: string[];
  dateCommitter?: string[];
  authorNames?: string[];
  committerNames?: string[];
  selected?: string;
  refsPopoverWidth?: number;
  refsPopoverHeight?: number;
};

function webviewState(): WebviewState {
  const raw = vscode.getState();
  if (!raw || typeof raw !== 'object') return {};
  return raw as WebviewState;
}

let signatureOpen = webviewState().signatureOpen === true;
let columnWidths: Record<string, number> = { ...(webviewState().columns ?? {}) };
const REFS_POPOVER_MAX_SPAN = 4000;

function storedRefsPopoverWidth(): number {
  const width = webviewState().refsPopoverWidth;
  if (typeof width !== 'number' || !Number.isFinite(width)) return REFS_POPOVER_DEFAULT_WIDTH;
  return Math.min(REFS_POPOVER_MAX_SPAN, Math.max(REFS_POPOVER_MIN_WIDTH, width));
}

function storedRefsPopoverHeight(): number | null {
  const height = webviewState().refsPopoverHeight;
  if (typeof height !== 'number' || !Number.isFinite(height)) return null;
  return Math.min(REFS_POPOVER_MAX_SPAN, Math.max(REFS_POPOVER_MIN_HEIGHT, height));
}

let refsPopoverWidth = storedRefsPopoverWidth();
let refsPopoverHeight: number | null = storedRefsPopoverHeight();
let refsPopoverCustomPlace = false;
let refsPopoverDragging = false;
let viewRestored = false;
let restoring = false;
let restoredScroll: string | null = null;

let snap: GraphSnapshot | null = null;
let selected: string | null = null;
let compare: string | undefined;
/** Commit row that should host the inline diff. Set when compare starts from a context menu. */
let compareAnchor: string | undefined;
let details: CommitDetails | null = null;
let detailsH: number | null = null;
let autoDetailsH = 180;
let fitGen = 0;
let userG: number | null = null;
let dialogOk: (() => void) | null = null;
let deleteBranchReq = '';
let deleteBranchSeq = 0;
let deleteBranchMerge: BranchMergeState = 'unknown';
let remoteTagReq = '';
let remoteTagSeq = 0;
let remoteTagLoading = false;
let remoteTagCommits = new Map<string, string>();
/** `name` is null while Add tag reads the name field. */
let tagMark: { commit: string; name: string | null } | null = null;
let confirmOk: (() => void) | null = null;
let compareBase: string | null = null;
let compareActive = 0;
let compareRows: CompareCandidate[] = [];
let faces = new Map<string, string>();
let findHits: string[] = [];
let findIndexes: number[] = [];
let findI = 0;
let findTruncated = false;
let findSeq = 0;
let findRequest = '';
let findDiffTimer: ReturnType<typeof setTimeout> | null = null;
let findPendingDir = 0;
let findPendingHash: string | null = null;
let detailsStamp = 0;
const rowByHash = new Map<string, HTMLDivElement>();
let graphCommits: GraphCommit[] | null = null;
let graphKey = '';
let graphStart = -1;
let graphEnd = -1;
let rowsDirty = true;
let viewportRows: number[] | null = null;
let viewportStart = -1;
let viewportEnd = -1;
let viewportGapAfter = -2;
let viewportGapH = -1;
let viewportChrome = '';
let viewportFrame = 0;
let shownCache: { commits: GraphCommit[]; key: string; rows: number[] } | null = null;
let displayCache: { rows: readonly number[]; map: Map<number, number> } | null = null;
let ancestorCache: { commits: readonly GraphCommit[]; head: string | null; set: Set<string> } | null = null;
let historyCache: { commits: readonly GraphCommit[]; key: string; set: Set<string> | null; lanes: boolean[][] | null } | null = null;
let detailsKey = '';
let filterDraft: {
  showAll: boolean;
  showRemotes: boolean;
  showSameCommitBranches: boolean;
  tab: FilterTab;
  picked: Set<string>;
  shown: number;
} | null = null;
let stashI = 0;
let ctxRef: GraphRef | null = null;
/** Local branch names chosen with Ctrl/Cmd+click, in click order. */
let pickedBranches: string[] = [];
/** Expanded remote bundles, keyed by commit hash and branch name. */
const expandedRemoteLabels = new Set<string>();
/** When a folded remote row was last expanded, so the opening double-click does not also check out. */
let remoteLabelsExpandedAt = 0;
/** Commit hashes chosen for cherry-pick: a Shift+click span, or Ctrl/Cmd+click toggles. */
let commitRange: string[] = [];
/** Commit the next Shift+click measures from. */
let rangeAnchor: string | null = null;
/** File paths chosen with Ctrl/Cmd+click in the open commit details. */
let pickedFiles: string[] = [];
let ctxFiles: { path: string; untracked: boolean }[] = [];
let pickSeq = 0;
const pickWaiters = new Map<string, (result: { path: string | null; patchKind?: 'am' | 'apply' }) => void>();
let ctxCommit: GraphCommit | null = null;
let ctxFile: { path: string; oldPath?: string } | null = null;
let ctxFolder: HTMLDetailsElement | null = null;
let summaryPointer: { folder: HTMLDetailsElement; open: boolean } | null = null;
let pendingDateJump: { day: string; field: 'author' | 'committer' } | null = null;
let pendingRefJump: string | null = null;
let dateFilter: DateFilter = emptyDateFilter();
let personFilter: PersonFilter = emptyPersonFilter();
let undoPending: 'undo' | 'redo' | null = null;
let undoPreviewMsg: Extract<HostToView, { type: 'undoPreview' }> | null = null;
let undoSideBySide = false;
let undoShowUnrelated = false;
let undoShowHead = false;
let undoSteps = 1;
let undoButtons = {
  canUndo: false,
  canRedo: false,
  undoLabel: null as string | null,
  redoLabel: null as string | null,
  undoLabels: [] as string[],
  redoLabels: [] as string[],
};
let dateDraft: DateFilter | null = null;
let dateTab: DateField = 'author';
let personDraft: PersonFilter | null = null;
let personTab: PersonField = 'author';
let lastPointer = { x: 24, y: 24 };

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
  if (document.body.dataset.page === 'contributors') return;
  const m = ev.data;
  if (m.type === 'snapshot') {
    setGitBusy(false);
    if (snap && m.payload.repoPath !== snap.repoPath) {
      dateFilter = emptyDateFilter();
      dateDraft = null;
      personFilter = emptyPersonFilter();
      personDraft = null;
      commitRange = [];
      rangeAnchor = null;
      pickedFiles = [];
    }
    pendingDateJump = null;
    pendingRefJump = null;
    hideRefJumpMiss();
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
    fillDates();
    fillPeople();
    continueDateJump();
    continueFindJump();
    continueRefJump();
  } else if (m.type === 'info') {
    if (!acceptDetails(m.payload)) return;
    if (m.payload?.hash !== details?.hash) pickedFiles = [];
    details = m.payload;
    detailsStamp++;
    if (!details) {
      clearCompare();
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
    if (m.quiet) {
      if (m.on) $('btn-fetch').classList.add('spinning');
      else if (!document.documentElement.classList.contains('git-busy')) $('btn-fetch').classList.remove('spinning');
      return;
    }
    setGitBusy(m.on, m.fetch);
  } else if (m.type === 'notice') {
    /* action kinds used to show here; Fetch already has its own button */
  } else if (m.type === 'rebaseReport') {
    gitDialog('Rebase', m.html, () => {});
  } else if (m.type === 'face') {
    faces.set(m.email, m.dataUri);
    paint();
  } else if (m.type === 'facesReset') {
    faces.clear();
    paint();
  } else if (m.type === 'findHits') {
    if (m.requestId !== findRequest) return;
    findHits = m.hashes;
    findIndexes = m.indexes;
    findTruncated = m.truncated;
    const err = $('find-err');
    err.hidden = !m.error;
    err.textContent = m.error ?? '';
    const dir = findPendingDir;
    findPendingDir = 0;
    showFindPosition(dir);
  } else if (m.type === 'jump') {
    selected = m.selected;
    compare = m.compare;
    compareAnchor = undefined;
    scrollToHash(m.selected);
  } else if (m.type === 'branchMerged') {
    if (m.requestId !== deleteBranchReq) return;
    deleteBranchMerge = m.merged === true ? 'merged' : m.merged === false ? 'unmerged' : 'unknown';
    syncDeleteBranchForm();
  } else if (m.type === 'remoteTags') {
    if (m.requestId !== remoteTagReq || !tagMark) return;
    remoteTagLoading = false;
    remoteTagCommits = indexRemoteTags(m.tags);
    paintTagRemoteMarks();
    paintRemoteTagError(m.errors);
  } else if (m.type === 'picked') {
    const waiter = pickWaiters.get(m.requestId);
    if (waiter) {
      pickWaiters.delete(m.requestId);
      waiter({ path: m.path, patchKind: m.patchKind });
      return;
    }
    const input = document.querySelector<HTMLInputElement>(`[data-pick="${m.requestId}"]`);
    if (input) {
      input.value = m.path ?? '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } else if (m.type === 'undoState') {
    undoButtons = {
      canUndo: m.canUndo,
      canRedo: m.canRedo,
      undoLabel: m.undoLabel,
      redoLabel: m.redoLabel,
      undoLabels: m.undoLabels,
      redoLabels: m.redoLabels,
    };
    paintUndoButtons();
    closeHistoryMenus();
  } else if (m.type === 'undoPreview') {
    showUndoPreview(m);
  }
});

function persistView(): void {
  if (restoring) return;
  vscode.setState({
    repo: snap?.repoPath,
    signatureOpen,
    columns: { ...columnWidths },
    dateAuthor: [...dateFilter.author],
    dateCommitter: [...dateFilter.committer],
    authorNames: [...personFilter.author],
    committerNames: [...personFilter.committer],
    selected: selected ?? undefined,
    refsPopoverWidth,
    ...(refsPopoverHeight != null ? { refsPopoverHeight } : {}),
  });
}

function restoreView(): void {
  if (!snap) return;
  const state = webviewState();
  if (state.repo !== snap.repoPath) return;
  for (const [key, width] of Object.entries(state.columns ?? {})) {
    if (typeof width === 'number' && Number.isFinite(width)) setColWidth(key, width);
  }
  if (state.dateAuthor || state.dateCommitter) {
    dateFilter = { author: new Set(state.dateAuthor ?? []), committer: new Set(state.dateCommitter ?? []) };
  }
  if (state.authorNames || state.committerNames) {
    personFilter = { author: new Set(state.authorNames ?? []), committer: new Set(state.committerNames ?? []) };
  }
  if (state.selected && snap.commits.some((commit) => commit.hash === state.selected)) {
    selected = state.selected;
    restoredScroll = state.selected;
  }
}

function syncBanners(): void {
  if (!snap) return;
  const op = snap.operation;
  $('conflict').hidden = !op;
  if (op) {
    const label = op.kind === 'am' ? 'patch apply' : op.kind;
    $('conflict-msg').textContent = op.files.length ? `${label} in progress` : `${label} in progress — no unmerged files`;
    $('conflict-files').innerHTML = op.files
      .map((file) => `<button type="button" class="conflict-file" data-conflict="${esc(file)}">${esc(file)}</button>`)
      .join('');
  }
  $('path-filter').hidden = !snap.historyPath;
  if (snap.historyPath) $('path-filter-msg').textContent = `History of ${snap.historyPath}`;
}

function applySnap(): void {
  if (!snap) return;
  const commitLive = new Set(snap.commits.map((commit) => commit.hash));
  if (commitRange.some((hash) => !commitLive.has(hash))) commitRange = commitRange.filter((hash) => commitLive.has(hash));
  if (rangeAnchor && !commitLive.has(rangeAnchor)) rangeAnchor = null;
  const live = new Set(snap.branches);
  if (pickedBranches.some((name) => !live.has(name))) pickedBranches = pickedBranches.filter((name) => live.has(name));
  if (!viewRestored) {
    restoring = true;
    restoreView();
    restoring = false;
    viewRestored = true;
  }
  document.body.dataset.theme = snap.config.theme;
  document.body.classList.toggle('hide-Author', !snap.config.columnVisibility.Author);
  document.body.classList.toggle('hide-AuthorDate', !snap.config.columnVisibility.AuthorDate);
  document.body.classList.toggle('hide-Commit', !snap.config.columnVisibility.Commit);
  document.body.classList.toggle('hide-Committer', !snap.config.columnVisibility.Committer);
  document.body.classList.toggle('hide-CommitterDate', !snap.config.columnVisibility.CommitterDate);
  document.body.classList.toggle('hide-Signature', !snap.config.columnVisibility.Signature);
  $('s-theme').value = snap.config.theme;
  $('s-raycat').checked = snap.config.rayCatEnabled;
  $('s-raycat-count').value = String(snap.config.rayCatCount);
  $('s-raycat-count').disabled = !snap.config.rayCatEnabled;
  syncRayCats($('ray-cats'), snap.config.rayCatEnabled, snap.config.rayCatCount);
  fillRepos();
  if (!$('pop-refs').matches(':popover-open')) filterDraft = null;
  fillRefs();
  fillDates();
  fillPeople();
  $('btn-fetch').hidden = snap.remotes.length === 0;
  $('s-remotes').checked = snap.repoSettings.showRemotes ?? snap.config.showRemoteBranches;
  $('s-stashes').checked = snap.repoSettings.showStashes ?? snap.config.showStashes;
  $('s-tags').checked = snap.repoSettings.showTags ?? snap.config.showTags;
  $('s-worktrees').checked = snap.repoSettings.showWorktrees ?? snap.config.showWorktrees;
  $('s-reflogs').checked = snap.repoSettings.showReflogs ?? snap.config.includeCommitsMentionedByReflogs;
  $('s-first').checked = snap.repoSettings.firstParent ?? snap.config.onlyFollowFirstParent;
  $('s-prune').checked = snap.config.fetchAndPrune;
  $('s-prune-tags').checked = snap.config.fetchAndPruneTags;
  $('s-auto-fetch').checked = snap.config.autoFetch;
  $('s-auto-fetch-interval').value = String(snap.config.autoFetchInterval);
  $('s-auto-fetch-interval').disabled = !snap.config.autoFetch;
  $('s-undo-preview').checked = snap.config.undoPreview;
  fillRemotes();
  fillLanePriority();
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
  syncBanners();
  fillHelp();
  paint();
  if ($('find-q').value) scheduleFind(0);
  if (restoredScroll) {
    const hash = restoredScroll;
    restoredScroll = null;
    scrollToHash(hash);
  }
  persistView();
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

function sameCommitBranchesShown(): boolean {
  return snap?.repoSettings.showSameCommitBranches !== false;
}

function startFilterDraft(): void {
  if (!snap) return;
  filterDraft = {
    showAll: snap.selectedBranches === 'all',
    showRemotes: snap.config.showRemoteBranches,
    showSameCommitBranches: sameCommitBranchesShown(),
    tab: 'branch',
    picked: new Set(snap.selectedBranches === 'all' ? [] : snap.selectedBranches),
    shown: snap.config.refsListLimit,
  };
}

function applyFilter(): void {
  if (!filterDraft) return;
  const branches = filterDraft.showAll ? 'all' : [...filterDraft.picked];
  post({
    type: 'setFilter',
    branches,
    showRemotes: filterDraft.showRemotes,
    showSameCommitBranches: filterDraft.showSameCommitBranches,
  });
}

function fillRefs(): void {
  if (!snap) return;
  if ($('pop-refs').matches(':popover-open') && !filterDraft) startFilterDraft();
  const draft = filterDraft ?? {
    showAll: snap.selectedBranches === 'all',
    showRemotes: snap.config.showRemoteBranches,
    showSameCommitBranches: sameCommitBranchesShown(),
    tab: 'branch' as FilterTab,
    picked: new Set(snap.selectedBranches === 'all' ? [] : snap.selectedBranches),
    shown: snap.config.refsListLimit,
  };
  $('show-all').checked = draft.showAll;
  $('show-remotes').checked = draft.showRemotes;
  $('show-same-commit').checked = draft.showSameCommitBranches;
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
  const catalog = filterCatalog();
  const loaded = new Set(snap.commits.map((commit) => commit.hash));
  list.innerHTML = visible
    .map((r) => {
      const rev = refLogArg(r);
      const detached = r.kind === 'head' && r.name === 'HEAD';
      const kindTitle = r.kind === 'head' ? 'Branch' : r.kind === 'remote' ? 'Remote' : r.kind === 'tag' ? 'Tag' : r.kind === 'worktree' ? 'Worktree' : r.kind;
      const paint = refRowColourAttrs(r);
      const label = refDisplayName(r);
      return `<div class="ref-line">${refJumpButton(r, refJumpHash(r, catalog, loaded))}<label class="ref-item kind-${r.kind}${detached ? ' detached' : ''}"><input type="checkbox" data-ref="${esc(rev)}" ${draft.picked.has(rev) ? 'checked' : ''}/><span class="ref-mark" title="${esc(kindTitle)}"${paint.mark}></span><span class="ref-name" title="${esc(label)}"${paint.name}>${esc(label)}</span></label></div>`;
    })
    .join('');
  list.scrollTop = top;
}

const REF_JUMP_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="2.35" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="0.9" fill="currentColor"/><path d="M8 1.4v2.15M8 12.45v2.15M1.4 8h2.15M12.45 8h2.15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

function refJumpButton(r: GraphRef, hash: string | null): string {
  if (!hash) {
    return `<button type="button" class="ref-jump" disabled title="A pattern does not point at one commit" aria-label="Cannot jump to a pattern">${REF_JUMP_ICON}</button>`;
  }
  const label = r.name === 'HEAD' ? 'Jump to HEAD' : `Jump to ${refDisplayName(r)}`;
  return `<button type="button" class="ref-jump" data-jump="${esc(hash)}" title="${esc(label)}" aria-label="${esc(label)}">${REF_JUMP_ICON}</button>`;
}

function hideRefJumpMiss(): void {
  const miss = $('ref-jump-miss');
  miss.hidden = true;
  miss.textContent = '';
  miss.classList.remove('is-error');
}

function showRefJumpMiss(message: string, error: boolean): void {
  const miss = $('ref-jump-miss');
  miss.hidden = false;
  miss.textContent = message;
  miss.classList.toggle('is-error', error);
}

function jumpToRef(hash: string): void {
  if (!snap || !hash) return;
  if (snap.commits.some((commit) => commit.hash === hash)) {
    pendingRefJump = null;
    hideRefJumpMiss();
    scrollToHash(hash);
    return;
  }
  if (!snap.hasMore) {
    pendingRefJump = null;
    showRefJumpMiss('That commit is not in the loaded graph.', true);
    return;
  }
  if (pendingRefJump === hash) return;
  pendingRefJump = hash;
  showRefJumpMiss('Loading history…', false);
  post({ type: 'loadUntil', hash, index: -1 });
}

function continueRefJump(): void {
  if (!pendingRefJump || !snap) return;
  if (snap.commits.some((commit) => commit.hash === pendingRefJump)) {
    const hash = pendingRefJump;
    pendingRefJump = null;
    hideRefJumpMiss();
    scrollToHash(hash);
    return;
  }
  if (!snap.hasMore) {
    pendingRefJump = null;
    showRefJumpMiss('That commit is not in the loaded graph.', true);
  }
}

function fillDates(): void {
  if (!snap) return;
  const draft = dateDraft ?? dateFilter;
  const hidden = draft[dateTab];
  const buckets = filterBuckets(dateBuckets(snap.commits, dateTab), $('date-q').value);
  $('date-show-all').checked = hidden.size === 0;
  $('date-tab-author').setAttribute('aria-selected', String(dateTab === 'author'));
  $('date-tab-committer').setAttribute('aria-selected', String(dateTab === 'committer'));
  const list = $('date-list');
  const top = list.scrollTop;
  list.innerHTML = buckets
    .map((year) => {
      const state = yearCheck(year, draft, dateTab);
      const months = year.months
        .map((month) => {
          const checked = !hidden.has(month.key);
          return `<label class="ref-item date-item"><input type="checkbox" data-month="${esc(month.key)}" ${checked ? 'checked' : ''}/><span class="ref-name">${String(month.month).padStart(2, '0')}</span><span class="date-count">${month.count.toLocaleString('en-US')}</span></label>`;
        })
        .join('');
      return `<div class="date-year"><label class="ref-item date-item"><input type="checkbox" data-year="${year.year}" ${state === 'checked' ? 'checked' : ''}/><span class="ref-name">${year.year}</span><span class="date-count">${year.count.toLocaleString('en-US')}</span></label><div class="date-months">${months}</div></div>`;
    })
    .join('');
  for (const box of list.querySelectorAll<HTMLInputElement>('[data-year]')) {
    const year = buckets.find((item) => String(item.year) === box.dataset.year);
    box.indeterminate = !!year && yearCheck(year, draft, dateTab) === 'mixed';
  }
  list.scrollTop = top;
}

function applyDateFilter(): void {
  if (dateDraft) dateFilter = copyDateFilter(dateDraft);
  $('pop-dates').hidePopover?.();
  paint();
  persistView();
}

function fillPeople(): void {
  if (!snap) return;
  const draft = personDraft ?? personFilter;
  const hidden = draft[personTab];
  const buckets = filterPeople(personBuckets(snap.commits, personTab), $('person-q').value);
  $('person-show-all').checked = hidden.size === 0;
  $('person-tab-author').setAttribute('aria-selected', String(personTab === 'author'));
  $('person-tab-committer').setAttribute('aria-selected', String(personTab === 'committer'));
  const list = $('person-list');
  const top = list.scrollTop;
  list.innerHTML = buckets
    .map((person) => {
      const checked = !hidden.has(person.key);
      return `<label class="ref-item date-item"><input type="checkbox" data-name="${esc(person.name)}" data-email="${esc(person.email)}" ${checked ? 'checked' : ''}/><span class="ref-name">${esc(personLabel(person.name, person.email))}</span><span class="date-count">${person.count.toLocaleString('en-US')}</span></label>`;
    })
    .join('');
  list.scrollTop = top;
}

function applyPersonFilter(): void {
  if (personDraft) personFilter = copyPersonFilter(personDraft);
  $('pop-contributor').hidePopover?.();
  paint();
  persistView();
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

function fillLanePriority(): void {
  if (!snap) return;
  $('lane-list').innerHTML = snap.config.lanePriority
    .map(
      (rule, index) =>
        `<div class="remote-row"><span class="remote-name">${esc(rule.pattern)}</span><span class="lane-pri">${esc(String(rule.priority))}</span><button type="button" class="remote-act" data-lane-ed="${index}">Edit</button><button type="button" class="remote-del" data-lane-del="${index}">Delete</button></div>`,
    )
    .join('');
}

function lanePriorityDialog(title: string, pattern: string, priority: string, previous?: string): void {
  gitDialog(
    title,
    `<label class="dlg-field">Pattern <input id="lp-pattern" placeholder="main or release*" value="${esc(pattern)}" /></label><label class="dlg-field">Priority <input id="lp-priority" type="number" step="1" placeholder="50" value="${esc(priority)}" /></label>`,
    () => {
      if (!snap) return;
      const nextPattern = (document.getElementById('lp-pattern') as HTMLInputElement).value;
      const nextPriority = Number((document.getElementById('lp-priority') as HTMLInputElement).value);
      const next = upsertLanePriority(snap.config.lanePriority, nextPattern, nextPriority, previous);
      if (!next) return;
      post({ type: 'setLanePriority', priorities: lanePriorityToSetting(next) });
    },
  );
}

function fillPr(): void {
  if (!snap) return;
  const names = ['GitHub', 'GitLab', 'Bitbucket', ...snap.customPrProviders.map((p) => p.name)];
  $('pr-provider').innerHTML = names.map((n) => `<option>${esc(n)}</option>`).join('');
}

function detailsAnchor(): string | null {
  return compareAnchor ?? compare ?? selected;
}

function clearCompare(): void {
  compare = undefined;
  compareAnchor = undefined;
}

function paintGraphSvg(svg: HTMLElement, markup: string, stream: boolean, height: number): void {
  if (!stream) {
    svg.innerHTML = markup;
    return;
  }
  const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const grad = svg.querySelector('#ray-stream');
  if (!grad) svg.insertAdjacentHTML('afterbegin', rayStreamGradient(height, animate));
  else syncStreamGradient(svg, height);
  for (const n of [...svg.children]) {
    if (n.tagName.toLowerCase() === 'defs') continue;
    n.remove();
  }
  svg.insertAdjacentHTML('beforeend', markup);
}

function syncStreamGradient(svg: HTMLElement, height: number): void {
  const grad = svg.querySelector('#ray-stream');
  if (!grad) return;
  const h = Math.max(Math.round(height), 1);
  grad.setAttribute('y1', String(h));
  grad.setAttribute('y2', String(h - RAY_STREAM_PERIOD));
}

function detailsHeightCap(): number {
  return snap?.config.detailsMaxHeight ?? DETAILS_MAX;
}

function estimateFromDetails(d: CommitDetails): number {
  const dates = snap
    ? { author: formatDate(d.authorDate, snap.config.dateFormat), committer: formatDate(d.committerDate, snap.config.dateFormat) }
    : { author: '', committer: '' };
  const sigRows = signatureOpen ? signatureRows(d.signature).length + 1 : 1;
  return estimateDetailsHeight({
    message: commitMessageText(d),
    fileCount: d.files.length,
    metaRowCount: detailsMetaRows(d, dates).length + sigRows,
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
  const idx = displayIndexForHash(anchor);
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

function shownCommits(): number[] {
  if (!snap) return [];
  const key = dateFilterKey();
  if (shownCache?.commits === snap.commits && shownCache.key === key) return shownCache.rows;
  const commits = snap.commits;
  const rows = visibleCommitIndices(commits, dateFilter).filter((index) => !personHidden(commits[index]!, personFilter));
  shownCache = { commits, key, rows };
  return rows;
}

let layoutCache: { commits: GraphCommit[]; priority: string; layout: Layout; byFrom: Edge[][] } | null = null;

function fullLayout(): Layout {
  return layoutState().layout;
}

function lanePriorityMark(): string {
  return snap?.config.lanePriority.map((rule) => `${rule.pattern}\0${rule.priority}`).join('\n') ?? '';
}

function layoutState(): { layout: Layout; byFrom: Edge[][] } {
  if (!snap) return { layout: { vertices: [], edges: [], maxLanes: 1 }, byFrom: [] };
  const priority = lanePriorityMark();
  if (layoutCache?.commits === snap.commits && layoutCache.priority === priority) return layoutCache;
  const layout = layoutCommits(snap.commits, snap.config.lanePriority);
  const byFrom: Edge[][] = [];
  for (const edge of layout.edges) (byFrom[edge.fromRow] ??= []).push(edge);
  layoutCache = { commits: snap.commits, priority, layout, byFrom };
  return layoutCache;
}

function displayIndex(rows: readonly number[]): Map<number, number> {
  if (displayCache?.rows === rows) return displayCache.map;
  const map = new Map<number, number>();
  for (let i = 0; i < rows.length; i++) map.set(rows[i]!, i);
  displayCache = { rows, map };
  return map;
}

function displayIndexForCommit(commitIndex: number): number {
  if (commitIndex < 0) return -1;
  return shownCommits().indexOf(commitIndex);
}

function displayIndexForHash(hash: string): number {
  if (!snap) return -1;
  return displayIndexForCommit(snap.commits.findIndex((commit) => commit.hash === hash));
}

function detailsGap(rows: number[]): { after: number; height: number } | null {
  if (!snap || !details || snap.config.detailsLocation !== 'Inline') return null;
  const anchor = detailsAnchor();
  if (!anchor) return null;
  const commitIndex = snap.commits.findIndex((commit) => commit.hash === anchor);
  const after = rows.indexOf(commitIndex);
  if (after < 0) return null;
  return { after, height: currentDetailsHeight() };
}

function dateFilterKey(): string {
  const pack = (values: ReadonlySet<string>) => JSON.stringify([...values].sort());
  return `${[...dateFilter.author].sort().join(',')}|${[...dateFilter.committer].sort().join(',')}|${pack(personFilter.author)}|${pack(personFilter.committer)}`;
}

function paint(): void {
  if (!snap) return;
  rowsDirty = true;
  const rows = shownCommits();
  const gap = detailsGap(rows);
  const height = rows.length * ROW + (gap ? gap.height : 0);
  const range = viewRange(rows, gap);
  $('spacer').style.height = `${height}px`;
  paintGraph(rows, gap, height, range);
  paintRows(rows, gap, height, range);
  renderDetails();
  syncHeaderScroll();
  syncGraphClip();
}

function paintViewport(): void {
  if (!snap) return;
  const rows = shownCommits();
  const gap = detailsGap(rows);
  const height = rows.length * ROW + (gap ? gap.height : 0);
  const range = viewRange(rows, gap);
  if (viewportStale(rows, gap, range)) paintRows(rows, gap, height, range);
  paintGraph(rows, gap, height, range);
  syncHeaderScroll();
}

function scheduleViewportPaint(): void {
  if (viewportFrame) return;
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = 0;
    paintViewport();
    if (pendingDateJump || findPendingHash || pendingRefJump) return;
    if (snap?.hasMore && snap.config.loadMoreAutomatically) {
      const s = $('scroll');
      if (s.scrollTop + s.clientHeight > s.scrollHeight - 80) post({ type: 'more' });
    }
  });
}

function viewRange(rows: readonly number[], gap: { after: number; height: number } | null): { start: number; end: number } {
  const scroll = $('scroll');
  return visibleRowRange({
    scrollTop: scroll.scrollTop,
    viewHeight: scroll.clientHeight,
    rowCount: rows.length,
    gap,
  });
}

function viewportStale(
  rows: number[],
  gap: { after: number; height: number } | null,
  range: { start: number; end: number },
): boolean {
  return (
    rowsDirty ||
    viewportRows !== rows ||
    viewportStart !== range.start ||
    viewportEnd !== range.end ||
    viewportGapAfter !== (gap?.after ?? -1) ||
    viewportGapH !== (gap?.height ?? 0) ||
    viewportChrome !== rowChrome()
  );
}

function rowChrome(): string {
  return `${selected ?? ''}\0${compare ?? ''}\0${commitRange.join('\0')}\0${pickedBranches.join('\0')}`;
}

function paintGraph(
  rows: number[],
  gap: { after: number; height: number } | null,
  height: number,
  range: { start: number; end: number },
): void {
  if (!snap) return;
  const key = [
    rows.length,
    rows[0] ?? '',
    rows[rows.length - 1] ?? '',
    dateFilterKey(),
    gap?.after ?? '',
    gap?.height ?? '',
    snap.config.theme,
    snap.config.graphStyle,
    snap.config.graphColours.join(','),
    snap.config.uncommittedChanges,
    snap.head ?? '',
    snap.currentBranch ?? '',
    snap.hasMore ? '1' : '0',
    pickedBranches.join('\0'),
  ].join('|');
  if (graphCommits === snap.commits && key === graphKey && graphStart === range.start && graphEnd === range.end) return;
  const svg = $('svg');
  const { layout, byFrom } = layoutState();
  const displayOf = displayIndex(rows);
  const lanes = pickedLaneMask();
  const history = pickedHistory();
  const style = snap.config.graphStyle;
  const edges: DrawnEdge[] = [];
  const pushEdge = (
    fromDisplay: number,
    toDisplay: number,
    fromLane: number,
    toLane: number,
    lane: number,
    committed: boolean,
    fromCommitIndex: number,
  ): void => {
    if (!edgeTouchesRange(fromDisplay, toDisplay, range.start, range.end)) return;
    const from = snap!.commits[fromCommitIndex];
    const fromVertex = layout.vertices[fromCommitIndex];
    const fromIsMerge = !!from && from.parents.length > 1 && fromVertex?.lane === fromLane;
    const toCommit = rows[toDisplay];
    const joinsNode = toCommit != null && layout.vertices[toCommit]?.lane === toLane;
    const hot = historyEdgeHot(lanes, fromCommitIndex, fromLane);
    const drawn: DrawnEdge = {
      fromDisplay,
      toDisplay,
      fromLane,
      toLane,
      curveAt: edgeCurveAt(joinsNode, fromIsMerge),
      stroke: {
        colour: colourForLane(lane, snap!.config.graphColours, snap!.config.theme),
        width: hot && lanes ? 2.75 : 2,
        opacity: lanes && !hot ? '0.2' : undefined,
        dashed: !committed,
      },
    };
    edges.push(drawn);
  };
  const fromLo = Math.max(0, range.start - 1);
  const fromHi = Math.min(rows.length, range.end);
  for (let fromDisplay = fromLo; fromDisplay < fromHi; fromDisplay++) {
    const commitIndex = rows[fromDisplay]!;
    for (const edge of byFrom[commitIndex] ?? []) {
      const toDisplay = displayOf.get(edge.toRow);
      if (toDisplay == null) continue;
      pushEdge(fromDisplay, toDisplay, edge.fromLane, edge.toLane, edge.lane, edge.committed, edge.fromRow);
    }
  }
  for (let fromDisplay = fromLo; fromDisplay < Math.min(rows.length - 1, range.end); fromDisplay++) {
    const aboveCommit = rows[fromDisplay]!;
    const belowCommit = rows[fromDisplay + 1]!;
    if (belowCommit <= aboveCommit + 1) continue;
    for (const edge of foldBridgeEdges(layout, aboveCommit, belowCommit)) {
      pushEdge(fromDisplay, fromDisplay + 1, edge.fromLane, edge.toLane, edge.lane, edge.committed, aboveCommit);
    }
  }
  const nodes: DrawnNode[] = [];
  for (let display = range.start; display < range.end && display < rows.length; display++) {
    const commitIndex = rows[display]!;
    const vertex = layout.vertices[commitIndex];
    if (!vertex) continue;
    const commit = snap.commits[commitIndex];
    const colour = colourForLane(vertex.lane, snap.config.graphColours, snap.config.theme);
    const open =
      (commit?.hash === UNCOMMITTED && snap.config.uncommittedChanges.startsWith('Open Circle at the Uncommitted')) ||
      (commit?.hash === snap.head && (snap.config.uncommittedChanges.includes('Checked Out') || !snap.currentBranch));
    const isHead = commit?.hash === snap.head && commit.hash !== UNCOMMITTED;
    const onHistory = !history || (!!commit && history.has(commit.hash));
    const node: DrawnNode = {
      display,
      cx: laneX(vertex.lane),
      colour,
      radius: isHead ? 5.5 : 4,
      open,
      opacity: history && !onHistory ? '0.2' : undefined,
      historyRing: Boolean(history && onHistory),
      headRing: Boolean(isHead),
    };
    nodes.push(node);
  }
  const yAt = (display: number) => rowY(display, gap);
  graphCommits = snap.commits;
  graphKey = key;
  graphStart = range.start;
  graphEnd = range.end;
  if (userG != null) document.documentElement.style.setProperty('--g', `${userG}px`);
  else document.documentElement.style.removeProperty('--g');
  svg.setAttribute('width', String(graphWidth(layout.maxLanes)));
  svg.setAttribute('height', String(height));
  paintGraphSvg(svg, renderEdges(edges, style, yAt) + renderNodes(nodes, yAt), snap.config.theme === 'Ray Stream', height);
}

const NO_HISTORY: { set: Set<string> | null; lanes: boolean[][] | null } = { set: null, lanes: null };

function pickedHistory(): Set<string> | null {
  return historyState().set;
}

function pickedLaneMask(): boolean[][] | null {
  return historyState().lanes;
}

function historyState(): { set: Set<string> | null; lanes: boolean[][] | null } {
  if (!snap || pickedBranches.length === 0) return NO_HISTORY;
  const key = pickedBranches.join('\0');
  if (historyCache?.commits === snap.commits && historyCache.key === key) return historyCache;
  const set = branchHistoryHashes(snap.commits, pickedBranches);
  const lanes = set ? historyLanes(fullLayout(), snap.commits, set) : null;
  historyCache = { commits: snap.commits, key, set, lanes };
  return historyCache;
}

function headAncestors(): Set<string> | null {
  if (!snap?.config.muteNonAncestorsOfHead) return null;
  const head = snap.head;
  if (ancestorCache?.commits === snap.commits && ancestorCache.head === head) return ancestorCache.set;
  const set = ancestorHashes(snap.commits, head);
  ancestorCache = { commits: snap.commits, head, set };
  return set;
}

function rowClass(c: GraphCommit, ancestors: Set<string> | null, history: Set<string> | null): string {
  if (!snap) return 'row';
  const muteMerge = snap.config.muteMergeCommits && c.parents.length > 1;
  const muteRow = Boolean(ancestors && c.hash !== UNCOMMITTED && !ancestors.has(c.hash));
  const onHistory = Boolean(history?.has(c.hash));
  return `row${muteMerge ? ' muted-merge' : ''}${muteRow ? ' muted' : ''}${onHistory ? ' branch-hist' : ''}${commitRange.includes(c.hash) ? ' range' : ''}${c.hash === selected ? ' sel' : ''}${compare && c.hash === selected ? ' cmp-base' : ''}${c.hash === compare ? ' cmp' : ''}${c.hash === snap.head ? ' head-commit' : ''}`;
}

function rowContentMark(c: GraphCommit): string {
  if (!snap) return '';
  const flags = findFlags();
  const divergence = snap.divergence ? `${snap.divergence.ahead}:${snap.divergence.behind}` : '';
  return [
    $('find-q').value,
    flags.ignoreCase ? '1' : '0',
    flags.regex ? '1' : '0',
    faces.has(c.authorEmail) ? '1' : '0',
    snap.config.dateFormat,
    divergence,
    c.subject,
    c.authorName,
    c.committerName,
    String(c.authorDate),
    String(c.committerDate),
    c.signatureKind ?? '',
    snap.config.referenceLabelColours.map((rule) => `${rule.pattern}=${rule.colour}`).join(';'),
    c.refs.map((r) => `${r.kind}:${r.name}:${r.hash}`).join(','),
    c.refs
      .filter((r) => r.kind === 'head' && pickedBranches.includes(r.name))
      .map((r) => r.name)
      .join(','),
    remoteFoldMark(c.hash),
  ].join('\u001f');
}

function rowInnerHtml(c: GraphCommit): string {
  if (!snap) return '';
  const avatar = faces.get(c.authorEmail);
  const desc = `${chips(c)}<span class="subj">${subjectHtml(c.subject)}</span>`;
  return `<div class="cell graph"></div>
      <div class="cell desc">${desc}</div>
      <div class="cell author">${avatar ? `<img src="${avatar}" width="14" height="14" alt="" /> ` : ''}${findMark(c.authorName)}</div>
      <div class="cell adate">${esc(formatDate(c.authorDate, snap.config.dateFormat))}</div>
      <div class="cell commit">${findMark(c.hash.slice(0, 7))}</div>
      <div class="cell committer">${findMark(c.committerName)}</div>
      <div class="cell cdate">${esc(formatDate(c.committerDate, snap.config.dateFormat))}</div>
      ${signatureCellHtml(c)}`;
}

function paintRows(
  rows: number[],
  gap: { after: number; height: number } | null,
  height: number,
  range?: { start: number; end: number },
): void {
  if (!snap) return;
  const { start, end } = range ?? viewRange(rows, gap);
  const ancestors = headAncestors();
  const history = pickedHistory();
  const host = $('rows');
  const keep = new Set<string>();
  for (let i = start; i < end; i++) {
    const c = snap.commits[rows[i]!]!;
    keep.add(c.hash);
    let el = rowByHash.get(c.hash);
    if (!el) {
      el = document.createElement('div');
      rowByHash.set(c.hash, el);
      host.append(el);
    }
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.right = '0';
    el.style.top = `${rowTop(i, gap)}px`;
    const cls = rowClass(c, ancestors, history);
    if (el.className !== cls) el.className = cls;
    const mark = rowContentMark(c);
    if (el.dataset.mark !== mark) {
      el.dataset.hash = c.hash;
      el.dataset.mark = mark;
      el.innerHTML = rowInnerHtml(c);
    }
  }
  for (const [hash, el] of rowByHash) {
    if (!keep.has(hash)) {
      el.remove();
      rowByHash.delete(hash);
    }
  }
  let more = document.getElementById('more');
  if (snap.hasMore) {
    if (!more) {
      more = document.createElement('div');
      more.id = 'more';
      more.className = 'row';
      more.textContent = 'Load more';
      host.append(more);
    }
    more.style.position = 'absolute';
    more.style.top = `${height}px`;
    more.hidden = false;
  } else if (more) {
    more.remove();
  }
  rowsDirty = false;
  viewportRows = rows;
  viewportStart = start;
  viewportEnd = end;
  viewportGapAfter = gap?.after ?? -1;
  viewportGapH = gap?.height ?? 0;
  viewportChrome = rowChrome();
}

function emojiMaps() {
  return snap?.emoji ?? [];
}

function remoteLabelKey(hash: string, branch: string): string {
  return `${hash}\0${branch}`;
}

function remoteFoldMark(hash: string): string {
  const prefix = `${hash}\0`;
  return [...expandedRemoteLabels].filter((key) => key.startsWith(prefix)).sort().join(',');
}

function chips(c: GraphCommit): string {
  if (!snap) return '';
  const align = snap.config.referenceLabelAlignment;
  const groups = groupChipRefs(c.refs, snap.config.combineLocalAndRemote);
  const mk = (r: GraphRef, short = false, iconOnly = false) => {
    const detached = r.kind === 'head' && r.name === 'HEAD';
    const current = r.kind === 'head' && Boolean(snap!.currentBranch) && r.name === snap!.currentBranch;
    const picked = r.kind === 'head' && !detached && pickedBranches.includes(r.name);
    const face = chipFace(r, short, iconOnly);
    const colour = chipColourAttrs(r);
    const divergence =
      current && snap!.divergence
        ? `<span class="divergence">${snap!.divergence.ahead} ahead · ${snap!.divergence.behind} behind</span>`
        : '';
    const tag = iconOnly ? 'button' : 'span';
    const type = iconOnly ? ' type="button"' : '';
    const cls = `chip ${r.kind}${face.extra}${detached ? ' detached' : ''}${current ? ' current' : ''}${picked ? ' picked' : ''}${colour.cls}`;
    return `<${tag}${type} class="${cls}"${colour.style}${face.title} data-kind="${r.kind}" data-name="${esc(r.name)}" data-hash="${esc(r.hash)}" data-remote="${esc(r.remote ?? '')}" data-wt="${esc(r.worktreePath ?? '')}">${face.icon}${iconOnly ? '' : findMark(face.label)}${divergence}</${tag}>`;
  };
  const html = (g: ReturnType<typeof groupChipRefs>[number]) => {
    if (g.kind !== 'bundle') return mk(g.ref);
    const expanded = expandedRemoteLabels.has(remoteLabelKey(c.hash, g.local.name));
    const collapsed = remoteLabelsUseIcons(g.remotes.length, expanded);
    const body = `${mk(g.local)}${g.remotes.map((remote) => mk(remote, true, collapsed)).join('')}`;
    return chipPairHtml(g.local.name, g.remotes.length, body, collapsed, true);
  };
  const left = groups.filter((g) => {
    const k = g.kind === 'bundle' ? g.local.kind : g.ref.kind;
    return k === 'head' || k === 'remote' || k === 'stash' || k === 'worktree';
  });
  if (align.includes('Tags (on the right)')) return `<span class="refs">${left.map(html).join('')}</span>`;
  return `<span class="refs">${groups.map(html).join('')}</span>`;
}

function chipPairHtml(branch: string, remoteCount: number, body: string, collapsed: boolean, interactive: boolean): string {
  const fold = interactive && remoteCount >= REMOTE_LABEL_FOLD;
  const cls = `chip-pair${fold ? ' foldable' : ''}${collapsed ? ' collapsed' : ''}`;
  const expanded = fold ? ` aria-expanded="${collapsed ? 'false' : 'true'}"` : '';
  const foldBtn = fold && !collapsed ? REMOTE_FOLD_BUTTON : '';
  return `<span class="${cls}" data-fold="${esc(branch)}"${expanded}>${body}${foldBtn}</span>`;
}

function detailsContentKey(): string {
  if (!snap || !details) return '';
  return [
    detailsStamp,
    details.hash,
    details.compare ?? '',
    snap.config.detailsLocation,
    snap.config.fileViewType,
    signatureOpen ? '1' : '0',
  ].join('|');
}

function renderDetails(): void {
  const dock = $('dock');
  const inline = $('inline-details');
  document.documentElement.classList.remove('details-open');
  if (!snap) return;
  const key = detailsContentKey();
  const rebuild = key !== detailsKey;
  if (snap.config.detailsLocation === 'Docked to Bottom') {
    inline.hidden = true;
    if (rebuild) inline.innerHTML = '';
    dock.hidden = !details;
    if (!details) {
      if (rebuild) dock.innerHTML = '';
      detailsKey = key;
      return;
    }
    dock.style.height = `${currentDetailsHeight()}px`;
    if (rebuild) dock.innerHTML = `<div class="sash-y" id="sash-y" data-dir="up"></div><div class="details-body">${detailsHtml(details)}</div>`;
    document.documentElement.classList.add('details-open');
    detailsKey = key;
    return;
  }
  dock.hidden = true;
  if (rebuild) dock.innerHTML = '';
  const anchor = detailsAnchor();
  if (!details || !anchor) {
    inline.hidden = true;
    if (rebuild) inline.innerHTML = '';
    detailsKey = key;
    return;
  }
  const idx = displayIndexForHash(anchor);
  if (idx < 0) {
    inline.hidden = true;
    if (rebuild) inline.innerHTML = '';
    detailsKey = key;
    return;
  }
  document.documentElement.classList.add('details-open');
  inline.hidden = false;
  inline.style.top = `${(idx + 1) * ROW}px`;
  inline.style.height = `${currentDetailsHeight()}px`;
  if (rebuild) inline.innerHTML = `<div class="details-body">${detailsHtml(details)}</div><div class="sash-y" id="sash-y"></div>`;
  detailsKey = key;
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
  const table = `<div class="meta-table">${rows.map(metaRowHtml).join('')}${signaturePaneHtml(d)}</div>`;
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
const ICON_MAIL =
  '<svg class="copy-ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.75 3.25h12.5a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75H1.75a.75.75 0 0 1-.75-.75v-8.5a.75.75 0 0 1 .75-.75zM2.5 4.6v.65l5.5 3.25 5.5-3.25V4.6h-11zm11 1.95L8.15 9.7a.75.75 0 0 1-.8 0L2.5 6.55V11.5h11V6.55z"/></svg>';
const ICON_PERSON =
  '<svg class="copy-ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM3.15 13.7c.3-2.5 2.15-3.9 4.85-3.9s4.55 1.4 4.85 3.9z"/></svg>';
const ICON_CONTACT =
  '<svg class="copy-ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M1.6 3.1h12.8v9.8H1.6zm1.15 1.15v7.5h10.5v-7.5z"/><circle cx="5.55" cy="6.85" r="1.05" fill="currentColor"/><path fill="currentColor" d="M4.15 10.15c.25-.8.85-1.2 1.4-1.2s1.15.4 1.4 1.2zM8.55 6.15h3.7v.8h-3.7zm0 1.75h3.7v.8h-3.7z"/></svg>';

const COPY_ICONS: Record<MetaCopyIcon, string> = {
  copy: COPY_SVG,
  mail: ICON_MAIL,
  person: ICON_PERSON,
  contact: ICON_CONTACT,
};

function copyBtns(copies: DetailsMetaRow['copies']): string {
  return copies
    .map((c) => {
      const icon = COPY_ICONS[c.icon ?? 'copy'];
      const label = c.label ? `<span>${esc(c.label)}</span>` : '';
      return `<button type="button" class="copy-btn" data-copy="${esc(c.text)}" title="${esc(c.title)}" aria-label="${esc(c.title)}">${icon}${label}</button>`;
    })
    .join('');
}

function signatureCellHtml(c: GraphCommit): string {
  const col = signatureColumn(c.signatureKind);
  const cls = col.signed ? 'signed' : 'unsigned';
  return `<div class="cell signature ${cls}" title="${esc(col.title)}" aria-label="${esc(col.title)}">${esc(col.text)}</div>`;
}

function toggleSignaturePane(): void {
  signatureOpen = !signatureOpen;
  detailsKey = '';
  persistView();
  const pane = document.querySelector('.sig-block');
  if (pane && details) pane.outerHTML = signaturePaneHtml(details);
  else paint();
  if (details && detailsH == null) {
    autoDetailsH = estimateFromDetails(details);
    scheduleFitDetails();
  }
}

function signatureRows(sig: CommitDetails['signature']): SignatureInfoRow[] {
  const format = snap?.config.dateFormat ?? 'ISO Date & Time';
  return signatureInfoRows(sig, (unix) => formatDate(unix, format));
}

function signaturePaneHtml(d: CommitDetails): string {
  const rows = signatureRows(d.signature);
  const summary = signatureSummary(d.signature);
  const tone = summary.tone ? ` sig-${summary.tone}` : '';
  const body = signatureOpen ? `<div class="sig-body">${rows.map(signatureRowHtml).join('')}</div>` : '';
  return `<div class="sig-block${signatureOpen ? ' open' : ''}">
    <div class="meta-row">
      <div class="meta-label"><button type="button" class="sig-toggle" aria-expanded="${signatureOpen}" title="${signatureOpen ? 'Hide signature' : 'Show signature'}"><span class="sig-chevron" aria-hidden="true"></span>Signature</button></div>
      <div class="meta-main"><div class="sig-summary${summary.signed ? ' signed' : ''}${tone}">${esc(summary.text)}</div></div>
    </div>${body}</div>`;
}

function signatureRowHtml(row: SignatureInfoRow): string {
  const tone = row.tone ? ` sig-${row.tone}` : '';
  const mono = row.mono ? ' mono' : '';
  const copy = row.copy ? `<div class="copy-btns">${copyBtns([{ label: '', text: row.copy, title: 'Copy' }])}</div>` : '';
  return `<div class="meta-row"><div class="meta-label">${esc(row.label)}</div><div class="meta-main"><div class="meta-value${mono}${tone}">${esc(row.value)}</div>${copy}</div></div>`;
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
const ICON_HISTORY =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M8 3.2a4.8 4.8 0 1 1-3.4 1.4"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M4.2 2.4v2.4h2.4M8 5.6V8.4L9.8 9.4"/></svg>';
const ICON_BLAME =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M3 3.5h10M3 8h10M3 12.5h6"/></svg>';
const ICON_COPY_REL =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2h7a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm3 11h6V5H7v8zM4 12h1V4h6V3H4v9z"/></svg>';
const ICON_COPY_FULL =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2h7a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm3 11h6V5H7v8zM4 12h1V4h6V3H4v9z"/><path fill="currentColor" d="M2 7h3v1H3v3H2z"/></svg>';

function fileActionsHtml(): string {
  return `<span class="file-actions">
    <button type="button" class="file-act" data-fa="diff" title="Diff">${ICON_DIFF}</button>
    <button type="button" class="file-act" data-fa="open" title="Open File">${ICON_OPEN}</button>
    <button type="button" class="file-act" data-fa="blob" title="View at revision">${ICON_BLOB}</button>
    <button type="button" class="file-act" data-fa="history" title="File history">${ICON_HISTORY}</button>
    <button type="button" class="file-act" data-fa="blame" title="Blame">${ICON_BLAME}</button>
    <button type="button" class="file-act" data-fa="copy-full" title="Copy Full Path" aria-label="Copy Full Path">${ICON_COPY_FULL}<span class="file-act-mark" aria-hidden="true">F</span></button>
    <button type="button" class="file-act" data-fa="copy-rel" title="Copy Relative Path" aria-label="Copy Relative Path">${ICON_COPY_REL}<span class="file-act-mark" aria-hidden="true">R</span></button>
  </span>`;
}

function fileStatHtml(additions?: number, deletions?: number): string {
  const parts: string[] = [];
  if (additions != null && additions > 0) parts.push(`<span class="file-add" title="${additions} added">+${additions}</span>`);
  if (deletions != null && deletions > 0) parts.push(`<span class="file-del" title="${deletions} deleted">-${deletions}</span>`);
  if (!parts.length) return '';
  return `<span class="file-stats">${parts.join('')}</span>`;
}

function fileEnd(dir: string, additions?: number, deletions?: number): string {
  const stats = fileStatHtml(additions, deletions);
  const directory = dir ? `<span class="file-dir">${esc(dir)}</span>` : '';
  if (!stats && !directory) return '';
  return `<span class="file-end">${stats}${directory}</span>`;
}

function fileRow(path: string, name: string, status: string, oldPath = '', dir = '', additions?: number, deletions?: number): string {
  const added = status === 'A' || status === 'U';
  const picked = pickedFiles.includes(path) ? ' picked' : '';
  return `<div class="file scm-file${picked}" data-path="${esc(path)}" data-old="${esc(oldPath)}" data-st="${status}">
    <span class="badge st-${status}" title="${statusTitle(status)}">${status}</span>
    <span class="file-name" data-open="${added ? 'blob' : 'diff'}">${esc(name)}</span>
    ${fileActionsHtml()}
    ${fileEnd(dir, additions, deletions)}
  </div>`;
}

function fileListHtml(files: CommitDetails['files']): string {
  return files
    .map((f) => {
      const i = f.path.lastIndexOf('/');
      const name = i >= 0 ? f.path.slice(i + 1) : f.path;
      const dir = i >= 0 ? f.path.slice(0, i) : '';
      return fileRow(f.path, name, f.status, f.oldPath ?? '', dir, f.additions, f.deletions);
    })
    .join('');
}

function treeHtml(nodes: ReturnType<typeof buildFileTree>): string {
  return `<ul class="scm-tree">${nodes.map((n) => treeNode(n)).join('')}</ul>`;
}

const FOLDER_CHEVRON =
  '<svg class="scm-twist" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.146 5.854 7.646 10.354c.195.195.512.195.707 0l4.5-4.5c.195-.195.195-.512 0-.707s-.512-.195-.707 0L8 9.293 3.854 5.147c-.195-.195-.512-.195-.707 0s-.195.512 0 .707z"/></svg>';

function treeNode(n: ReturnType<typeof buildFileTree>[number]): string {
  if (n.children) {
    const key = macPlatform() ? 'Cmd+click' : 'Ctrl+click';
    const hint = `${n.name} — ${key} expands or collapses nested folders`;
    const folderPath = n.path ?? n.name;
    return `<li><details open class="scm-folder" data-path="${esc(folderPath)}"><summary title="${esc(hint)}">${FOLDER_CHEVRON}${esc(n.name)}</summary>${treeHtml(n.children)}</details></li>`;
  }
  return `<li>${fileRow(n.path ?? '', n.name, n.status ?? '', '', '', n.additions, n.deletions)}</li>`;
}

function eventElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function summaryFolder(target: EventTarget | null): HTMLDetailsElement | null {
  const folder = eventElement(target)?.closest('summary')?.closest('details.scm-folder');
  return folder instanceof HTMLDetailsElement ? folder : null;
}

function treeFolder(target: EventTarget | null): HTMLDetailsElement | null {
  const folder = eventElement(target)?.closest('details.scm-folder');
  return folder instanceof HTMLDetailsElement ? folder : null;
}

function applyFolderFold(folder: HTMLDetailsElement, plan: FolderFoldPlan): void {
  folder.open = plan.self;
  for (const node of folder.querySelectorAll('details.scm-folder')) {
    if (node instanceof HTMLDetailsElement) node.open = plan.descendants;
  }
}

function macPlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function toggleNestedFolders(folder: HTMLDetailsElement, openBefore: boolean): void {
  const plan = folderFoldPlan(openBefore, 'toggle-nested');
  applyFolderFold(folder, plan);
  queueMicrotask(() => {
    if (folder.isConnected) applyFolderFold(folder, plan);
  });
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
  if (i < 0) return;
  const commit = snap.commits[i]!;
  if (commitHidden(commit, dateFilter)) {
    dateFilter = revealCommitMonths(dateFilter, commit);
    if (dateDraft) dateDraft = revealCommitMonths(dateDraft, commit);
    fillDates();
  }
  if (personHidden(commit, personFilter)) {
    personFilter = revealCommitPeople(personFilter, commit);
    if (personDraft) personDraft = revealCommitPeople(personDraft, commit);
    fillPeople();
  }
  paint();
  const row = displayIndexForCommit(i);
  if (row >= 0) $('scroll').scrollTop = row * ROW - 80;
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
    pendingDateJump = null;
    scrollToHash(snap.commits[hit.index]!.hash);
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

function syncHeaderScroll(): void {
  const scroll = $('scroll');
  const clip = $('cols-clip');
  clip.style.width = `${scroll.clientWidth}px`;
  $('head').style.transform = scroll.scrollLeft ? `translateX(${-scroll.scrollLeft}px)` : '';
}

function setColWidth(key: string, px: number): void {
  const w = Math.max(48, px);
  document.documentElement.style.setProperty(key, `${w}px`);
  if (key === '--d') document.documentElement.style.setProperty('--d-min', `${w}px`);
  if (key === '--g') userG = w;
  columnWidths[key] = w;
  syncHeaderScroll();
  syncGraphClip();
}

function vis(cat: string, id: string): boolean {
  return snap?.menuVisibility[cat]?.[id] !== false;
}

function placeBusyHint(): void {
  const hint = $('git-busy-hint');
  const size = 18;
  const offset = 12;
  hint.style.left = `${Math.max(4, Math.min(lastPointer.x + offset, window.innerWidth - size - 4))}px`;
  hint.style.top = `${Math.max(4, Math.min(lastPointer.y + offset, window.innerHeight - size - 4))}px`;
}

function setGitBusy(on: boolean, fetch = false): void {
  $('btn-reload').classList.toggle('spinning', on);
  if (on && fetch) $('btn-fetch').classList.add('spinning');
  if (!on) $('btn-fetch').classList.remove('spinning');
  const root = document.documentElement;
  root.classList.toggle('git-busy', on);
  root.setAttribute('aria-busy', on ? 'true' : 'false');
  root.style.cursor = on ? 'wait' : '';
  document.body.style.cursor = on ? 'wait' : '';
  const overlay = $('git-busy-overlay');
  overlay.hidden = !on;
  if (on) {
    overlay.style.setProperty('cursor', 'none', 'important');
    void overlay.getBoundingClientRect();
    overlay.style.setProperty('cursor', 'wait', 'important');
    placeBusyHint();
  } else {
    overlay.style.removeProperty('cursor');
  }
  $('git-busy-hint').hidden = !on;
  paintUndoButtons();
}

function sendGit(action: GitAction): void {
  setGitBusy(true, action.kind === 'fetchRemote');
  post({ type: 'git', action });
}

function paintUndoButtons(): void {
  const busy = document.documentElement.classList.contains('git-busy');
  setHistoryButton($('btn-undo'), $('btn-undo-menu'), undoButtons.canUndo && !busy, undoButtons.undoLabel, 'Undo', 'Ctrl/Cmd+Z');
  setHistoryButton($('btn-redo'), $('btn-redo-menu'), undoButtons.canRedo && !busy, undoButtons.redoLabel, 'Redo', 'Ctrl/Cmd+Shift+Z');
}

function setHistoryButton(el: HTMLElement, menu: HTMLElement, enabled: boolean, label: string | null, name: string, keys: string): void {
  for (const node of [el, menu]) {
    node.classList.toggle('is-disabled', !enabled);
    node.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }
  el.title = label ? `${name}: ${label} (${keys})` : `Nothing to ${name.toLowerCase()}`;
  menu.title = enabled ? `${name} history` : `Nothing to ${name.toLowerCase()}`;
}

function closeHistoryMenus(): void {
  for (const id of ['pop-undo', 'pop-redo']) {
    const pop = $(id);
    if (pop.matches(':popover-open')) pop.hidePopover?.();
  }
}

function requestHistory(direction: 'undo' | 'redo', steps = 1): void {
  const enabled = direction === 'undo' ? undoButtons.canUndo : undoButtons.canRedo;
  const labels = direction === 'undo' ? undoButtons.undoLabels : undoButtons.redoLabels;
  if (!enabled || steps < 1 || steps > labels.length || document.documentElement.classList.contains('git-busy')) return;
  closeHistoryMenus();
  post({ type: direction, steps });
}

function bindHistoryMenu(direction: 'undo' | 'redo'): void {
  const menu = $(direction === 'undo' ? 'btn-undo-menu' : 'btn-redo-menu');
  const pop = $(direction === 'undo' ? 'pop-undo' : 'pop-redo');
  pop.addEventListener('beforetoggle', (ev) => {
    if ((ev as ToggleEvent).newState !== 'open') return;
    const labels = direction === 'undo' ? undoButtons.undoLabels : undoButtons.redoLabels;
    if (menu.classList.contains('is-disabled') || !labels.length) {
      ev.preventDefault();
      return;
    }
    const verb = direction === 'undo' ? 'Undo' : 'Redo';
    pop.innerHTML = labels
      .map((label, index) => {
        const steps = index + 1;
        const count = steps > 1 ? `<span class="hist-count">${steps} steps</span>` : '';
        const hint = steps === 1 ? label : `${verb} ${steps} steps, including newer entries`;
        return `<button type="button" data-steps="${steps}" title="${esc(hint)}">${esc(label)}${count}</button>`;
      })
      .join('');
  });
  pop.addEventListener('click', (ev) => {
    const button = (ev.target as HTMLElement).closest('button');
    if (!button) return;
    const steps = Number(button.dataset.steps);
    pop.hidePopover?.();
    if (steps > 0) requestHistory(direction, steps);
  });
  bindPopoverAnchor(menu.id, pop.id, { align: 'left' });
}

function showUndoPreview(m: Extract<HostToView, { type: 'undoPreview' }>): void {
  if (!snap) return;
  undoPending = m.direction;
  undoSteps = m.steps;
  undoPreviewMsg = m;
  const verb = m.direction === 'undo' ? 'Undo' : 'Redo';
  $('undo-title').textContent = `${verb} ${m.label}`;
  const warn = $('undo-warning');
  warn.hidden = !m.warning;
  warn.textContent = m.warning ?? '';
  ($('undo-side') as HTMLInputElement).checked = undoSideBySide;
  ($('undo-unrelated') as HTMLInputElement).checked = undoShowUnrelated;
  ($('undo-head') as HTMLInputElement).checked = undoShowHead;
  renderUndoGraphs();
  $('undo-changes').innerHTML = m.changes.map((change) => `<li>${esc(formatRefChange(change))}</li>`).join('');
  $('undo-cmds').textContent = m.commands.join('\n');
  $('undo-ok').textContent = verb;
  const dlg = document.getElementById('dlg-undo') as HTMLDialogElement;
  if (!dlg.open) dlg.showModal();
}

function renderUndoGraphs(): void {
  const m = undoPreviewMsg;
  const graphs = $('undo-graphs');
  const options = $('undo-options');
  if (!m?.showGraphs || !snap) {
    graphs.hidden = true;
    options.hidden = true;
    graphs.innerHTML = '';
    return;
  }
  graphs.hidden = false;
  options.hidden = false;
  graphs.classList.toggle('side-by-side', undoSideBySide);
  const view = presentPreview(m.before, m.after, {
    showUnrelated: undoShowUnrelated,
    showHead: undoShowHead,
    head: { branch: m.headBranch, hash: m.beforeHead },
  });
  const empty = view.before.length === 0 && view.after.length === 0;
  graphs.innerHTML = empty
    ? '<p class="dlg-note">Those commits are outside the loaded history.</p>'
    : `${undoSide('Before', view.before, m.beforeHead)}${undoSide('After', view.after, m.afterHead)}`;
}

function undoSide(title: string, commits: GraphCommit[], head: string | null): string {
  if (!commits.length) return `<section class="undo-side"><h3>${esc(title)}</h3><p class="dlg-note">No visible commits</p></section>`;
  const drawn = undoGraph(commits, head);
  const rows = commits
    .map((commit) => {
      const refs = undoShowUnrelated ? undoChips(commit.refs) : commit.refs.map((ref) => `<span class="refs${ref.ghost ? ' ghost' : ''}">${esc(ref.name)}</span>`).join('');
      return `<div class="undo-row${commit.ghost ? ' ghost' : ''}"><span class="hash">${esc(commit.hash.slice(0, 7))}</span><span class="subj">${esc(commit.subject)}</span>${refs}</div>`;
    })
    .join('');
  return `<section class="undo-side"><h3>${esc(title)}</h3><div class="undo-board"><svg width="${drawn.width}" height="${drawn.height}" aria-hidden="true">${drawn.svg}</svg><div class="undo-rows">${rows}</div></div></section>`;
}

function undoChips(refs: GraphRef[]): string {
  if (!snap || !refs.length) return '';
  const groups = groupChipRefs(refs, snap.config.combineLocalAndRemote);
  const mk = (ref: GraphRef, short = false) => {
    const detached = ref.kind === 'head' && ref.name === 'HEAD';
    const current = ref.kind === 'head' && Boolean(snap!.currentBranch) && ref.name === snap!.currentBranch;
    const face = chipFace(ref, short, false);
    const colour = chipColourAttrs(ref);
    return `<span class="chip ${ref.kind}${face.extra}${detached ? ' detached' : ''}${current ? ' current' : ''}${ref.ghost ? ' ghost' : ''}${colour.cls}"${colour.style}${face.title}>${face.icon}${esc(face.label)}</span>`;
  };
  const html = groups
    .map((group) =>
      group.kind === 'bundle'
        ? chipPairHtml(group.local.name, group.remotes.length, `${mk(group.local)}${group.remotes.map((ref) => mk(ref, true)).join('')}`, false, false)
        : mk(group.ref),
    )
    .join('');
  return `<span class="undo-chips">${html}</span>`;
}

function undoGraph(commits: GraphCommit[], head: string | null): { svg: string; width: number; height: number } {
  const layout = layoutCommits(commits, snap!.config.lanePriority);
  const height = Math.max(commits.length, 1) * ROW;
  const theme = snap!.config.theme === 'Ray Stream' ? 'classic' : snap!.config.theme;
  const nodeAt = new Set(layout.vertices.map((vertex) => `${vertex.row}:${vertex.lane}`));
  const parts: string[] = [];
  for (const edge of layout.edges) {
    const from = commits[edge.fromRow];
    const fromVertex = layout.vertices[edge.fromRow];
    const fromIsMerge = !!from && from.parents.length > 1 && fromVertex?.lane === edge.fromLane;
    const colour = colourForLane(edge.lane, snap!.config.graphColours, theme);
    const d = edgePath(
      laneX(edge.fromLane),
      rowY(edge.fromRow),
      laneX(edge.toLane),
      rowY(edge.toRow),
      snap!.config.graphStyle,
      edgeCurveAt(nodeAt.has(`${edge.toRow}:${edge.toLane}`), fromIsMerge),
    );
    const ghost = commits[edge.fromRow]?.ghost || commits[edge.toRow]?.ghost;
    parts.push(`<path d="${d}" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round"${ghost ? ' stroke-dasharray="4 3" opacity="0.45"' : ''}/>`);
  }
  for (const vertex of layout.vertices) {
    const colour = colourForLane(vertex.lane, snap!.config.graphColours, theme);
    const isHead = head != null && vertex.hash === head;
    const ghost = commits[vertex.row]?.ghost;
    parts.push(
      ghost
        ? `<circle cx="${laneX(vertex.lane)}" cy="${rowY(vertex.row)}" r="${isHead ? 5.5 : 4}" fill="none" stroke="${colour}" stroke-dasharray="2 2" opacity="0.55"/>`
        : `<circle cx="${laneX(vertex.lane)}" cy="${rowY(vertex.row)}" r="${isHead ? 5.5 : 4}" fill="${colour}" stroke="${colour}"/>`,
    );
  }
  return { svg: parts.join(''), width: graphWidth(layout.maxLanes), height };
}

function fillHelp(): void {
  const k = snap?.config.keyboard ?? {
    find: 'CTRL/CMD + F',
    refresh: 'CTRL/CMD + R',
    scrollToHead: 'CTRL/CMD + H',
    scrollToStash: 'CTRL/CMD + S',
  };
  const rows: Array<[string, string]> = [
    ['Undo', 'CTRL/CMD + Z'],
    ['Redo', 'CTRL/CMD + Shift + Z'],
    ['Find', k.find],
    ['Find next', 'F3'],
    ['Find previous', 'Shift+F3'],
    ['Refresh', k.refresh],
    ['Jump to HEAD', k.scrollToHead],
    ['Jump to stash', k.scrollToStash],
  ];
  $('help-keys').innerHTML = rows.map(([l, v]) => `<dt>${esc(l)}</dt><dd><kbd>${esc(v)}</kbd></dd>`).join('');
}

function lockPopoverWidth(pop: HTMLElement, width: number): void {
  const px = `${width}px`;
  pop.style.width = px;
  pop.style.minWidth = px;
  pop.style.maxWidth = px;
}

function lockPopoverHeight(pop: HTMLElement, height: number | null): void {
  if (height == null) {
    pop.style.height = '';
    pop.style.minHeight = '';
    pop.style.maxHeight = '';
    pop.classList.remove('is-resized');
    return;
  }
  const px = `${height}px`;
  pop.style.height = px;
  pop.style.minHeight = px;
  pop.style.maxHeight = px;
  pop.classList.add('is-resized');
}

function applyAnchoredPopoverPlacement(
  pop: HTMLElement,
  place: ReturnType<typeof anchoredPopoverPlacement>,
  fixed?: { width: number; height: number | null },
): void {
  pop.style.position = 'fixed';
  pop.style.inset = 'auto';
  pop.style.margin = '0';
  if (fixed) {
    lockPopoverWidth(pop, fitPopoverSpan(fixed.width, place.maxWidth, REFS_POPOVER_MIN_WIDTH));
    const available = window.innerHeight - place.top - 4;
    lockPopoverHeight(pop, fixed.height == null ? null : fitPopoverSpan(fixed.height, available, REFS_POPOVER_MIN_HEIGHT));
  } else {
    pop.style.width = 'max-content';
    pop.style.minWidth = '';
    pop.style.maxWidth = `${place.maxWidth}px`;
    pop.style.height = '';
    pop.style.minHeight = '';
    pop.style.maxHeight = '';
  }
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
  if (pop.id === 'pop-refs' && (refsPopoverDragging || refsPopoverCustomPlace)) return;
  const r = btn.getBoundingClientRect();
  const rect = { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const fixed = pop.id === 'pop-refs' ? { width: refsPopoverWidth, height: refsPopoverHeight } : undefined;
  applyAnchoredPopoverPlacement(pop, anchoredPopoverPlacement(rect, pop.offsetHeight, viewport, opts), fixed);
  applyAnchoredPopoverPlacement(pop, anchoredPopoverPlacement(rect, pop.offsetHeight, viewport, opts), fixed);
}

function refsPopoverEdgeAxis(edge: PopoverEdge): { horizontal: boolean; vertical: boolean } {
  return {
    horizontal: edge.includes('e') || edge.includes('w'),
    vertical: edge.includes('n') || edge.includes('s'),
  };
}

function refsPopoverCursor(edge: PopoverEdge): string {
  if (edge === 'n' || edge === 's') return 'ns-resize';
  if (edge === 'e' || edge === 'w') return 'ew-resize';
  if (edge === 'ne' || edge === 'sw') return 'nesw-resize';
  return 'nwse-resize';
}

function setRefsResizeCursor(cursor: string | null): void {
  const root = document.documentElement;
  if (!cursor) {
    root.classList.remove('refs-pop-resize');
    root.style.removeProperty('--refs-pop-resize');
    return;
  }
  root.style.setProperty('--refs-pop-resize', cursor);
  root.classList.add('refs-pop-resize');
}

function applyDraggedRefsPopover(pop: HTMLElement, next: PopoverRect, edge: PopoverEdge): void {
  const axis = refsPopoverEdgeAxis(edge);
  pop.style.position = 'fixed';
  pop.style.margin = '0';
  pop.style.right = 'auto';
  pop.style.bottom = 'auto';
  pop.style.left = `${next.left}px`;
  pop.style.top = `${next.top}px`;
  if (axis.horizontal) lockPopoverWidth(pop, next.width);
  if (axis.vertical) lockPopoverHeight(pop, next.height);
}

function clampRefsPopoverIntoView(pop: HTMLElement): void {
  const margin = 4;
  const rect = pop.getBoundingClientRect();
  const width = fitPopoverSpan(refsPopoverWidth, window.innerWidth - margin * 2, REFS_POPOVER_MIN_WIDTH);
  const height =
    refsPopoverHeight == null
      ? rect.height
      : fitPopoverSpan(refsPopoverHeight, window.innerHeight - margin * 2, REFS_POPOVER_MIN_HEIGHT);
  let left = rect.right - width;
  let top = rect.top;
  const maxLeft = window.innerWidth - margin - width;
  const maxTop = window.innerHeight - margin - height;
  left = Math.min(Math.max(left, margin), Math.max(margin, maxLeft));
  top = Math.min(Math.max(top, margin), Math.max(margin, maxTop));
  pop.style.position = 'fixed';
  pop.style.margin = '0';
  pop.style.right = 'auto';
  pop.style.bottom = 'auto';
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  lockPopoverWidth(pop, width);
  if (refsPopoverHeight != null) lockPopoverHeight(pop, height);
}

function bindRefsPopoverResize(): void {
  const pop = $('pop-refs');
  pop.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const handle = (ev.target as HTMLElement).closest<HTMLElement>('.pop-frame');
    if (!handle || !pop.contains(handle)) return;
    const edge = handle.dataset.edge;
    if (!isPopoverEdge(edge)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const rect = pop.getBoundingClientRect();
    const start: PopoverRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const originX = ev.clientX;
    const originY = ev.clientY;
    const axis = refsPopoverEdgeAxis(edge);
    refsPopoverDragging = true;
    refsPopoverCustomPlace = true;
    pop.style.left = `${rect.left}px`;
    pop.style.right = 'auto';
    pop.style.top = `${rect.top}px`;
    pop.style.bottom = 'auto';
    setRefsResizeCursor(refsPopoverCursor(edge));
    handle.setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent) => {
      const next = resizePopoverRect(start, edge, e.clientX - originX, e.clientY - originY, {
        minWidth: REFS_POPOVER_MIN_WIDTH,
        minHeight: REFS_POPOVER_MIN_HEIGHT,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      applyDraggedRefsPopover(pop, next, edge);
    };
    const finish = (e: PointerEvent) => {
      if (!refsPopoverDragging) return;
      refsPopoverDragging = false;
      setRefsResizeCursor(null);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      move(e);
      const box = pop.getBoundingClientRect();
      if (axis.horizontal) {
        refsPopoverWidth = Math.round(box.width);
        lockPopoverWidth(pop, refsPopoverWidth);
      }
      if (axis.vertical) {
        refsPopoverHeight = Math.round(box.height);
        lockPopoverHeight(pop, refsPopoverHeight);
      }
      persistView();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  });
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
  ['btn-dates', 'pop-dates'],
  ['btn-contributor', 'pop-contributor'],
  ['btn-graph', 'pop-graph'],
  ['btn-settings', 'pop-settings'],
  ['btn-find', 'pop-find'],
  ['btn-date', 'pop-date'],
  ['btn-repo-help', 'pop-repo-help', { align: 'left', maxWidth: 400 }],
  ['btn-undo-menu', 'pop-undo', { align: 'left' }],
  ['btn-redo-menu', 'pop-redo', { align: 'left' }],
];

function repositionOpenAnchoredPopovers(): void {
  for (const [btnId, popId, opts] of ANCHOR_POPS) {
    const pop = $(popId);
    if (!pop.matches(':popover-open')) continue;
    if (popId === 'pop-refs' && refsPopoverDragging) continue;
    if (popId === 'pop-refs' && refsPopoverCustomPlace) {
      clampRefsPopoverIntoView(pop);
      continue;
    }
    positionAnchoredPopover(pop, $(btnId), opts);
  }
}

function openCtx(html: string, x: number, y: number): void {
  const pop = $('pop-ctx');
  pop.innerHTML = html;
  placePopover(pop, x, y);
}

function syncWorktreeForm(): void {
  const loc = document.getElementById('wt-loc') as HTMLInputElement | null;
  const name = document.getElementById('wt-name') as HTMLInputElement | null;
  const preview = document.getElementById('wt-preview');
  const warn = document.getElementById('wt-warn');
  if (!loc || !name || !preview || !warn || !snap) return;
  const main = snap.mainWorktreePath || snap.repoPath;
  const state = worktreeFormState(loc.value, name.value, main);
  preview.textContent = state.canCreate ? `Create at ${state.destination}` : 'Enter a folder name.';
  warn.hidden = !state.insideMain;
  warn.textContent = state.warning;
  $('git-ok').disabled = !state.canCreate;
}

let gitDialogAt: { x: number; y: number } | null = null;

const REMOTE_CHIP_ICON = '<span class="chip-ico" aria-hidden="true"></span>';

function labelColour(ref: { kind: string; name: string; remote?: string }): string | undefined {
  if (!snap?.config.referenceLabelColours.length) return undefined;
  return refLabelColour(ref, snap.config.referenceLabelColours);
}

function openLabelColourDialog(ref: GraphRef, at?: { x: number; y: number }): void {
  if (!snap) return;
  const current = refLabelColour(ref, snap.config.referenceLabelColours) ?? DEFAULT_LABEL_COLOUR;
  gitDialog('Label colour', labelColourDialogHtml({ pattern: ref.name, colour: current }), () => {
    if (!snap) return;
    const pattern = (document.getElementById('lc-pattern') as HTMLInputElement | null)?.value ?? '';
    const colour = (document.getElementById('lc-hex') as HTMLInputElement | null)?.value ?? '';
    const next = upsertRefColour(snap.config.referenceLabelColours, pattern, colour);
    if (!next) return;
    post({ type: 'setLabelColours', colours: refColoursToSetting(next) });
  }, at);
  const hsv = hexToHsv(current) ?? { h: 0, s: 1, v: 1 };
  renderLabelColourHsv(hsv, normalizeHex(current) ?? DEFAULT_LABEL_COLOUR);
  syncLabelColourOk();
}

function renderLabelColourHsv(hsv: Hsv, text?: string): void {
  const pad = document.getElementById('lc-sv');
  const hue = document.getElementById('lc-hue') as HTMLInputElement | null;
  const knob = document.getElementById('lc-knob');
  const swatch = document.getElementById('lc-swatch');
  const hex = document.getElementById('lc-hex') as HTMLInputElement | null;
  if (!pad || !hue || !knob || !swatch || !hex) return;
  const h = ((hsv.h % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, hsv.s));
  const v = Math.min(1, Math.max(0, hsv.v));
  pad.dataset.s = String(s);
  pad.dataset.v = String(v);
  pad.style.setProperty('--lc-h', String(h));
  hue.value = String(Math.round(h));
  knob.style.left = `${s * 100}%`;
  knob.style.top = `${(1 - v) * 100}%`;
  const shown = text ?? hsvToHex({ h, s, v });
  if (text === undefined) hex.value = shown;
  swatch.style.background = shown;
}

function labelColourHsv(): Hsv {
  const pad = document.getElementById('lc-sv');
  return {
    h: Number((document.getElementById('lc-hue') as HTMLInputElement | null)?.value ?? 0),
    s: Number(pad?.dataset.s ?? 1),
    v: Number(pad?.dataset.v ?? 1),
  };
}

function moveLabelColourSv(pad: HTMLElement, ev: PointerEvent): void {
  const rect = pad.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const s = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
  const v = Math.min(1, Math.max(0, 1 - (ev.clientY - rect.top) / rect.height));
  renderLabelColourHsv({ h: labelColourHsv().h, s, v });
  syncLabelColourOk();
}

function hideLabelColourTip(): void {
  document.getElementById('lc-tip')?.hidePopover?.();
  document.getElementById('lc-help')?.setAttribute('aria-expanded', 'false');
}

function toggleLabelColourTip(): void {
  const tip = document.getElementById('lc-tip');
  const btn = document.getElementById('lc-help');
  if (!tip || !btn) return;
  if (tip.matches(':popover-open')) {
    hideLabelColourTip();
    return;
  }
  tip.showPopover?.();
  positionAnchoredPopover(tip, btn, { align: 'left', maxWidth: 256 });
  positionAnchoredPopover(tip, btn, { align: 'left', maxWidth: 256 });
  btn.setAttribute('aria-expanded', 'true');
}

function syncLabelColourOk(): void {
  const pattern = (document.getElementById('lc-pattern') as HTMLInputElement | null)?.value.trim() ?? '';
  const hex = (document.getElementById('lc-hex') as HTMLInputElement | null)?.value ?? '';
  if (!document.getElementById('lc-pattern')) return;
  $('git-ok').disabled = !pattern || !normalizeHex(hex);
  const remove = document.getElementById('lc-remove') as HTMLButtonElement | null;
  if (remove) remove.disabled = !snap?.config.referenceLabelColours.some((rule) => rule.pattern === pattern);
}

function chipColourAttrs(ref: GraphRef): { cls: string; style: string } {
  const colour = labelColour(ref);
  if (!colour) return { cls: '', style: '' };
  return { cls: ' coloured', style: ` style="color:${colour};--ref-colour:${colour}"` };
}

function refRowColourAttrs(ref: { kind: string; name: string; remote?: string }): { mark: string; name: string } {
  const colour = labelColour(ref);
  if (!colour) return { mark: '', name: '' };
  return {
    mark: ` style="background:${colour};box-shadow:none"`,
    name: ` style="color:${colour}"`,
  };
}

function chipFace(r: GraphRef, short: boolean, iconOnly: boolean): { extra: string; icon: string; label: string; title: string } {
  const remoteShort = short && r.kind === 'remote';
  const remoteIcon = !remoteShort && r.kind === 'remote' && snap!.config.remoteBranchPrefix !== 'Text';
  const icon = remoteShort || remoteIcon ? REMOTE_CHIP_ICON : chipIcon(r.kind);
  const label = remoteShort ? remoteShortName(r) : remoteIcon ? remoteChipText(r.name, 'Icon') : refDisplayName(r);
  const extra = `${remoteShort ? ' short' : ''}${remoteIcon ? ' prefix' : ''}${iconOnly ? ' icon-only' : ''}`;
  const title = iconOnly
    ? ` title="${esc(label)}" aria-label="${esc(`${label}, show remotes`)}"`
    : remoteIcon
      ? ` title="${esc(refDisplayName(r))}"`
      : '';
  return { extra, icon, label, title };
}
const REMOTE_FOLD_BUTTON =
  '<button type="button" class="chip-fold" aria-expanded="true" title="Collapse remotes" aria-label="Collapse remotes"><svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M10 4 6 8l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';

function chipIcon(kind: string): string {
  return kind === 'head' || kind === 'tag' || kind === 'worktree' ? '<span class="chip-ico" aria-hidden="true"></span>' : '';
}

function setRemoteLabelsExpanded(hash: string, branch: string, expanded: boolean): void {
  const key = remoteLabelKey(hash, branch);
  if (expanded) {
    expandedRemoteLabels.add(key);
    remoteLabelsExpandedAt = performance.now();
  } else expandedRemoteLabels.delete(key);
  paint();
}

function clearCursorDialog(dlg: HTMLElement): void {
  dlg.classList.remove('at-cursor');
  dlg.style.left = '';
  dlg.style.top = '';
}

function placeCursorDialog(dlg: HTMLElement, at: { x: number; y: number }): void {
  dlg.classList.add('at-cursor');
  const place = cursorDialogPlacement(
    at,
    { width: dlg.offsetWidth, height: dlg.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  );
  dlg.style.left = `${place.left}px`;
  dlg.style.top = `${place.top}px`;
}

function gitDialog(title: string, body: string, onOk: () => void, at?: { x: number; y: number }): void {
  dialogOk = onOk;
  gitDialogAt = at ?? null;
  $('git-title').textContent = title;
  $('git-body').innerHTML = body;
  $('git-ok').disabled = false;
  syncGitOkFromRemotes();
  syncDeleteBranchForm();
  syncLanePriorityForm();
  const dlg = $('dlg-git') as unknown as HTMLDialogElement;
  clearCursorDialog(dlg);
  if (at) {
    dlg.classList.add('at-cursor');
    dlg.style.left = `${Math.round(at.x)}px`;
    dlg.style.top = `${Math.round(at.y)}px`;
  }
  dlg.showModal();
  if (at) placeCursorDialog(dlg, at);
  const field = $('git-body').querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]), textarea, select');
  const ok = $('git-ok');
  if (field) field.focus();
  else if (!ok.disabled) ok.focus();
  else $('git-body').querySelector<HTMLElement>('input')?.focus();
}

function selectedPushRemotes(): string[] {
  const checked = [...$('git-body').querySelectorAll<HTMLInputElement>('input[name="rm"]:checked')].map((el) => el.value);
  if (checked.length) return checked;
  const sel = $('git-body').querySelector<HTMLSelectElement>('select#rm');
  return sel?.value ? [sel.value] : [];
}

function syncDeleteBranchForm(): void {
  const force = document.getElementById('fr') as HTMLInputElement | null;
  const warn = document.getElementById('del-unmerged');
  if (!force || !warn) return;
  const state = deleteBranchConfirm(deleteBranchMerge, force.checked);
  warn.hidden = !state.showWarning;
  $('git-ok').disabled = !state.okEnabled;
}

function syncLanePriorityForm(): void {
  const pattern = document.getElementById('lp-pattern') as HTMLInputElement | null;
  const priority = document.getElementById('lp-priority') as HTMLInputElement | null;
  if (!pattern || !priority) return;
  const text = priority.value.trim();
  const n = Number(text);
  $('git-ok').disabled = !pattern.value.trim() || text === '' || !Number.isFinite(n);
}

function syncGitOkFromRemotes(): void {
  if ($('git-body').querySelector('[data-push-optional]')) return;
  const boxes = $('git-body').querySelectorAll<HTMLInputElement>('input[name="rm"]');
  const sel = $('git-body').querySelector<HTMLSelectElement>('select#rm');
  if (!boxes.length && !sel) return;
  $('git-ok').disabled = selectedPushRemotes().length === 0;
}

function indexRemoteTags(tags: RemoteTagTip[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags) map.set(`${tag.remote}\0${tag.name}`, tag.commit);
  return map;
}

function tagMarkName(): string {
  if (!tagMark) return '';
  if (tagMark.name != null) return tagMark.name;
  const raw = (document.getElementById('tn') as HTMLInputElement | null)?.value ?? '';
  return applySpaceSubstitution(raw, snap?.config.dialogs.spaceSubstitution ?? 'None');
}

function paintRemoteTagError(errors: readonly RemoteTagError[]): void {
  const el = document.getElementById('tag-remote-err');
  if (!el) return;
  const text = remoteTagErrorText(errors);
  el.textContent = text;
  el.hidden = !text;
}

function paintTagRemoteMarks(): void {
  if (!tagMark) return;
  const name = tagMarkName();
  const iconFor = (remote: string) =>
    remoteTagLoading
      ? tagRemoteLoadingIcon()
      : tagOnRemoteIcon(tagOnRemote(tagMark!.commit, remote ? remoteTagCommits.get(`${remote}\0${name}`) : undefined));
  for (const el of $('git-body').querySelectorAll<HTMLElement>('[data-tag-mark]')) el.innerHTML = iconFor(el.dataset.tagMark ?? '');
  const sel = $('git-body').querySelector<HTMLSelectElement>('select#rm');
  const selMark = document.getElementById('rm-mark');
  if (sel && selMark) selMark.innerHTML = iconFor(sel.value);
}

function watchRemoteTags(commit: string, name: string | null): void {
  tagMark = { commit, name };
  remoteTagCommits = new Map();
  remoteTagLoading = (snap?.remotes.length ?? 0) > 0;
  paintTagRemoteMarks();
  if (!remoteTagLoading || !snap) return;
  const requestId = String(++remoteTagSeq);
  remoteTagReq = requestId;
  post({ type: 'remoteTags', requestId, remotes: snap.remotes.map((remote) => remote.name) });
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
  signature: '--sig',
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
      setColWidth(key, startW + (e.clientX - startX));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      const raw = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
      const width = Number.parseFloat(raw);
      if (Number.isFinite(width)) columnWidths[key] = width;
      persistView();
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
    setColWidth(key, $('svg').getBoundingClientRect().width + 8);
    persistView();
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
  setColWidth(key, max + 8);
  persistView();
}

function intrinsicRowWidth(row: HTMLElement): number {
  const probe = row.cloneNode(true) as HTMLElement;
  probe.style.cssText =
    'position:fixed;left:0;top:0;visibility:hidden;display:flex;flex-wrap:nowrap;width:max-content;max-width:none;white-space:nowrap;';
  document.body.append(probe);
  for (const el of probe.querySelectorAll<HTMLElement>('.meta-main, .meta-value')) {
    el.style.whiteSpace = 'nowrap';
    el.style.overflow = 'visible';
    el.style.textOverflow = 'clip';
    el.style.flex = '0 0 auto';
    el.style.width = 'max-content';
    el.style.minWidth = 'max-content';
    el.style.maxWidth = 'none';
  }
  const main = probe.querySelector<HTMLElement>('.meta-main');
  if (main) main.style.flexWrap = 'nowrap';
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

function measureMetaContent(meta: HTMLElement): number {
  const style = getComputedStyle(meta);
  const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const border = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
  const table = meta.querySelector('.meta-table');
  if (!table) return 0;
  let widest = 0;
  for (const row of table.querySelectorAll<HTMLElement>('.meta-row')) {
    widest = Math.max(widest, intrinsicRowWidth(row));
  }
  return widest + pad + border;
}

function fitDetailsMeta(): void {
  const meta = document.querySelector<HTMLElement>('.details-body .meta');
  if (!meta) return;
  const screen = document.documentElement.clientWidth;
  const w = fittedDetailsMeta(measureMetaContent(meta), screen);
  document.documentElement.style.setProperty('--details-meta', `${w}px`);
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
      const startW = meta?.getBoundingClientRect().width ?? DETAILS_META_DEFAULT;
      const detailsBody = sashX.closest('.details-body');
      sashX.setPointerCapture(ev.pointerId);
      const move = (e: PointerEvent) => {
        const sashW = sashX.getBoundingClientRect().width || 4;
        const detailsW = detailsBody?.getBoundingClientRect().width ?? startW + sashW + DETAILS_FILES_MIN;
        const w = draggedDetailsMeta(startW + (e.clientX - startX), detailsW, sashW);
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
          if (snap) {
            const rows = shownCommits();
            const gap = detailsGap(rows);
            $('spacer').style.height = `${rows.length * ROW + (gap ? gap.height : 0)}px`;
          }
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
    if (t.closest?.('#sash-x')) fitDetailsMeta();
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
    if ($('git-ok').disabled) return;
    const submitter = (ev as SubmitEvent).submitter as HTMLButtonElement | null;
    dlg.close();
    const ok = dialogOk;
    dialogOk = null;
    if (!submitter || submitter.id === 'git-ok' || submitter.value === 'ok') ok?.();
  });
  $('git-body').addEventListener('change', () => {
    syncGitOkFromRemotes();
    syncDeleteBranchForm();
    if (document.getElementById('lp-pattern')) syncLanePriorityForm();
    if (tagMark) paintTagRemoteMarks();
  });
  $('git-body').addEventListener('input', (ev) => {
    if (document.getElementById('wt-name')) syncWorktreeForm();
    if (document.getElementById('lp-pattern')) syncLanePriorityForm();
    if (tagMark && document.getElementById('tn')) paintTagRemoteMarks();
    const id = (ev.target as HTMLElement).id;
    if (id === 'lc-hue') {
      renderLabelColourHsv(labelColourHsv());
      syncLabelColourOk();
    } else if (id === 'lc-hex') {
      const parsed = normalizeHex((ev.target as HTMLInputElement).value);
      if (parsed) {
        const hsv = hexToHsv(parsed);
        if (hsv) renderLabelColourHsv(hsv, parsed);
      }
      syncLabelColourOk();
    } else if (id === 'lc-pattern') syncLabelColourOk();
  });
  $('git-body').addEventListener('pointerdown', (ev) => {
    const pad = (ev.target as HTMLElement).closest<HTMLElement>('#lc-sv');
    if (!pad) return;
    ev.preventDefault();
    pad.setPointerCapture(ev.pointerId);
    moveLabelColourSv(pad, ev);
  });
  $('git-body').addEventListener('pointermove', (ev) => {
    const pad = document.getElementById('lc-sv');
    if (!pad?.hasPointerCapture(ev.pointerId)) return;
    moveLabelColourSv(pad, ev);
  });
  $('git-body').addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    if (target.closest('#lc-tip')) return;
    if (target.closest('#lc-help')) {
      ev.preventDefault();
      toggleLabelColourTip();
      return;
    }
    hideLabelColourTip();
    if (target.id !== 'lc-remove') return;
    ev.preventDefault();
    const pattern = (document.getElementById('lc-pattern') as HTMLInputElement | null)?.value ?? '';
    if (!snap || !pattern.trim()) return;
    post({ type: 'setLabelColours', colours: refColoursToSetting(removeRefColour(snap.config.referenceLabelColours, pattern)) });
    dialogOk = null;
    dlg.close();
  });
  $('git-cancel').addEventListener('click', () => {
    dialogOk = null;
    dlg.close();
  });
  dlg.addEventListener('cancel', () => {
    dialogOk = null;
  });
  dlg.addEventListener('close', () => {
    hideLabelColourTip();
    tagMark = null;
    remoteTagReq = '';
    remoteTagLoading = false;
    gitDialogAt = null;
    clearCursorDialog(dlg);
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
    if ($('git-ok').disabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    form.requestSubmit($('git-ok') as unknown as HTMLButtonElement);
  });
  const compareDlg = $('dlg-compare') as unknown as HTMLDialogElement;
  ($('cmp-q') as HTMLInputElement).addEventListener('input', () => {
    compareActive = 0;
    fillCompareList();
  });
  $('cmp-list').addEventListener('click', (ev) => {
    const button = (ev.target as HTMLElement).closest<HTMLElement>('[data-cmp]');
    if (!button?.dataset.cmp) return;
    chooseCompare(Number(button.dataset.cmp));
  });
  $('cmp-cancel').addEventListener('click', () => compareDlg.close());
  compareDlg.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      return;
    }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!compareRows.length) return;
      ev.preventDefault();
      ev.stopPropagation();
      const dir = ev.key === 'ArrowDown' ? 1 : -1;
      compareActive = (compareActive + dir + compareRows.length) % compareRows.length;
      fillCompareList();
      return;
    }
    if (ev.key !== 'Enter' || ev.isComposing) return;
    if ((ev.target as HTMLElement).id === 'cmp-cancel') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (compareRows.length) chooseCompare(compareActive);
  });
}

function canCompareWithHead(hash: string): boolean {
  return Boolean(hash && snap?.head && hash !== snap.head);
}

function startCompare(a: string, b: string): void {
  if (!a || !b) return;
  pickedBranches = [];
  selected = a;
  compare = b;
  compareAnchor = a;
  post({ type: 'compare', a, b });
  persistView();
  paint();
}

function fillCompareList(): void {
  if (!snap) return;
  const picked = comparePick({
    refs: snap.filterRefs ?? [],
    commits: snap.commits,
    query: ($('cmp-q') as HTMLInputElement).value,
    limit: snap.config.refsListLimit,
    branchSort: snap.config.branchSort,
    tagSort: snap.config.tagSort,
  });
  compareRows = picked.sections.flatMap((section) => section.items);
  if (compareActive >= compareRows.length) compareActive = 0;
  let index = 0;
  $('cmp-list').innerHTML = picked.sections
    .map((section) => {
      const rows = section.items
        .map((item) => {
          const i = index++;
          const on = i === compareActive ? ' aria-selected="true"' : '';
          const detail = item.detail ? `<span class="cmp-detail">${esc(item.detail)}</span>` : '';
          const paint = item.kind === 'commit' ? { mark: '', name: '' } : refRowColourAttrs({ kind: item.kind, name: item.label });
          return `<button type="button" class="ref-item kind-${item.kind}" role="option" data-cmp="${i}"${on}><span class="ref-mark" aria-hidden="true"${paint.mark}></span><span class="ref-name"${paint.name}>${esc(item.label)}</span>${detail}</button>`;
        })
        .join('');
      return `<div class="cmp-section"><div class="cmp-h">${esc(section.title)}</div>${rows}</div>`;
    })
    .join('');
  $('cmp-empty').hidden = compareRows.length > 0;
  $('cmp-more').hidden = !picked.truncated;
  $('cmp-list').querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function openCompareDialog(base: string): void {
  if (!base || !snap) return;
  compareBase = base;
  compareActive = 0;
  ($('cmp-q') as HTMLInputElement).value = '';
  fillCompareList();
  ($('dlg-compare') as unknown as HTMLDialogElement).showModal();
  $('cmp-q').focus();
}

function chooseCompare(index: number): void {
  const row = compareRows[index];
  const base = compareBase;
  if (!row || !base) return;
  ($('dlg-compare') as unknown as HTMLDialogElement).close();
  startCompare(base, row.rev);
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
  if (kind === 'history') {
    post({ type: 'setHistoryPath', path });
    return;
  }
  if (kind === 'blame') {
    post({ type: 'blame', path });
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
  if (t.closest('.sig-toggle')) {
    ev.preventDefault();
    toggleSignaturePane();
    return true;
  }
  const fv = t.closest<HTMLElement>('[data-fv]');
  if (fv && snap && details) {
    const value = fv.dataset.fv as 'File Tree' | 'File List';
    snap.config.fileViewType = value;
    post({ type: 'setFileView', value });
    refreshFileView();
    return true;
  }
  const fileHit = t.closest<HTMLElement>('.file');
  if (fileHit && details && (ev.ctrlKey || ev.metaKey || ev.shiftKey) && !t.closest('.file-act')) {
    ev.preventDefault();
    togglePickedFile(fileHit.dataset.path ?? '', ev.shiftKey);
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
    clearCompare();
    persistView();
    post({ type: 'openRow', hash: selected });
    if (displayIndexForHash(selected) < 0) scrollToHash(selected);
    return true;
  }
  return false;
}

function bind(): void {
  new ResizeObserver(() => scheduleViewportPaint()).observe($('scroll'));
  $('conflict-continue').addEventListener('click', () => {
    if (!snap?.operation) return;
    post({ type: 'git', action: { kind: 'continueOperation', operation: snap.operation.kind } });
  });
  $('conflict-abort').addEventListener('click', () => {
    if (!snap?.operation) return;
    post({ type: 'git', action: { kind: 'abortOperation', operation: snap.operation.kind } });
  });
  $('conflict-files').addEventListener('click', (ev) => {
    const button = (ev.target as HTMLElement).closest<HTMLElement>('[data-conflict]');
    if (!button?.dataset.conflict) return;
    post({ type: 'openMerge', path: button.dataset.conflict });
  });
  $('path-filter-clear').addEventListener('click', () => post({ type: 'setHistoryPath', path: null }));
  const trackPointer = (ev: PointerEvent) => {
    lastPointer = { x: ev.clientX, y: ev.clientY };
    if (document.documentElement.classList.contains('git-busy')) placeBusyHint();
  };
  document.addEventListener('pointermove', trackPointer, { passive: true });
  document.addEventListener('pointerdown', trackPointer, { passive: true });
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
  $('btn-undo').addEventListener('click', () => requestHistory('undo'));
  $('btn-redo').addEventListener('click', () => requestHistory('redo'));
  bindHistoryMenu('undo');
  bindHistoryMenu('redo');
  $('undo-ok').addEventListener('click', () => {
    const direction = undoPending;
    const steps = undoSteps;
    undoPending = null;
    (document.getElementById('dlg-undo') as HTMLDialogElement).close();
    if (direction) post({ type: 'undoApply', direction, steps });
  });
  $('undo-cancel').addEventListener('click', () => {
    undoPending = null;
    (document.getElementById('dlg-undo') as HTMLDialogElement).close();
  });
  $('undo-side').addEventListener('change', () => {
    undoSideBySide = ($('undo-side') as HTMLInputElement).checked;
    renderUndoGraphs();
  });
  $('undo-unrelated').addEventListener('change', () => {
    undoShowUnrelated = ($('undo-unrelated') as HTMLInputElement).checked;
    renderUndoGraphs();
  });
  $('undo-head').addEventListener('change', () => {
    undoShowHead = ($('undo-head') as HTMLInputElement).checked;
    renderUndoGraphs();
  });
  paintUndoButtons();
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
  $('show-same-commit').addEventListener('change', (e) => {
    if (!filterDraft) startFilterDraft();
    if (filterDraft) filterDraft.showSameCommitBranches = (e.target as HTMLInputElement).checked;
  });
  $('ref-list').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.ref-jump');
    const hash = btn?.dataset.jump;
    if (!btn || !hash) return;
    e.preventDefault();
    e.stopPropagation();
    jumpToRef(hash);
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
    if (t.closest('.ref-tabs') || t.closest('.ref-jump') || t.id === 'ref-ok') return;
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
      if (!pendingRefJump) hideRefJumpMiss();
      $('ref-q').focus();
      return;
    }
    filterDraft = null;
    refsPopoverCustomPlace = false;
  });
  $('pop-dates').addEventListener('toggle', (ev) => {
    if ((ev as ToggleEvent).newState === 'open') {
      dateDraft = copyDateFilter(dateFilter);
      $('date-q').value = '';
      fillDates();
      $('date-q').focus();
      return;
    }
    dateDraft = null;
  });
  for (const field of ['author', 'committer'] as const) {
    $(`date-tab-${field}`).addEventListener('click', () => {
      dateTab = field;
      if (!dateDraft) dateDraft = copyDateFilter(dateFilter);
      fillDates();
      $('date-list').scrollTop = 0;
    });
  }
  $('date-q').addEventListener('input', () => fillDates());
  $('date-show-all').addEventListener('change', (e) => {
    if (!snap) return;
    if (!dateDraft) dateDraft = copyDateFilter(dateFilter);
    const buckets = dateBuckets(snap.commits, dateTab);
    dateDraft = (e.target as HTMLInputElement).checked ? showAllMonths(dateDraft, dateTab) : hideAllMonths(dateDraft, dateTab, buckets);
    fillDates();
  });
  $('date-list').addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    if (!snap || (!box.dataset.month && !box.dataset.year)) return;
    if (!dateDraft) dateDraft = copyDateFilter(dateFilter);
    const shown = filterBuckets(dateBuckets(snap.commits, dateTab), $('date-q').value);
    if (box.dataset.month) dateDraft = hideMonth(dateDraft, dateTab, box.dataset.month, !box.checked);
    else {
      const year = shown.find((item) => String(item.year) === box.dataset.year);
      if (year) dateDraft = hideYear(dateDraft, dateTab, year, !box.checked);
    }
    fillDates();
  });
  $('date-ok').addEventListener('click', applyDateFilter);
  $('pop-dates').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || (ev.target as HTMLElement).id === 'date-ok') return;
    ev.preventDefault();
    applyDateFilter();
  });
  $('pop-contributor').addEventListener('toggle', (ev) => {
    if ((ev as ToggleEvent).newState === 'open') {
      personDraft = copyPersonFilter(personFilter);
      $('person-q').value = '';
      fillPeople();
      $('person-q').focus();
      return;
    }
    personDraft = null;
  });
  for (const field of ['author', 'committer'] as const) {
    $(`person-tab-${field}`).addEventListener('click', () => {
      personTab = field;
      if (!personDraft) personDraft = copyPersonFilter(personFilter);
      fillPeople();
      $('person-list').scrollTop = 0;
    });
  }
  $('person-q').addEventListener('input', () => fillPeople());
  $('person-show-all').addEventListener('change', (e) => {
    if (!snap) return;
    if (!personDraft) personDraft = copyPersonFilter(personFilter);
    const buckets = personBuckets(snap.commits, personTab);
    personDraft = (e.target as HTMLInputElement).checked ? showAllPeople(personDraft, personTab) : hideAllPeople(personDraft, personTab, buckets);
    fillPeople();
  });
  $('person-list').addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    if (box.dataset.name == null || !snap) return;
    if (!personDraft) personDraft = copyPersonFilter(personFilter);
    personDraft = hidePerson(personDraft, personTab, personKey(box.dataset.name, box.dataset.email ?? ''), !box.checked);
    fillPeople();
  });
  $('person-ok').addEventListener('click', applyPersonFilter);
  $('person-activity').addEventListener('click', () => {
    $('pop-contributor').hidePopover?.();
    post({ type: 'openContributors' });
  });
  $('pop-contributor').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || (ev.target as HTMLElement).id === 'person-ok' || (ev.target as HTMLElement).id === 'person-activity') return;
    if ((ev.target as HTMLElement).closest('.ref-tabs')) return;
    ev.preventDefault();
    applyPersonFilter();
  });
  $('scroll').addEventListener('scroll', () => {
    scheduleViewportPaint();
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
    const foldBtn = t.closest<HTMLElement>('.chip-fold');
    if (foldBtn) {
      const pair = foldBtn.closest<HTMLElement>('.chip-pair');
      const branch = pair?.dataset.fold;
      const hash = foldBtn.closest<HTMLElement>('.row')?.dataset.hash;
      if (branch && hash) setRemoteLabelsExpanded(hash, branch, false);
      return;
    }
    const chip = t.closest<HTMLElement>('.chip');
    if (chip) {
      const pair = chip.closest<HTMLElement>('.chip-pair.collapsed');
      if (pair && chip.classList.contains('remote') && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
        const branch = pair.dataset.fold;
        const hash = chip.closest<HTMLElement>('.row')?.dataset.hash;
        if (branch && hash) setRemoteLabelsExpanded(hash, branch, true);
        return;
      }
      if (wantsNestedFolderToggle(ev, macPlatform())) {
        if (togglePickedBranch(chip)) paint();
        return;
      }
      if (ev.detail === 2) {
        if (chip.classList.contains('remote') && performance.now() - remoteLabelsExpandedAt < 400) return;
        checkoutChip(chip);
      }
      return;
    }
    const row = t.closest<HTMLElement>('.row');
    if (!row?.dataset.hash) return;
    const hash = row.dataset.hash;
    if (!snap) return;
    const clearPicked = pickedBranches.length > 0;
    if (clearPicked) pickedBranches = [];
    if (ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      const anchor = rangeAnchor && snap.commits.some((commit) => commit.hash === rangeAnchor) ? rangeAnchor : selected;
      commitRange = anchor && anchor !== hash ? displayedRange(snap.commits, anchor, hash) : [hash];
      if (!rangeAnchor) rangeAnchor = hash;
      selected = hash;
      clearCompare();
      if (!details || details.hash !== hash || details.compare) post({ type: 'openRow', hash });
      persistView();
      paint();
      return;
    }
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      if (hash === UNCOMMITTED) {
        const base = commitRange.length === 1 ? commitRange[0] : commitRange.length === 0 ? selected : null;
        if (base && base !== UNCOMMITTED) {
          commitRange = [];
          selected = base;
          compare = hash;
          compareAnchor = undefined;
          post({ type: 'compare', a: base, b: compare });
          persistView();
          paint();
        }
        return;
      }
      const next = toggleCommitSelection(commitRange, hash, commitRange.length === 0 ? selected : null);
      rangeAnchor = hash;
      showCtrlSelection(next);
      return;
    }
    if (details && (hash === selected || hash === compare)) {
      selected = null;
      rangeAnchor = null;
      commitRange = [];
      clearCompare();
      details = null;
      post({ type: 'openRow', hash: null });
    } else {
      selected = hash!;
      rangeAnchor = hash!;
      commitRange = [];
      clearCompare();
      post({ type: 'openRow', hash: selected });
    }
    persistView();
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
    else if (vis('commit', 'applyPatch')) {
      ctxCommit = null;
      ctxRef = null;
      ctxFile = null;
      ctxFolder = null;
      openCtx(btn('apply-patch', 'Apply patch'), ev.clientX, ev.clientY);
    }
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
      if (findDiffTimer) clearTimeout(findDiffTimer);
      scheduleFind(dir);
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
  const postAutoFetch = () => {
    const enabled = $('s-auto-fetch').checked;
    $('s-auto-fetch-interval').disabled = !enabled;
    const interval = Math.max(15, Math.round(Number($('s-auto-fetch-interval').value) || 180));
    $('s-auto-fetch-interval').value = String(interval);
    post({ type: 'setAutoFetch', enabled, interval });
  };
  $('s-auto-fetch').addEventListener('change', postAutoFetch);
  $('s-auto-fetch-interval').addEventListener('change', postAutoFetch);
  $('s-undo-preview').addEventListener('change', () => {
    post({ type: 'setUndoPreview', value: $('s-undo-preview').checked });
  });
  $('add-lane').addEventListener('click', () => lanePriorityDialog('Add lane priority', '', ''));
  $('lane-list').addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-lane-ed], [data-lane-del]');
    if (!t || !snap) return;
    ev.stopPropagation();
    const index = Number(t.dataset.laneEd ?? t.dataset.laneDel);
    const rule = snap.config.lanePriority[index];
    if (!rule) return;
    if (t.dataset.laneEd != null) {
      lanePriorityDialog('Edit lane priority', rule.pattern, String(rule.priority), rule.pattern);
      return;
    }
    const r = t.getBoundingClientRect();
    showConfirmTip(`Delete lane priority "${rule.pattern}"?`, () => {
      if (!snap) return;
      post({ type: 'setLanePriority', priorities: lanePriorityToSetting(removeLanePriority(snap.config.lanePriority, rule.pattern)) });
    }, r.left, r.bottom + 4);
  });
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
  document.addEventListener(
    'pointerdown',
    (ev) => {
      const folder = summaryFolder(ev.target);
      summaryPointer = folder ? { folder, open: folder.open } : null;
    },
    true,
  );
  document.addEventListener(
    'click',
    (ev) => {
      if (!wantsNestedFolderToggle(ev, macPlatform())) return;
      const folder = summaryFolder(ev.target);
      if (!folder) return;
      ev.preventDefault();
      ev.stopPropagation();
      const openBefore = summaryPointer?.folder === folder ? summaryPointer.open : folder.open;
      toggleNestedFolders(folder, openBefore);
    },
    true,
  );
  document.addEventListener('contextmenu', (ev) => {
    if (!details) return;
    const file = eventElement(ev.target)?.closest<HTMLElement>('.file') ?? null;
    if (file) {
      ev.preventDefault();
      ctxFolder = null;
      ctxFile = { path: file.dataset.path ?? '', oldPath: file.dataset.old || undefined };
      openCtx(fileMenu(ctxFile.path), ev.clientX, ev.clientY);
      return;
    }
    const folder = treeFolder(ev.target);
    if (!folder) return;
    ev.preventDefault();
    ctxFolder = folder;
    ctxFile = null;
    ctxCommit = null;
    ctxRef = null;
    openCtx(FOLDER_MENU.map((item) => btn(item.id, item.label)).join(''), ev.clientX, ev.clientY);
  });
  bindPopoverAnchor('btn-refs', 'pop-refs');
  bindRefsPopoverResize();
  bindPopoverAnchor('btn-dates', 'pop-dates');
  bindPopoverAnchor('btn-contributor', 'pop-contributor');
  bindPopoverAnchor('btn-graph', 'pop-graph');
  bindPopoverAnchor('btn-settings', 'pop-settings');
  bindPopoverAnchor('btn-find', 'pop-find');
  bindPopoverAnchor('btn-date', 'pop-date');
  bindPopoverAnchor('btn-repo-help', 'pop-repo-help', { align: 'left', maxWidth: 400 });
  document.addEventListener('pointerdown', (ev) => {
    const tip = document.getElementById('lc-tip');
    if (tip?.matches(':popover-open')) {
      const node = ev.target as Node;
      if (!tip.contains(node) && !document.getElementById('lc-help')?.contains(node)) hideLabelColourTip();
    }
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
  $('btn-graph').addEventListener('click', () => {
    const pop = $('pop-graph');
    if (pop.matches(':popover-open')) pop.hidePopover?.();
    else {
      $('pop-settings').hidePopover?.();
      pop.showPopover?.();
    }
  });
  $('btn-settings').addEventListener('click', () => {
    const pop = $('pop-settings');
    if (pop.matches(':popover-open')) pop.hidePopover?.();
    else {
      $('pop-graph').hidePopover?.();
      pop.showPopover?.();
    }
  });
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => {
    syncHeaderScroll();
    repositionOpenAnchoredPopovers();
    const dlg = $('dlg-git') as unknown as HTMLDialogElement;
    if (gitDialogAt && dlg.open) placeCursorDialog(dlg, gitDialogAt);
  });
  bindColResize();
  bindSashes();
  bindDialogs();
  const graphHead = document.querySelector('#head .h.graph');
  if (graphHead) new ResizeObserver(() => syncGraphClip()).observe(graphHead);
  new ResizeObserver(() => {
    syncHeaderScroll();
    syncGraphClip();
    repositionOpenAnchoredPopovers();
  }).observe($('board'));
  syncHeaderScroll();
}

function postRayCat(): void {
  const count = Math.max(1, Math.min(10, Math.round(Number($('s-raycat-count').value) || 1)));
  $('s-raycat-count').value = String(count);
  const enabled = $('s-raycat').checked;
  $('s-raycat-count').disabled = !enabled;
  syncRayCats($('ray-cats'), enabled, count);
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

function scheduleFind(dir = 0): void {
  findPendingDir = dir;
  if (findDiffTimer) clearTimeout(findDiffTimer);
  const q = $('find-q').value;
  const err = $('find-err');
  if (!q) {
    findHits = [];
    findIndexes = [];
    findTruncated = false;
    findPendingHash = null;
    err.hidden = true;
    $('find-count').textContent = formatFindCount(0, 0, false);
    paint();
    return;
  }
  if (findPressed('find-regex') && !compileFindRegex(q, !findPressed('find-case'))) {
    findHits = [];
    findIndexes = [];
    err.hidden = false;
    err.textContent = 'Invalid regular expression';
    $('find-count').textContent = formatFindCount(0, 0);
    paint();
    return;
  }
  err.hidden = true;
  findDiffTimer = setTimeout(() => requestFind(), dir === 0 ? 280 : 0);
}

function requestFind(): void {
  const q = $('find-q').value;
  if (!q) return;
  findRequest = String(++findSeq);
  post({
    type: 'findCommits',
    requestId: findRequest,
    pattern: q,
    ignoreCase: !findPressed('find-case'),
    regex: findPressed('find-regex'),
    diff: findPressed('find-diff'),
  });
}

function showFindPosition(dir: number): void {
  if (!findHits.length) {
    $('find-count').textContent = formatFindCount(0, 0);
    paint();
    return;
  }
  if (dir === 0) findI = Math.min(findI, findHits.length - 1);
  else findI = (findI + dir + findHits.length) % findHits.length;
  $('find-count').textContent = formatFindCount(findI + 1, findHits.length, true, findTruncated);
  paint();
  if (dir === 0) return;
  jumpToFindHash(findHits[findI]!, findIndexes[findI] ?? -1);
}

function jumpToFindHash(hash: string, index: number): void {
  if (!snap) return;
  if (snap.commits.some((commit) => commit.hash === hash)) {
    findPendingHash = null;
    selected = hash;
    scrollToHash(hash);
    persistView();
    return;
  }
  findPendingHash = hash;
  post({ type: 'loadUntil', hash, index });
}

function continueFindJump(): void {
  if (!findPendingHash || !snap) return;
  if (!snap.commits.some((commit) => commit.hash === findPendingHash)) {
    if (!snap.hasMore) {
      findPendingHash = null;
      const err = $('find-err');
      err.hidden = false;
      err.textContent = 'That commit is outside the loaded history.';
    }
    return;
  }
  const hash = findPendingHash;
  findPendingHash = null;
  selected = hash;
  scrollToHash(hash);
  persistView();
}

function runFind(dir: number): void {
  if (!snap) return;
  const q = $('find-q').value;
  if (!q) {
    scheduleFind(0);
    return;
  }
  if (findPressed('find-regex') && !compileFindRegex(q, !findPressed('find-case'))) {
    scheduleFind(0);
    return;
  }
  if (!findHits.length) {
    scheduleFind(dir);
    return;
  }
  showFindPosition(dir);
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
    const popoverOpen = ['pop-graph', 'pop-settings', 'pop-ctx', 'pop-find', 'pop-date', 'pop-refs', 'pop-dates', 'pop-contributor', 'pop-repo-help'].some((id) =>
      $(id).matches(':popover-open'),
    );
    $('pop-graph').hidePopover?.();
    $('pop-settings').hidePopover?.();
    $('pop-ctx').hidePopover?.();
    $('pop-find').hidePopover?.();
    $('pop-date').hidePopover?.();
    $('pop-refs').hidePopover?.();
    $('pop-dates').hidePopover?.();
    $('pop-contributor').hidePopover?.();
    $('pop-repo-help').hidePopover?.();
    if (!popoverOpen && (pickedBranches.length || commitRange.length)) {
      pickedBranches = [];
      commitRange = [];
      rangeAnchor = null;
      paint();
      return;
    }
    if (details) {
      details = null;
      selected = null;
      clearCompare();
      post({ type: 'openRow', hash: null });
      persistView();
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
    const commitIndex = snap.commits.findIndex((c) => c.hash === selected);
    const visible = shownCommits();
    let pos = visible.indexOf(commitIndex);
    let nextIndex: number | undefined;
    if (pos < 0) {
      nextIndex = dir > 0 ? visible.find((index) => index > commitIndex) : [...visible].reverse().find((index) => index < commitIndex);
    } else {
      nextIndex = visible[pos + dir];
    }
    if (nextIndex == null) return;
    const next = snap.commits[nextIndex];
    if (!next) return;
    selected = next.hash;
    rangeAnchor = next.hash;
    commitRange = [];
    persistView();
    clearCompare();
    post({ type: 'openRow', hash: selected });
    paint();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === 'z') {
    const target = ev.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('dialog[open]')) return;
    ev.preventDefault();
    requestHistory(ev.shiftKey ? 'redo' : 'undo');
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

function runPlan(plan: ReturnType<typeof startCheckoutFromRef>, at?: { x: number; y: number }): void {
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
      at,
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
                noFastForward: snap!.config.dialogs.pullRebase ? false : snap!.config.dialogs.pullNoFastForward,
                rebase: snap!.config.dialogs.pullRebase,
                squash: snap!.config.dialogs.pullRebase ? false : snap!.config.dialogs.pullSquash,
                squashMessageFormat: snap!.config.dialogs.pullSquashMessageFormat,
              }
            : undefined,
        });
      },
      at,
    );
  }
}

function togglePickedBranch(chip: HTMLElement): boolean {
  if (chip.dataset.kind !== 'head' || !chip.dataset.name || chip.dataset.name === 'HEAD') return false;
  const name = chip.dataset.name;
  const index = pickedBranches.indexOf(name);
  if (index >= 0) pickedBranches.splice(index, 1);
  else pickedBranches.push(name);
  return true;
}

function rebaseSelectionBlock(): string | undefined {
  if (snap?.operation) return 'A Git operation is already in progress';
  if (snap?.commits.some((commit) => commit.hash === UNCOMMITTED)) return 'Commit or stash changes first';
  return undefined;
}

function selectedRebaseState(ontoBranch?: string): { count: number; disabledReason?: string } | undefined {
  const branches = rebaseTargetBranches(pickedBranches, ontoBranch);
  if (!branches.length) return undefined;
  return { count: branches.length, disabledReason: rebaseSelectionBlock() };
}

function openSelectedRebase(ev: Event): void {
  if (!snap || rebaseSelectionBlock()) return;
  const spec = rebaseTargetSpec();
  if (!spec) return;
  const branches = rebaseTargetBranches(pickedBranches, spec.drop);
  if (!branches.length) return;
  const d = snap.config.dialogs;
  gitDialog(
    'Rebase',
    rebaseBranchesDialogHtml({ onto: spec.label, branches, ignoreDate: d.rebaseIgnoreDate }),
    () => {
      const body = $('git-body');
      sendGit({
        kind: 'rebaseBranches',
        onto: spec.onto,
        branches,
        ignoreDate: (document.getElementById('id') as HTMLInputElement).checked,
        checkout: parseRebaseCheckout(body.querySelector<HTMLInputElement>('input[name="rb-co"]:checked')?.value),
        onFailure: parseRebaseOnFailure(body.querySelector<HTMLInputElement>('input[name="rb-fail"]:checked')?.value),
      });
    },
    clickPoint(ev),
  );
}

function rebaseTargetSpec(): { label: string; onto: string; drop?: string } | null {
  if (ctxCommit && ctxCommit.hash !== UNCOMMITTED) {
    const hash = ctxCommit.hash;
    return { label: hash.slice(0, 7), onto: hash };
  }
  const ref = ctxRef;
  if (!ref || (ref.kind !== 'head' && ref.kind !== 'remote' && ref.kind !== 'tag') || !ref.name || ref.name === 'HEAD') return null;
  return {
    label: ref.name,
    onto: rebaseRevision(ref.kind, ref.name),
    drop: ref.kind === 'head' ? ref.name : undefined,
  };
}

function interactiveRebaseRef(): string | null {
  if (ctxCommit && ctxCommit.hash !== UNCOMMITTED) return ctxCommit.hash;
  const ref = ctxRef;
  if (!ref || (ref.kind !== 'head' && ref.kind !== 'remote' && ref.kind !== 'tag') || !ref.name || ref.name === 'HEAD') return null;
  if (ref.kind === 'head' && ref.name === snap?.currentBranch) return null;
  return rebaseRevision(ref.kind, ref.name);
}

function menuRef(chip: HTMLElement, x: number, y: number): void {
  ctxFolder = null;
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
    ctxCommit = null;
    ctxFile = null;
    ctxRef = { kind: 'tag', name, hash: chip.dataset.hash ?? '' };
    openCtx(
      menuHtml(
        tagMenuEntries({
          visible: (id) => vis('tag', id),
          selectedRebase: selectedRebaseState(),
        }),
      ),
      x,
      y,
    );
    return;
  } else if (kind === 'head') {
    if (name === 'HEAD') items.push(btn('copy', 'Copy name'));
    else {
      ctxCommit = null;
      ctxFile = null;
      ctxRef = { kind: kind as GraphRef['kind'], name, hash: chip.dataset.hash ?? '', remote: chip.dataset.remote, worktreePath: chip.dataset.wt };
      openCtx(
        menuHtml(
          branchMenuEntries({
            current: name === snap?.currentBranch,
            withHead: canCompareWithHead(chip.dataset.hash ?? ''),
            visible: (id) => vis('branch', id),
            selectedRebase: selectedRebaseState(name),
          }),
        ),
        x,
        y,
      );
      return;
    }
  } else if (kind === 'remote') {
    ctxCommit = null;
    ctxFile = null;
    ctxRef = { kind: 'remote', name, hash: chip.dataset.hash ?? '', remote: chip.dataset.remote };
    openCtx(
      menuHtml(
        remoteMenuEntries({
          withHead: canCompareWithHead(chip.dataset.hash ?? ''),
          visible: (id) => vis('remote', id),
          selectedRebase: selectedRebaseState(),
        }),
      ),
      x,
      y,
    );
    return;
  }
  ctxCommit = null;
  ctxFile = null;
  ctxRef = { kind: kind as GraphRef['kind'], name, hash: chip.dataset.hash ?? '', remote: chip.dataset.remote, worktreePath: chip.dataset.wt };
  openCtx(items.join(''), x, y);
}

function menuCommit(hash: string, x: number, y: number): void {
  ctxFolder = null;
  const c = snap?.commits.find((x) => x.hash === hash);
  if (!c || !snap) return;
  ctxCommit = c;
  ctxRef = null;
  ctxFile = null;
    if (hash === UNCOMMITTED) {
    const items: string[] = [];
    if (vis('uncommitted', 'stash')) items.push(btn('u-st', 'Stash'));
    if (vis('uncommitted', 'patch')) items.push(btn('u-patch', 'Create patch'));
    if (vis('uncommitted', 'applyPatch')) items.push(btn('apply-patch', 'Apply patch'));
    if (vis('uncommitted', 'reset')) items.push(btn('u-rs', 'Reset'));
    if (vis('uncommitted', 'clean')) items.push(btn('u-cl', 'Clean'));
    if (vis('uncommitted', 'scm')) items.push(btn('u-scm', 'Open SCM'));
    openCtx(items.join(''), x, y);
    return;
  }
  openCtx(
    `${menuHtml(
      commitMenuEntries({
        canReword: gitAtLeast(snap.config.gitMajorMinor, 2, 54),
        isMerge: c.parents.length > 1,
        withHead: canCompareWithHead(hash),
        visible: (id) => vis('commit', id),
        cherryPick: rangeCherryItem(hash),
        createPatch: rangePatchItem(hash),
        selectedRebase: selectedRebaseState(),
      }),
    )}`,
    x,
    y,
  );
}

function btn(id: string, label: string): string {
  return `<button type="button" data-act="${id}">${label}</button>`;
}

function onMenu(ev: Event): void {
  const id = (ev.target as HTMLElement).dataset.act;
  if (!id) return;
  $('pop-ctx').hidePopover?.();
  const folderItem = FOLDER_MENU.find((item) => item.id === id);
  if (folderItem?.action) {
    const folder = ctxFolder;
    if (folder?.isConnected) applyFolderFold(folder, folderFoldPlan(folder.open, folderItem.action));
    return;
  }
  if (folderItem?.command && ctxFolder) {
    const rel = ctxFolder.dataset.path ?? '';
    if (folderItem.command === 'copy-path') {
      post({ type: 'copy', text: rel });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    } else if (folderItem.command === 'copy-full-path') {
      post({ type: 'copy', text: joinRepoPath(rel) });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }     else post({ type: 'openFolder', path: rel });
    return;
  }
  if (id === 'apply-patch' || id === 'c-apply') {
    void startApplyPatch();
    return;
  }
  if (!snap) return;
  if (id === 'cmp' || id === 'cmp-head') {
    const base = ctxCommit?.hash ?? ctxRef?.hash ?? '';
    if (id === 'cmp') openCompareDialog(base);
    else if (snap.head) startCompare(base, snap.head);
    return;
  }
  const d = snap.config.dialogs;
  const sp = d.spaceSubstitution;
  const act = (a: GitAction) => sendGit(a);
  if (id === 'rbi') {
    const ref = interactiveRebaseRef();
    if (ref) act({ kind: 'rebase', ref, ignoreDate: false, interactive: true });
    return;
  }
  if (id === 'br-rbs') {
    openSelectedRebase(ev);
    return;
  }
  if (ctxRef) {
    const r = ctxRef;
    if (id === 'copy') {
      post({ type: 'copy', text: r.name });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'ref-colour') openLabelColourDialog(r, clickPoint(ev));
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
      showConfirmTip(`Delete tag ${r.name}?`, () => {
        rayCatDeleteTag(r.name);
        act({ kind: 'deleteTag', name: r.name });
      }, p.x, p.y);
    }
    if (id === 'tag-push') {
      gitDialog('Push tag', pushTagDialogHtml(snap.remotes.map((x) => x.name)), () => {
        const remotes = selectedPushRemotes();
        if (!remotes.length) return;
        act({ kind: 'pushTag', name: r.name, remotes });
      });
      watchRemoteTags(r.hash, r.name);
    }
    if (id === 'br-co') runPlan({ kind: 'local', name: r.name });
    if (id === 'br-rn') gitDialog('Rename', `<input id="nn" value="${esc(r.name)}" />`, () => {
      const newName = applySpaceSubstitution((document.getElementById('nn') as HTMLInputElement).value, sp);
      rayCatRenameBranch(r.name, newName);
      act({ kind: 'renameBranch', oldName: r.name, newName });
    }, clickPoint(ev));
    if (id === 'br-del') {
      const p = clickPoint(ev);
      const requestId = String(++deleteBranchSeq);
      deleteBranchReq = requestId;
      deleteBranchMerge = 'pending';
      gitDialog(
        'Delete branch',
        deleteBranchDialogHtml(d.deleteBranchForce),
        () => {
          rayCatBurnBranch(r.name);
          act({ kind: 'deleteBranch', name: r.name, force: (document.getElementById('fr') as HTMLInputElement).checked });
        },
        p,
      );
      post({ type: 'branchMerged', requestId, name: r.name });
    }
    if (id === 'br-mg') {
      const p = clickPoint(ev);
      gitDialog('Merge', mergeBody(r.name), () => act({ kind: 'merge', ref: r.name, noCommit: val('nc'), noFastForward: val('nff'), squash: val('sq'), squashMessageFormat: d.mergeSquashMessageFormat }), p);
    }
    if (id === 'br-rb') gitDialog('Rebase', rebaseBody(r.name, d.rebaseInteractive), () => act({ kind: 'rebase', ref: r.name, ignoreDate: (document.getElementById('id') as HTMLInputElement).checked, interactive: (document.getElementById('ir') as HTMLInputElement).checked }), clickPoint(ev));
    if (id === 'br-ps') {
      gitDialog('Push branch', pushBranchDialogHtml(snap.remotes.map((x) => x.name)), () => {
        const remotes = selectedPushRemotes();
        if (!remotes.length) return;
        rayCatPushBranch(r.name);
        act({
          kind: 'pushBranch',
          name: r.name,
          remotes,
          setUpstream: (document.getElementById('su') as HTMLInputElement).checked,
          mode: parsePushMode($('git-body').querySelector<HTMLInputElement>('input[name="pm"]:checked')?.value),
        });
      }, clickPoint(ev));
    }
    if (id === 'rm-mg') {
      const p = clickPoint(ev);
      gitDialog('Merge', mergeBody(r.name), () => act({ kind: 'merge', ref: rebaseRevision('remote', r.name), noCommit: val('nc'), noFastForward: val('nff'), squash: val('sq'), squashMessageFormat: d.mergeSquashMessageFormat }), p);
    }
    if (id === 'rm-rb') {
      gitDialog(
        'Rebase',
        rebaseBody(r.name, d.rebaseInteractive),
        () =>
          act({
            kind: 'rebase',
            ref: rebaseRevision('remote', r.name),
            ignoreDate: (document.getElementById('id') as HTMLInputElement).checked,
            interactive: (document.getElementById('ir') as HTMLInputElement).checked,
          }),
        clickPoint(ev),
      );
    }
    if (id === 'rm-co') runPlan(decideNamedRemoteCheckout(snap.commits, r.name, r.name.slice(r.name.indexOf('/') + 1), r.hash, snap.currentBranch), clickPoint(ev));
    if (id === 'rm-del') {
      const p = clickPoint(ev);
      showConfirmTip(`Delete remote branch ${r.name}?`, () => act({ kind: 'deleteRemoteBranch', remote: r.remote ?? r.name.split('/')[0]!, name: r.name }), p.x, p.y);
    }
    if (id === 'rm-fi') act({ kind: 'fetchIntoLocal', local: r.name.slice(r.name.indexOf('/') + 1), remoteRef: r.name, force: d.fetchIntoLocalForce });
    if (id === 'rm-pl') {
      const remote = r.remote ?? 'origin';
      const branch = r.name.slice(r.name.indexOf('/') + 1);
      gitDialog(
        'Pull',
        `<p>Pull <code>${esc(remote)}/${esc(branch)}</code></p>${pullDialogHtml(d)}`,
        () => {
          const rebase = val('rb');
          rayCatPull(r.name);
          act({
            kind: 'pullBranch',
            remote,
            branch,
            rebase,
            noFastForward: rebase ? false : val('nff'),
            squash: rebase ? false : val('sq'),
            squashMessageFormat: d.pullSquashMessageFormat,
          });
        },
        clickPoint(ev),
      );
      bindPullMode();
    }
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
    if (id === 'u-patch') void saveWorktreePatch();
    if (id === 'u-rs') act({ kind: 'reset', hash: 'HEAD', mode: d.resetUncommittedMode.toLowerCase() as 'mixed' | 'hard' });
    if (id === 'u-cl') {
      const p = clickPoint(ev);
      showConfirmTip('Delete untracked files?', () => act({ kind: 'cleanUntracked', directories: true }), p.x, p.y);
    }
    if (id === 'u-scm') act({ kind: 'openScm' });
    if (id === 'c-tag') {
      gitDialog(
        'Add tag',
        addTagDialogHtml(snap.remotes.map((x) => x.name), {
          annotated: d.addTagType === 'Annotated',
          pushToRemote: d.addTagPushToRemote,
        }),
        () => {
          const remotes = selectedPushRemotes();
          const name = applySpaceSubstitution((document.getElementById('tn') as HTMLInputElement).value, sp);
          rayCatAddTag(c.hash, name);
          act({
            kind: 'addTag',
            hash: c.hash,
            name,
            annotated: (document.getElementById('an') as HTMLInputElement).checked,
            ...(remotes.length ? { pushTo: remotes } : {}),
          });
        },
        clickPoint(ev),
      );
      watchRemoteTags(c.hash, null);
    }
    if (id === 'c-br') {
      const p = clickPoint(ev);
      gitDialog('Create branch', `<input id="bn" /><label><input type="checkbox" id="co" ${d.createBranchCheckOut ? 'checked' : ''}/> checkout</label>`, () => {
        const name = applySpaceSubstitution((document.getElementById('bn') as HTMLInputElement).value, sp);
        const checkout = (document.getElementById('co') as HTMLInputElement).checked;
        rayCatCreateBranch(c.hash, name, checkout);
        act({ kind: 'createBranch', hash: c.hash, name, checkout });
      }, p);
    }
    if (id === 'c-co') act({ kind: 'checkoutCommit', hash: c.hash });
    if (id === 'c-cp') openCherryDialog(c, clickPoint(ev));
    if (id === 'c-patch') void saveCommitPatch(c);
    if (id === 'c-rv') gitDialog('Revert', 'Revert this commit?', () => act({ kind: 'revert', hash: c.hash }), clickPoint(ev));
    if (id === 'c-dr') {
      const p = clickPoint(ev);
      showConfirmTip('Drop this commit and rewrite history?', () => act({ kind: 'dropCommit', hash: c.hash }), p.x, p.y, 'Drop');
    }
    if (id === 'c-mg') {
      const p = clickPoint(ev);
      gitDialog('Merge', mergeBody(c.hash.slice(0, 7)), () => act({ kind: 'merge', ref: c.hash, noCommit: val('nc'), noFastForward: val('nff'), squash: val('sq'), squashMessageFormat: d.mergeSquashMessageFormat }), p);
    }
    if (id === 'c-rb') gitDialog('Rebase', rebaseBody(c.hash.slice(0, 7)), () => act({ kind: 'rebase', ref: c.hash, ignoreDate: (document.getElementById('id') as HTMLInputElement).checked, interactive: false }), clickPoint(ev));
    if (id === 'c-rs') gitDialog('Reset', 'Reset current branch?', () => act({ kind: 'reset', hash: c.hash, mode: d.resetBranchMode.toLowerCase() as 'soft' | 'mixed' | 'hard' }), clickPoint(ev));
    if (id === 'c-wt') {
      const main = snap.mainWorktreePath || snap.repoPath;
      const rid = 'p' + Date.now();
      gitDialog(
        'Create worktree',
        worktreeDialogHtml({
          location: defaultWorktreeLocation(main),
          name: suggestedWorktreeFolder(c.refs, c.hash, snap.currentBranch),
          requestId: rid,
        }),
        () => {
          const loc = (document.getElementById('wt-loc') as HTMLInputElement).value;
          const folder = (document.getElementById('wt-name') as HTMLInputElement).value;
          const state = worktreeFormState(loc, folder, main);
          if (!state.canCreate) return;
          act({ kind: 'worktreeAdd', hash: c.hash, path: state.destination });
        },
        clickPoint(ev),
      );
      document.getElementById('wt-browse')?.addEventListener('click', () => {
        const loc = (document.getElementById('wt-loc') as HTMLInputElement).value;
        post({ type: 'pickFolder', requestId: rid, defaultPath: loc });
      });
      syncWorktreeForm();
      const nameInput = document.getElementById('wt-name') as HTMLInputElement | null;
      nameInput?.focus();
      nameInput?.select();
    }
    if (id === 'c-rw') gitDialog('Reword', `<textarea id="msg">${esc(c.subject)}</textarea>`, () => act({ kind: 'reword', hash: c.hash, message: (document.getElementById('msg') as HTMLTextAreaElement).value }), clickPoint(ev));
  }
  if (ctxFile && details) {
    if (id === 'f-diff') postDiff(ctxFile);
    if (id === 'f-open') post({ type: 'openWorkFile', path: ctxFile.path });
    if (id === 'f-blob') post({ type: 'showBlob', hash: details.hash === '*' ? 'HEAD' : details.hash, path: ctxFile.path });
    if (id === 'f-history') post({ type: 'setHistoryPath', path: ctxFile.path });
    if (id === 'f-blame') post({ type: 'blame', path: ctxFile.path });
    if (id === 'f-copy') {
      post({ type: 'copy', text: ctxFile.path });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'f-copy-full') {
      post({ type: 'copy', text: joinRepoPath(ctxFile.path) });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'f-stash') stashSelected(ctxFiles, clickPoint(ev));
    if (id === 'f-patch') void saveFilePatch(ctxFiles);
  }
}

function showCtrlSelection(hashes: string[]): void {
  commitRange = hashes;
  if (hashes.length >= 3) {
    selected = null;
    clearCompare();
    details = null;
    post({ type: 'openRow', hash: null });
  } else if (hashes.length === 2) {
    selected = hashes[0]!;
    compare = hashes[1]!;
    compareAnchor = undefined;
    post({ type: 'compare', a: hashes[0]!, b: hashes[1]! });
  } else if (hashes.length === 1) {
    selected = hashes[0]!;
    clearCompare();
    post({ type: 'openRow', hash: selected });
  } else {
    selected = null;
    clearCompare();
    details = null;
    post({ type: 'openRow', hash: null });
  }
  persistView();
  paint();
}

/** Drop a details reply that belongs to an earlier selection. */
function acceptDetails(payload: CommitDetails | null): boolean {
  if (commitRange.length >= 3) return !payload;
  if (commitRange.length === 2) {
    if (!payload?.compare) return false;
    const pair = new Set(commitRange);
    return pair.has(payload.hash) && pair.has(payload.compare);
  }
  if (commitRange.length === 1) return !payload || (payload.hash === commitRange[0] && !payload.compare);
  return true;
}

function rangePlan(hash: string): ReturnType<typeof cherryPickPlan> | null {
  if (!snap || commitRange.length < 2 || !commitRange.includes(hash)) return null;
  return cherryPickPlan(snap.commits, commitRange);
}

function rangeCherryItem(hash: string): { id: string; label: string; disabled?: boolean; title?: string } | undefined {
  const plan = rangePlan(hash);
  if (!plan) return undefined;
  if (!plan.commits.length) return { id: 'c-cp', label: 'Cherry-pick', disabled: true, title: 'Merge commits cannot be cherry-picked as a range' };
  const count = plan.commits.length;
  return { id: 'c-cp', label: count === 1 ? 'Cherry-pick 1 commit' : `Cherry-pick ${count} commits` };
}

function rangePatchItem(hash: string): { id: string; label: string; disabled?: boolean; title?: string } | undefined {
  const plan = rangePlan(hash);
  if (!plan) return undefined;
  if (!plan.commits.length) return { id: 'c-patch', label: 'Create patch', disabled: true, title: 'Merge commits in the range are skipped' };
  const count = plan.commits.length;
  return count === 1 ? { id: 'c-patch', label: 'Create patch' } : { id: 'c-patch', label: `Create patch for ${count} commits` };
}

function pullDialogHtml(d: GraphSnapshot['config']['dialogs']): string {
  return `<label><input type="checkbox" id="rb" ${d.pullRebase ? 'checked' : ''}/> rebase</label>
    <label><input type="checkbox" id="nff" ${d.pullNoFastForward && !d.pullRebase ? 'checked' : ''}/> no ff</label>
    <label><input type="checkbox" id="sq" ${d.pullSquash && !d.pullRebase ? 'checked' : ''}/> squash</label>`;
}

function bindPullMode(): void {
  const rebase = document.getElementById('rb') as HTMLInputElement | null;
  const noFf = document.getElementById('nff') as HTMLInputElement | null;
  const squash = document.getElementById('sq') as HTMLInputElement | null;
  if (!rebase || !noFf || !squash) return;
  const sync = () => {
    if (rebase.checked) {
      noFf.checked = false;
      squash.checked = false;
    }
    noFf.disabled = rebase.checked;
    squash.disabled = rebase.checked;
  };
  rebase.addEventListener('change', sync);
  for (const box of [noFf, squash]) {
    box.addEventListener('change', () => {
      if (box.checked) rebase.checked = false;
      sync();
    });
  }
  sync();
}

function fileMenu(clicked: string): string {
  const items = [
    btn('f-diff', 'Diff'),
    btn('f-open', 'Open file'),
    btn('f-blob', 'View at revision'),
    btn('f-history', 'File history'),
    btn('f-blame', 'Blame'),
    btn('f-copy', 'Copy path'),
    btn('f-copy-full', 'Copy Full Path'),
  ];
  if (!details || details.compare) return items.join('');
  const files = chosenFiles(clicked);
  ctxFiles = files;
  const count = files.length;
  items.push('<hr class="menu-sep" />');
  if (details.hash === UNCOMMITTED) {
    items.push(btn('f-stash', count > 1 ? `Stash ${count} files` : 'Stash this file'));
  }
  items.push(btn('f-patch', count > 1 ? `Create patch for ${count} files` : 'Create patch'));
  return items.join('');
}

function chosenFiles(clicked: string): { path: string; untracked: boolean }[] {
  const paths = pickedFiles.includes(clicked) ? pickedFiles : [clicked];
  const status = new Map((details?.files ?? []).map((file) => [file.path, file.status]));
  return paths.filter(Boolean).map((path) => ({ path, untracked: status.get(path) === 'U' }));
}

function togglePickedFile(path: string, shift: boolean): void {
  if (!path) return;
  if (shift && pickedFiles.length) {
    const paths = [...document.querySelectorAll<HTMLElement>('.file')].map((file) => file.dataset.path ?? '').filter(Boolean);
    const anchor = pickedFiles[pickedFiles.length - 1]!;
    const start = paths.indexOf(anchor);
    const end = paths.indexOf(path);
    if (start >= 0 && end >= 0) {
      const [from, to] = start <= end ? [start, end] : [end, start];
      pickedFiles = [...new Set([...pickedFiles, ...paths.slice(from, to + 1)])];
    } else if (!pickedFiles.includes(path)) pickedFiles.push(path);
  } else {
    const index = pickedFiles.indexOf(path);
    if (index >= 0) pickedFiles.splice(index, 1);
    else pickedFiles.push(path);
  }
  for (const file of document.querySelectorAll<HTMLElement>('.file')) {
    file.classList.toggle('picked', pickedFiles.includes(file.dataset.path ?? ''));
  }
}

function requestPick(kind: 'save' | 'open', opts: { title: string; defaultName?: string }): Promise<{ path: string | null; patchKind?: 'am' | 'apply' }> {
  const requestId = `pick${++pickSeq}`;
  return new Promise((resolve) => {
    pickWaiters.set(requestId, resolve);
    if (kind === 'save') post({ type: 'pickSaveFile', requestId, title: opts.title, defaultName: opts.defaultName ?? 'changes.patch' });
    else post({ type: 'pickOpenFile', requestId, title: opts.title });
  });
}

function patchBaseName(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return index >= 0 ? filePath.slice(index + 1) : filePath;
}

function commitsForPatch(commit: GraphCommit): { hash: string; parents: string[] }[] {
  const plan = rangePlan(commit.hash);
  if (plan?.commits.length) return plan.commits;
  return [{ hash: commit.hash, parents: commit.parents }];
}

function openCherryDialog(commit: GraphCommit, at: { x: number; y: number }): void {
  if (!snap) return;
  const plan = rangePlan(commit.hash);
  const picked = plan?.commits.length ? plan.commits : [{ hash: commit.hash, parents: commit.parents }];
  if (!picked.length) return;
  const subjects = new Map(snap.commits.map((row) => [row.hash, row.subject]));
  const rows = picked.map((row) => ({ hash: row.hash, subject: subjects.get(row.hash) ?? '' }));
  const skipped = plan?.skippedMerges ?? 0;
  const d = snap.config.dialogs;
  const list = rows.map((row) => `<li><code>${esc(row.hash.slice(0, 7))}</code> ${esc(row.subject)}</li>`).join('');
  const note = skipped ? `<p>${skipped} merge ${skipped === 1 ? 'commit is' : 'commits are'} skipped.</p>` : '';
  const heading = rows.length === 1 ? 'Cherry-pick this commit?' : `Cherry-pick ${rows.length} commits, oldest first?`;
  gitDialog(
    'Cherry-pick',
    `<p>${heading}</p>${note}<ul class="dlg-files">${list}</ul><label><input type="checkbox" id="nc" ${d.cherryPickNoCommit ? 'checked' : ''}/> no commit</label>`,
    () => {
      commitRange = [];
      rayCatCherryPick(commit.hash);
      sendGit({
        kind: 'cherryPick',
        hashes: rows.map((row) => row.hash),
        noCommit: (document.getElementById('nc') as HTMLInputElement).checked,
        recordOrigin: d.cherryPickRecordOrigin,
      });
    },
    at,
  );
}

async function saveCommitPatch(commit: GraphCommit): Promise<void> {
  const commits = commitsForPatch(commit);
  const name = commits.length === 1 ? patchFileName(commit.subject) : patchFileName(`${commits.length} commits`);
  const picked = await requestPick('save', { title: 'Create patch', defaultName: name });
  if (!picked.path) return;
  commitRange = [];
  sendGit({ kind: 'createCommitPatch', destination: picked.path, commits });
}

async function saveFilePatch(files: { path: string; untracked: boolean }[]): Promise<void> {
  if (!details || !files.length) return;
  const name = files.length === 1 ? patchFileName(patchBaseName(files[0]!.path).replace(/\.patch$/, '')) : patchFileName(`${files.length} files`);
  const picked = await requestPick('save', { title: 'Create patch', defaultName: name });
  if (!picked.path) return;
  if (details.hash === UNCOMMITTED) {
    sendGit({ kind: 'createWorktreePatch', destination: picked.path, files });
    return;
  }
  sendGit({
    kind: 'createFilePatch',
    destination: picked.path,
    hash: details.hash,
    parent: details.parents[0],
    paths: files.map((file) => file.path),
  });
}

async function saveWorktreePatch(): Promise<void> {
  const picked = await requestPick('save', { title: 'Create patch', defaultName: 'changes.patch' });
  if (!picked.path) return;
  sendGit({ kind: 'createWorktreePatch', destination: picked.path });
}

async function startApplyPatch(): Promise<void> {
  const picked = await requestPick('open', { title: 'Apply patch' });
  if (!picked.path) return;
  const file = picked.path;
  const commits = picked.patchKind === 'am';
  gitDialog(
    'Apply patch',
    `<p>Apply <code>${esc(patchBaseName(file))}</code></p><label><input type="checkbox" id="am" ${commits ? 'checked' : ''}/> Create commits</label>`,
    () => sendGit({ kind: 'applyPatch', file, commits: (document.getElementById('am') as HTMLInputElement).checked }),
  );
}

function stashSelected(files: { path: string }[], at: { x: number; y: number }): void {
  if (!files.length) return;
  const list = files.map((file) => `<li><code>${esc(file.path)}</code></li>`).join('');
  const heading = files.length === 1 ? 'Stash this file?' : `Stash ${files.length} files?`;
  gitDialog(
    'Stash',
    `<p>${heading}</p><ul class="dlg-files">${list}</ul><label class="dlg-field">Message <input id="sm" /></label>`,
    () => {
      const message = (document.getElementById('sm') as HTMLInputElement).value.trim();
      sendGit({ kind: 'stash', includeUntracked: true, paths: files.map((file) => file.path), ...(message ? { message } : {}) });
    },
    at,
  );
}

function mergeBody(from: string): string {
  const dialogs = snap!.config.dialogs;
  return mergeDialogHtml({
    into: snap!.currentBranch,
    from,
    noCommit: dialogs.mergeNoCommit,
    noFastForward: dialogs.mergeNoFastForward,
    squash: dialogs.mergeSquash,
  });
}

function rebaseBody(onto: string, interactive?: boolean): string {
  const dialogs = snap!.config.dialogs;
  return rebaseDialogHtml({
    onto,
    from: snap!.currentBranch,
    ignoreDate: dialogs.rebaseIgnoreDate,
    ...(interactive === undefined ? {} : { interactive }),
  });
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

if (document.body.dataset.page === 'contributors') {
  startContributorsPage(vscode);
} else {
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
}
