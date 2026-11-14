import { t } from '@vscode/l10n';
import { copyDateFilter, dateBuckets, emptyDateFilter, filterBuckets, hideAllMonths, hideMonth, hideYear, showAllMonths } from '../shared/dateFilter';
import { applySpaceSubstitution, defaultRepoSettings } from '../shared/dialogs';
import { folderMenu, wantsNestedFolderToggle } from '../shared/fileTree';
import { displayedRange, toggleCommitSelection } from '../shared/historyActions';
import { lanePriorityToSetting, removeLanePriority } from '../shared/layout';
import { copyPersonFilter, emptyPersonFilter, hideAllPeople, hidePerson, personBuckets, personKey, showAllPeople } from '../shared/personFilter';
import { hexToHsv, normalizeHex, refColoursToSetting, removeRefColour } from '../shared/refColours';
import { UNCOMMITTED } from '../shared/types';
import { startContributorsPage } from './contributors';
import { syncRayCats } from './rayCat';
import type { RepoSettings } from '../shared/dialogs';
import type { GraphSnapshot, HostToView } from '../shared/protocol';
import type { ColumnVisibility } from '../shared/types';
import { post, vscode, webviewState } from './host';
import { persistView, state } from './state';
import { $, btn, clearCompare, esc, eventElement, macPlatform, setColWidth, summaryFolder, syncGraphClip, syncHeaderScroll, treeFolder, vis } from './dom';
import { bindPopoverAnchor, bindRefsPopoverResize, openCtx, placePopover, repositionOpenAnchoredPopovers } from './popovers';
import { estimateFromDetails, paint, scheduleFitDetails, scheduleViewportPaint, toggleNestedFolders } from './paint';
import { applyDateFilter, applyFilter, applyPersonFilter, continueDateJump, continueRefJump, fillDates, fillHelp, fillLanePriority, fillPeople, fillPr, fillRefs, fillRemotes, fillRepos, hideRefJumpMiss, jumpToRef, scrollToHash, setRemoteLabelsExpanded, startDateJump, startFilterDraft, todayInputValue } from './refsUi';
import { continueFindJump, runFind, scheduleFind, showFindPosition } from './findUi';
import { bindHistoryMenu, closeHistoryMenus, paintUndoButtons, placeBusyHint, renderUndoGraphs, requestHistory, sendGit, setGitBusy, showUndoPreview } from './undoUi';
import { bindColResize, bindSashes } from './colsUi';
import { acceptDetails, fileMenu, fileRef, onDetailsClick } from './detailsUi';
import { chooseCompare, clearCursorDialog, closeConfirmTip, fillCompareList, gitDialog, hideLabelColourTip, indexRemoteTags, labelColourHsv, lanePriorityDialog, moveLabelColourSv, paintRemoteTagError, paintTagRemoteMarks, placeCursorDialog, renderLabelColourHsv, showConfirmTip, syncAmendForm, syncDeleteBranchForm, syncGitOkFromRemotes, syncLabelColourOk, syncLanePriorityForm, syncSquashForm, syncWorktreeForm, toggleLabelColourTip } from './dialogsUi';
import { checkoutChip, pickWaiters, togglePickedBranch } from './gitActions';
import { menuCommit, menuRef, onMenu, openSelectionCopy, showAmendDialog, showCtrlSelection } from './menusUi';
import { jumpToStash, onKey, refreshGraph } from './keys';
import { initL10n } from './l10n';
import './styles.css';

function sendReady(): void {
  post({ type: 'ready' });
}

window.addEventListener('message', (ev: MessageEvent<HostToView>) => {
  if (document.body.dataset.page === 'contributors') return;
  const m = ev.data;
  if (m.type === 'patch' && !state.snap) {
    const { loading: _loading, ...rest } = m.payload;
    if (Object.keys(rest).length) state.pendingPatch = { ...(state.pendingPatch ?? {}), ...rest };
    return;
  }
  if (m.type === 'snapshot') {
    if (state.pendingPatch) {
      const extra = state.pendingPatch;
      state.pendingPatch = null;
      m.payload = { ...m.payload, ...extra, config: extra.config ?? m.payload.config };
    }
    setGitBusy(false);
    if (state.snap && m.payload.repoPath !== state.snap.repoPath) {
      state.dateFilter = emptyDateFilter();
      state.dateDraft = null;
      state.personFilter = emptyPersonFilter();
      state.personDraft = null;
      state.commitRange = [];
      state.rangeAnchor = null;
      state.pickedFiles = [];
    }
    state.pendingDateJump = null;
    state.pendingRefJump = null;
    hideRefJumpMiss();
    state.snap = m.payload;
    applySnap();
  } else if (m.type === 'patch' && state.snap) {
    if (m.payload.loading) setGitBusy(true);
    state.snap = { ...state.snap, ...m.payload, config: m.payload.config ?? state.snap.config };
    applySnap();
  } else if (m.type === 'more' && state.snap) {
    state.snap.commits = [...state.snap.commits, ...m.commits];
    state.snap.hasMore = m.hasMore;
    paint();
    fillDates();
    fillPeople();
    continueDateJump();
    continueFindJump();
    continueRefJump();
  } else if (m.type === 'info') {
    if (state.pendingAmend) {
      const pending = state.pendingAmend;
      state.pendingAmend = null;
      const commit = state.snap?.commits.find((row) => row.hash === pending);
      if (m.payload && m.payload.hash === pending && commit) showAmendDialog(pending, commit.subject, m.payload.body);
    }
    if (!acceptDetails(m.payload)) return;
    if (m.payload?.hash !== state.details?.hash) state.pickedFiles = [];
    state.details = m.payload;
    state.detailsStamp++;
    if (!state.details) {
      clearCompare();
      paint();
      return;
    }
    if (state.detailsH == null) state.autoDetailsH = estimateFromDetails(state.details);
    paint();
    scheduleFitDetails();
  } else if (m.type === 'fail') {
    // An empty message only clears the banner. A Git action may still be running.
    if (m.message) setGitBusy(false);
    state.pendingAmend = null;
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
    gitDialog(t('Rebase'), m.html, () => {});
  } else if (m.type === 'face') {
    state.faces.set(m.email, m.dataUri);
    paint();
  } else if (m.type === 'facesReset') {
    state.faces.clear();
    paint();
  } else if (m.type === 'findHits') {
    if (m.requestId !== state.findRequest) return;
    state.findHits = m.hashes;
    state.findIndexes = m.indexes;
    state.findTruncated = m.truncated;
    const err = $('find-err');
    err.hidden = !m.error;
    err.textContent = m.error ?? '';
    const dir = state.findPendingDir;
    state.findPendingDir = 0;
    showFindPosition(dir);
  } else if (m.type === 'jump') {
    state.selected = m.selected;
    state.compare = m.compare;
    state.compareAnchor = undefined;
    scrollToHash(m.selected);
  } else if (m.type === 'branchMerged') {
    if (m.requestId !== state.deleteBranchReq) return;
    state.deleteBranchMerge = m.merged === true ? 'merged' : m.merged === false ? 'unmerged' : 'unknown';
    syncDeleteBranchForm();
  } else if (m.type === 'remoteTags') {
    if (m.requestId !== state.remoteTagReq || !state.tagMark) return;
    state.remoteTagLoading = false;
    state.remoteTagCommits = indexRemoteTags(m.tags);
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
    state.undoButtons = {
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
  } else if (m.type === 'shortcut') {
    if (m.action === 'refresh') refreshGraph();
    else jumpToStash(m.previous === true);
  }
});

function restoreView(): void {
  if (!state.snap) return;
  const stored = webviewState();
  if (stored.repo !== state.snap.repoPath) return;
  for (const [key, width] of Object.entries(stored.columns ?? {})) {
    if (typeof width === 'number' && Number.isFinite(width)) setColWidth(key, width);
  }
  if (stored.dateAuthor || stored.dateCommitter) {
    state.dateFilter = { author: new Set(stored.dateAuthor ?? []), committer: new Set(stored.dateCommitter ?? []) };
  }
  if (stored.authorNames || stored.committerNames) {
    state.personFilter = { author: new Set(stored.authorNames ?? []), committer: new Set(stored.committerNames ?? []) };
  }
  if (stored.selected && state.snap.commits.some((commit) => commit.hash === stored.selected)) {
    state.selected = stored.selected;
    state.restoredScroll = stored.selected;
  }
}

function syncBanners(): void {
  if (!state.snap) return;
  const op = state.snap.operation;
  $('conflict').hidden = !op;
  if (op) {
    const label = op.kind === 'am' ? t('patch apply') : op.kind;
    $('conflict-msg').textContent = op.files.length ? t('{0} in progress', label) : t('{0} in progress — no unmerged files', label);
    $('conflict-files').innerHTML = op.files
      .map((file) => `<button type="button" class="conflict-file" data-conflict="${esc(file)}">${esc(file)}</button>`)
      .join('');
  }
  $('path-filter').hidden = !state.snap.historyPath;
  if (state.snap.historyPath) $('path-filter-msg').textContent = t('History of {0}', state.snap.historyPath);
}

function applySnap(): void {
  if (!state.snap) return;
  const commitLive = new Set(state.snap.commits.map((commit) => commit.hash));
  if (state.commitRange.some((hash) => !commitLive.has(hash))) state.commitRange = state.commitRange.filter((hash) => commitLive.has(hash));
  if (state.rangeAnchor && !commitLive.has(state.rangeAnchor)) state.rangeAnchor = null;
  const live = new Set(state.snap.branches);
  if (state.pickedBranches.some((name) => !live.has(name))) state.pickedBranches = state.pickedBranches.filter((name) => live.has(name));
  if (!state.viewRestored) {
    state.restoring = true;
    restoreView();
    state.restoring = false;
    state.viewRestored = true;
  }
  document.body.dataset.theme = state.snap.config.theme;
  document.body.dataset.bg = state.snap.config.background;
  document.body.classList.toggle('hide-Author', !state.snap.config.columnVisibility.Author);
  document.body.classList.toggle('hide-AuthorDate', !state.snap.config.columnVisibility.AuthorDate);
  document.body.classList.toggle('hide-Commit', !state.snap.config.columnVisibility.Commit);
  document.body.classList.toggle('hide-Committer', !state.snap.config.columnVisibility.Committer);
  document.body.classList.toggle('hide-CommitterDate', !state.snap.config.columnVisibility.CommitterDate);
  document.body.classList.toggle('hide-Signature', !state.snap.config.columnVisibility.Signature);
  $('s-theme').value = state.snap.config.theme;
  $('s-bg').value = state.snap.config.background;
  $('s-raycat').checked = state.snap.config.rayCatEnabled;
  $('s-raycat-count').value = String(state.snap.config.rayCatCount);
  $('s-raycat-count').disabled = !state.snap.config.rayCatEnabled;
  syncRayCats($('ray-cats'), state.snap.config.rayCatEnabled, state.snap.config.rayCatCount);
  fillRepos();
  if (!$('pop-refs').matches(':popover-open')) state.filterDraft = null;
  fillRefs();
  fillDates();
  fillPeople();
  $('btn-fetch').hidden = state.snap.remotes.length === 0;
  $('s-remotes').checked = state.snap.repoSettings.showRemotes ?? state.snap.config.showRemoteBranches;
  $('s-stashes').checked = state.snap.repoSettings.showStashes ?? state.snap.config.showStashes;
  $('s-tags').checked = state.snap.repoSettings.showTags ?? state.snap.config.showTags;
  $('s-worktrees').checked = state.snap.repoSettings.showWorktrees ?? state.snap.config.showWorktrees;
  $('s-reflogs').checked = state.snap.repoSettings.showReflogs ?? state.snap.config.includeCommitsMentionedByReflogs;
  $('s-first').checked = state.snap.repoSettings.firstParent ?? state.snap.config.onlyFollowFirstParent;
  $('s-prune').checked = state.snap.config.fetchAndPrune;
  $('s-prune-tags').checked = state.snap.config.fetchAndPruneTags;
  $('s-auto-fetch').checked = state.snap.config.autoFetch;
  $('s-auto-fetch-interval').value = String(state.snap.config.autoFetchInterval);
  $('s-auto-fetch-interval').disabled = !state.snap.config.autoFetch;
  $('s-auto-refresh').checked = state.snap.config.autoRefresh;
  $('s-undo-preview').checked = state.snap.config.undoPreview;
  fillRemotes();
  $('s-lane-combine').checked = state.snap.config.lanePriorityCombineRemotes;
  fillLanePriority();
  fillPr();
  if (state.snap.repoSettings.issueLinking) {
    $('issue-re').value = state.snap.repoSettings.issueLinking.regex;
    $('issue-url').value = state.snap.repoSettings.issueLinking.url;
    $('issue-global').checked = Boolean(state.snap.repoSettings.issueLinking.global);
  }
  for (const cb of document.querySelectorAll<HTMLInputElement>('#pop-cols input')) {
    cb.checked = state.snap.config.columnVisibility[cb.dataset.col as keyof ColumnVisibility];
  }
  if (state.snap.config.fetchAvatars) post({ type: 'faces', emails: [...new Set(state.snap.commits.map((c) => c.authorEmail).filter(Boolean))] });
  syncBanners();
  fillHelp();
  paint();
  if ($('find-q').value) scheduleFind(0);
  if (state.restoredScroll) {
    const hash = state.restoredScroll;
    state.restoredScroll = null;
    scrollToHash(hash);
  }
  persistView();
}

function bindDialogs(): void {
  const dlg = $('dlg-git') as unknown as HTMLDialogElement;
  const form = $('git-form') as unknown as HTMLFormElement;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if ($('git-ok').disabled) return;
    const submitter = (ev as SubmitEvent).submitter as HTMLButtonElement | null;
    dlg.close();
    const ok = state.dialogOk;
    state.dialogOk = null;
    if (!submitter || submitter.id === 'git-ok' || submitter.value === 'ok') ok?.();
  });
  $('git-body').addEventListener('change', () => {
    syncGitOkFromRemotes();
    syncDeleteBranchForm();
    if (document.getElementById('lp-pattern')) syncLanePriorityForm();
    if (state.tagMark) paintTagRemoteMarks();
  });
  $('git-body').addEventListener('input', (ev) => {
    if (document.getElementById('wt-name')) syncWorktreeForm();
    if (document.getElementById('lp-pattern')) syncLanePriorityForm();
    if (document.getElementById('am-subject')) syncAmendForm();
    if (document.getElementById('sq-msg')) syncSquashForm();
    if (state.tagMark && document.getElementById('tn')) paintTagRemoteMarks();
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
    if (!state.snap || !pattern.trim()) return;
    post({ type: 'setLabelColours', colours: refColoursToSetting(removeRefColour(state.snap.config.referenceLabelColours, pattern)) });
    state.dialogOk = null;
    dlg.close();
  });
  $('git-cancel').addEventListener('click', () => {
    state.dialogOk = null;
    dlg.close();
  });
  dlg.addEventListener('cancel', () => {
    state.dialogOk = null;
  });
  dlg.addEventListener('close', () => {
    hideLabelColourTip();
    state.tagMark = null;
    state.remoteTagReq = '';
    state.remoteTagLoading = false;
    state.gitDialogAt = null;
    clearCursorDialog(dlg);
  });
  dlg.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      state.dialogOk = null;
      ev.stopPropagation();
      return;
    }
    if (ev.key !== 'Enter' || ev.isComposing) return;
    const target = ev.target as HTMLElement;
    if (target.closest('textarea')) return;
    if (target.id === 'git-cancel') return;
    if ($('git-ok').disabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    form.requestSubmit($('git-ok') as unknown as HTMLButtonElement);
  });
  const compareDlg = $('dlg-compare') as unknown as HTMLDialogElement;
  ($('cmp-q') as HTMLInputElement).addEventListener('input', () => {
    state.compareActive = 0;
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
      if (!state.compareRows.length) return;
      ev.preventDefault();
      ev.stopPropagation();
      const dir = ev.key === 'ArrowDown' ? 1 : -1;
      state.compareActive = (state.compareActive + dir + state.compareRows.length) % state.compareRows.length;
      fillCompareList();
      return;
    }
    if (ev.key !== 'Enter' || ev.isComposing) return;
    if ((ev.target as HTMLElement).id === 'cmp-cancel') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (state.compareRows.length) chooseCompare(state.compareActive);
  });
}

function sub(mode: string): string {
  return applySpaceSubstitution(($('git-body').querySelector('input,textarea') as HTMLInputElement | null)?.value ?? '', mode as 'keep');
}

function bind(): void {
  new ResizeObserver(() => scheduleViewportPaint()).observe($('scroll'));
  $('conflict-continue').addEventListener('click', () => {
    if (!state.snap?.operation) return;
    post({ type: 'git', action: { kind: 'continueOperation', operation: state.snap.operation.kind } });
  });
  $('conflict-abort').addEventListener('click', () => {
    if (!state.snap?.operation) return;
    post({ type: 'git', action: { kind: 'abortOperation', operation: state.snap.operation.kind } });
  });
  $('conflict-files').addEventListener('click', (ev) => {
    const button = (ev.target as HTMLElement).closest<HTMLElement>('[data-conflict]');
    if (!button?.dataset.conflict) return;
    post({ type: 'openMerge', path: button.dataset.conflict });
  });
  $('path-filter-clear').addEventListener('click', () => post({ type: 'setHistoryPath', path: null }));
  const trackPointer = (ev: PointerEvent) => {
    state.lastPointer = { x: ev.clientX, y: ev.clientY };
    if (document.documentElement.classList.contains('git-busy')) placeBusyHint();
  };
  document.addEventListener('pointermove', trackPointer, { passive: true });
  document.addEventListener('pointerdown', trackPointer, { passive: true });
  $('repo-list').addEventListener('change', (e) => {
    const input = (e.target as HTMLElement).closest?.('input[name="repo-pick"]') as HTMLInputElement | null;
    if (!input || !state.snap || input.value === state.snap.repoPath) return;
    $('pop-repo').hidePopover?.();
    post({ type: 'pickRepo', path: input.value });
  });
  $('s-theme').addEventListener('change', (e) => post({ type: 'setTheme', value: (e.target as HTMLSelectElement).value as GraphSnapshot['config']['theme'] }));
  $('s-bg').addEventListener('change', (e) => post({ type: 'setBackground', value: (e.target as HTMLSelectElement).value as GraphSnapshot['config']['background'] }));
  $('s-raycat').addEventListener('change', postRayCat);
  $('s-raycat-count').addEventListener('change', postRayCat);
  $('btn-head').addEventListener('click', () => state.snap?.head && scrollToHash(state.snap.head));
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
    if (!state.snap) return;
    sendGit({
      kind: 'fetchRemote',
      prune: state.snap.config.fetchAndPrune,
      pruneTags: state.snap.config.fetchAndPruneTags,
    });
  });
  $('btn-undo').addEventListener('click', () => requestHistory('undo'));
  $('btn-redo').addEventListener('click', () => requestHistory('redo'));
  bindHistoryMenu('undo');
  bindHistoryMenu('redo');
  $('undo-ok').addEventListener('click', () => {
    const direction = state.undoPending;
    const steps = state.undoSteps;
    state.undoPending = null;
    (document.getElementById('dlg-undo') as HTMLDialogElement).close();
    if (direction) post({ type: 'undoApply', direction, steps });
  });
  $('undo-cancel').addEventListener('click', () => {
    state.undoPending = null;
    (document.getElementById('dlg-undo') as HTMLDialogElement).close();
  });
  $('undo-side').addEventListener('change', () => {
    state.undoSideBySide = ($('undo-side') as HTMLInputElement).checked;
    renderUndoGraphs();
  });
  $('undo-unrelated').addEventListener('change', () => {
    state.undoShowUnrelated = ($('undo-unrelated') as HTMLInputElement).checked;
    renderUndoGraphs();
  });
  $('undo-head').addEventListener('change', () => {
    state.undoShowHead = ($('undo-head') as HTMLInputElement).checked;
    renderUndoGraphs();
  });
  paintUndoButtons();
  $('fail-close').addEventListener('click', () => {
    $('fail-msg').textContent = '';
    $('fail').hidden = true;
  });
  $('show-remotes').addEventListener('change', (e) => {
    e.stopPropagation();
    if (!state.filterDraft) startFilterDraft();
    if (state.filterDraft) state.filterDraft.showRemotes = (e.target as HTMLInputElement).checked;
    fillRefs();
  });
  $('show-all').addEventListener('change', (e) => {
    if (!state.filterDraft) startFilterDraft();
    if (state.filterDraft) state.filterDraft.showAll = (e.target as HTMLInputElement).checked;
  });
  $('show-same-commit').addEventListener('change', (e) => {
    if (!state.filterDraft) startFilterDraft();
    if (state.filterDraft) state.filterDraft.showSameCommitBranches = (e.target as HTMLInputElement).checked;
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
    if (!state.filterDraft) startFilterDraft();
    if (!state.filterDraft) return;
    state.filterDraft.showAll = false;
    $('show-all').checked = false;
    if (box.checked) state.filterDraft.picked.add(box.dataset.ref);
    else state.filterDraft.picked.delete(box.dataset.ref);
  });
  $('ref-list').addEventListener('scroll', () => {
    if (!state.filterDraft || !state.snap) return;
    const list = $('ref-list');
    if (list.scrollTop + list.clientHeight < list.scrollHeight - 24) return;
    state.filterDraft.shown += state.snap.config.refsListLimit;
    fillRefs();
  });
  $('ref-q').addEventListener('input', () => {
    if (state.filterDraft) state.filterDraft.shown = state.snap?.config.refsListLimit ?? 200;
    fillRefs();
  });
  $('pop-refs').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const target = ev.target as HTMLElement;
    if (target.closest('.ref-tabs') || target.closest('.ref-jump') || target.id === 'ref-ok') return;
    ev.preventDefault();
    applyFilter();
  });
  $('ref-ok').addEventListener('click', applyFilter);
  for (const tab of ['branch', 'tag', 'worktree'] as const) {
    $(`ref-tab-${tab}`).addEventListener('click', () => {
      if (!state.filterDraft) startFilterDraft();
      if (!state.filterDraft) return;
      state.filterDraft.tab = tab;
      state.filterDraft.shown = state.snap?.config.refsListLimit ?? 200;
      fillRefs();
    });
  }
  $('pop-refs').addEventListener('toggle', (ev) => {
    if ((ev as ToggleEvent).newState === 'open') {
      startFilterDraft();
      fillRefs();
      if (!state.pendingRefJump) hideRefJumpMiss();
      $('ref-q').focus();
      return;
    }
    state.filterDraft = null;
    state.refsPopoverCustomPlace = false;
  });
  $('pop-dates').addEventListener('toggle', (ev) => {
    if ((ev as ToggleEvent).newState === 'open') {
      state.dateDraft = copyDateFilter(state.dateFilter);
      $('date-q').value = '';
      fillDates();
      $('date-q').focus();
      return;
    }
    state.dateDraft = null;
  });
  for (const field of ['author', 'committer'] as const) {
    $(`date-tab-${field}`).addEventListener('click', () => {
      state.dateTab = field;
      if (!state.dateDraft) state.dateDraft = copyDateFilter(state.dateFilter);
      fillDates();
      $('date-list').scrollTop = 0;
    });
  }
  $('date-q').addEventListener('input', () => fillDates());
  $('date-show-all').addEventListener('change', (e) => {
    if (!state.snap) return;
    if (!state.dateDraft) state.dateDraft = copyDateFilter(state.dateFilter);
    const buckets = dateBuckets(state.snap.commits, state.dateTab);
    state.dateDraft = (e.target as HTMLInputElement).checked ? showAllMonths(state.dateDraft, state.dateTab) : hideAllMonths(state.dateDraft, state.dateTab, buckets);
    fillDates();
  });
  $('date-list').addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    if (!state.snap || (!box.dataset.month && !box.dataset.year)) return;
    if (!state.dateDraft) state.dateDraft = copyDateFilter(state.dateFilter);
    const shown = filterBuckets(dateBuckets(state.snap.commits, state.dateTab), $('date-q').value);
    if (box.dataset.month) state.dateDraft = hideMonth(state.dateDraft, state.dateTab, box.dataset.month, !box.checked);
    else {
      const year = shown.find((item) => String(item.year) === box.dataset.year);
      if (year) state.dateDraft = hideYear(state.dateDraft, state.dateTab, year, !box.checked);
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
      state.personDraft = copyPersonFilter(state.personFilter);
      $('person-q').value = '';
      fillPeople();
      $('person-q').focus();
      return;
    }
    state.personDraft = null;
  });
  for (const field of ['author', 'committer'] as const) {
    $(`person-tab-${field}`).addEventListener('click', () => {
      state.personTab = field;
      if (!state.personDraft) state.personDraft = copyPersonFilter(state.personFilter);
      fillPeople();
      $('person-list').scrollTop = 0;
    });
  }
  $('person-q').addEventListener('input', () => fillPeople());
  $('person-show-all').addEventListener('change', (e) => {
    if (!state.snap) return;
    if (!state.personDraft) state.personDraft = copyPersonFilter(state.personFilter);
    const buckets = personBuckets(state.snap.commits, state.personTab);
    state.personDraft = (e.target as HTMLInputElement).checked ? showAllPeople(state.personDraft, state.personTab) : hideAllPeople(state.personDraft, state.personTab, buckets);
    fillPeople();
  });
  $('person-list').addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    if (box.dataset.name == null || !state.snap) return;
    if (!state.personDraft) state.personDraft = copyPersonFilter(state.personFilter);
    state.personDraft = hidePerson(state.personDraft, state.personTab, personKey(box.dataset.name, box.dataset.email ?? ''), !box.checked);
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
    if ((ev.target as HTMLElement).closest('[data-fv], [data-cv], .file-act')) ev.preventDefault();
  });
  $('dock').addEventListener('mousedown', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-fv], [data-cv], .file-act')) ev.preventDefault();
  });
  $('scroll').addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    if (target.id === 'more') {
      post({ type: 'more' });
      return;
    }
    if (onDetailsClick(ev)) return;
    const foldBtn = target.closest<HTMLElement>('.chip-fold');
    if (foldBtn) {
      const pair = foldBtn.closest<HTMLElement>('.chip-pair');
      const branch = pair?.dataset.fold;
      const hash = foldBtn.closest<HTMLElement>('.row')?.dataset.hash;
      if (branch && hash) setRemoteLabelsExpanded(hash, branch, false);
      return;
    }
    const chip = target.closest<HTMLElement>('.chip');
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
        if (chip.classList.contains('remote') && performance.now() - state.remoteLabelsExpandedAt < 400) return;
        checkoutChip(chip);
      }
      return;
    }
    const row = target.closest<HTMLElement>('.row');
    if (!row?.dataset.hash) return;
    const hash = row.dataset.hash;
    if (!state.snap) return;
    const clearPicked = state.pickedBranches.length > 0;
    if (clearPicked) state.pickedBranches = [];
    if (ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      const anchor = state.rangeAnchor && state.snap.commits.some((commit) => commit.hash === state.rangeAnchor) ? state.rangeAnchor : state.selected;
      state.commitRange = anchor && anchor !== hash ? displayedRange(state.snap.commits, anchor, hash) : [hash];
      if (!state.rangeAnchor) state.rangeAnchor = hash;
      state.selected = hash;
      clearCompare();
      if (!state.details || state.details.hash !== hash || state.details.compare) post({ type: 'openRow', hash });
      persistView();
      paint();
      return;
    }
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      if (hash === UNCOMMITTED) {
        const base = state.commitRange.length === 1 ? state.commitRange[0] : state.commitRange.length === 0 ? state.selected : null;
        if (base && base !== UNCOMMITTED) {
          state.commitRange = [];
          state.compareLeftName = undefined;
          state.compareRightName = undefined;
          state.selected = base;
          state.compare = hash;
          state.compareAnchor = undefined;
          post({ type: 'compare', a: base, b: state.compare });
          persistView();
          paint();
        }
        return;
      }
      const next = toggleCommitSelection(state.commitRange, hash, state.commitRange.length === 0 ? state.selected : null);
      state.rangeAnchor = hash;
      showCtrlSelection(next);
      return;
    }
    if (state.details && (hash === state.selected || hash === state.compare)) {
      state.selected = null;
      state.rangeAnchor = null;
      state.commitRange = [];
      clearCompare();
      state.details = null;
      post({ type: 'openRow', hash: null });
    } else {
      state.selected = hash!;
      state.rangeAnchor = hash!;
      state.commitRange = [];
      clearCompare();
      post({ type: 'openRow', hash: state.selected });
    }
    persistView();
    paint();
  });
  $('dock').addEventListener('click', (ev) => {
    onDetailsClick(ev);
  });
  $('scroll').addEventListener('contextmenu', (ev) => {
    const target = eventElement(ev.target);
    if (!target || target.closest('.details')) return;
    ev.preventDefault();
    const chip = target.closest<HTMLElement>('.chip');
    const row = target.closest<HTMLElement>('.row');
    if (chip) {
      menuRef(chip, ev.clientX, ev.clientY);
      return;
    }
    if (row?.dataset.hash) menuCommit(row.dataset.hash, ev.clientX, ev.clientY);
    else if (vis('commit', 'applyPatch')) {
      state.ctxCommit = null;
      state.ctxRef = null;
      state.ctxFile = null;
      state.ctxFolder = null;
      openCtx(btn('apply-patch', t('Apply patch')), ev.clientX, ev.clientY);
    }
  });
  $('head').addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    placePopover($('pop-cols'), ev.clientX, ev.clientY);
  });
  $('pop-cols').addEventListener('change', () => {
    if (!state.snap) return;
    const v = { ...state.snap.config.columnVisibility };
    for (const cb of document.querySelectorAll<HTMLInputElement>('#pop-cols input')) {
      v[cb.dataset.col as keyof ColumnVisibility] = cb.checked;
    }
    post({ type: 'setColumns', value: v });
  });
  $('find-q').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const dir = ev.shiftKey ? -1 : 1;
      if (state.findDiffTimer) clearTimeout(state.findDiffTimer);
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
  $('s-auto-refresh').addEventListener('change', () => {
    post({ type: 'setAutoRefresh', value: $('s-auto-refresh').checked });
  });
  $('s-undo-preview').addEventListener('change', () => {
    post({ type: 'setUndoPreview', value: $('s-undo-preview').checked });
  });
  $('s-lane-combine').addEventListener('change', () => {
    post({ type: 'setLanePriorityCombine', value: $('s-lane-combine').checked });
  });
  $('add-lane').addEventListener('click', () => lanePriorityDialog(t('Add lane priority'), '', ''));
  $('lane-list').addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-lane-ed], [data-lane-del]');
    if (!target || !state.snap) return;
    ev.stopPropagation();
    const index = Number(target.dataset.laneEd ?? target.dataset.laneDel);
    const rule = state.snap.config.lanePriority[index];
    if (!rule) return;
    if (target.dataset.laneEd != null) {
      lanePriorityDialog(t('Edit lane priority'), rule.pattern, String(rule.priority), rule.pattern);
      return;
    }
    const r = target.getBoundingClientRect();
    showConfirmTip(t('Delete lane priority "{0}"?', rule.pattern), () => {
      if (!state.snap) return;
      post({ type: 'setLanePriority', priorities: lanePriorityToSetting(removeLanePriority(state.snap.config.lanePriority, rule.pattern)) });
    }, r.left, r.bottom + 4);
  });
  $('add-remote').addEventListener('click', () => {
    gitDialog(
      t('Add remote'),
      `<label class="dlg-field">${t('Name')} <input id="rn" placeholder="${t('name')}" /></label><label class="dlg-field">${t('URL')} <input id="ru" placeholder="${t('url')}" /></label>`,
      () => {
        const name = (document.getElementById('rn') as HTMLInputElement).value;
        const url = (document.getElementById('ru') as HTMLInputElement).value;
        setGitBusy(true);
        post({ type: 'addRemote', name, fetchUrl: url });
      },
    );
  });
  $('remote-list').addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-del], [data-ed]');
    if (!target || !state.snap) return;
    ev.stopPropagation();
    if (target.dataset.ed) {
      const rem = state.snap.remotes.find((x) => x.name === target.dataset.ed);
      if (!rem) return;
      gitDialog(
        t('Edit remote'),
        `<label class="dlg-field">${t('Name')} <input id="rn" value="${esc(rem.name)}" /></label>
         <label class="dlg-field">${t('Fetch URL')} <input id="ru" value="${esc(rem.fetchUrl)}" /></label>
         <label class="dlg-field">${t('Push URL')} <input id="pu" value="${esc(rem.pushUrl)}" /></label>`,
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
    if (!target.dataset.del) return;
    const name = target.dataset.del;
    const r = target.getBoundingClientRect();
    showConfirmTip(t('Delete remote "{0}"?', name), () => {
      setGitBusy(true);
      post({ type: 'deleteRemote', name });
    }, r.left, r.bottom + 4);
  });
  $('confirm-ok').addEventListener('click', () => {
    const ok = state.confirmOk;
    state.confirmOk = null;
    $('pop-confirm').hidePopover?.();
    ok?.();
  });
  $('confirm-cancel').addEventListener('click', closeConfirmTip);
  $('pop-confirm').addEventListener('toggle', (ev) => {
    if ((ev as ToggleEvent).newState === 'closed') state.confirmOk = null;
  });
  $('pop-ctx').addEventListener('click', onMenu);
  document.addEventListener(
    'pointerdown',
    (ev) => {
      const folder = summaryFolder(ev.target);
      state.summaryPointer = folder ? { folder, open: folder.open } : null;
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
      const openBefore = state.summaryPointer?.folder === folder ? state.summaryPointer.open : folder.open;
      toggleNestedFolders(folder, openBefore);
    },
    true,
  );
  document.addEventListener('contextmenu', (ev) => {
    const el = eventElement(ev.target);
    if (!el?.closest('.details') || !state.details) return;
    const file = el.closest<HTMLElement>('.file');
    if (file) {
      ev.preventDefault();
      state.ctxFolder = null;
      state.ctxFile = fileRef(file);
      openCtx(fileMenu(state.ctxFile.path), ev.clientX, ev.clientY);
      return;
    }
    const folder = treeFolder(ev.target);
    if (folder) {
      ev.preventDefault();
      state.ctxFolder = folder;
      state.ctxFile = null;
      state.ctxCommit = null;
      state.ctxRef = null;
      openCtx(folderMenu().map((item) => btn(item.id, item.label)).join(''), ev.clientX, ev.clientY);
      return;
    }
    ev.preventDefault();
    openSelectionCopy(ev.clientX, ev.clientY);
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
  bindPopoverAnchor('btn-repo', 'pop-repo', { align: 'left' });
  document.addEventListener('pointerdown', (ev) => {
    const tip = document.getElementById('lc-tip');
    if (tip?.matches(':popover-open')) {
      const node = ev.target as Node;
      if (!tip.contains(node) && !document.getElementById('lc-help')?.contains(node)) hideLabelColourTip();
    }
    const pop = $('pop-repo-help');
    if (!pop.matches(':popover-open')) return;
    const target = ev.target as Node;
    if (pop.contains(target) || $('btn-repo-help').contains(target)) return;
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
    if (state.gitDialogAt && dlg.open) placeCursorDialog(dlg, state.gitDialogAt);
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
  if (!state.snap) return;
  const settings: RepoSettings = {
    ...defaultRepoSettings(),
    ...state.snap.repoSettings,
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

initL10n();
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
