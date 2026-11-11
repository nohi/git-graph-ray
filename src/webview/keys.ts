import { adjacentShownCommit, enterOnCommit, scrollToRevealRow } from '../shared/commitNav';
import { ESCAPE_POPOVER_IDS, escapeLayer } from '../shared/escapeLayer';
import { ROW, rowTop, shortcutMatches } from '../shared/graph';
import { post } from './host';
import { persistView, state } from './state';
import { $, clearCompare } from './dom';
import { detailsGap, displayIndexForHash, paint, shownCommits } from './paint';
import { scrollToHash } from './refsUi';
import { runFind } from './findUi';
import { requestHistory, setGitBusy } from './undoUi';
import { closeConfirmTip } from './dialogsUi';

export function revealSelectedRow(): void {
  if (!state.selected) return;
  const rows = shownCommits();
  const idx = displayIndexForHash(state.selected);
  if (idx < 0) return;
  const scroll = $('scroll');
  const next = scrollToRevealRow({ top: rowTop(idx, detailsGap(rows)), rowHeight: ROW, scrollTop: scroll.scrollTop, viewHeight: scroll.clientHeight });
  if (next != null) scroll.scrollTop = next;
}

export function refreshGraph(): void {
  if (!state.snap) return;
  setGitBusy(true);
  post({ type: 'reload' });
}

export function jumpToStash(previous: boolean): void {
  if (!state.snap) return;
  const idxs = state.snap.commits.map((c, i) => (c.refs.some((r) => r.kind === 'stash') ? i : -1)).filter((i) => i >= 0);
  if (!idxs.length) return;
  state.stashI = previous ? (state.stashI - 1 + idxs.length) % idxs.length : (state.stashI + 1) % idxs.length;
  scrollToHash(state.snap.commits[idxs[state.stashI]!]!.hash);
}

export function onKey(ev: KeyboardEvent): void {
  if (!state.snap) return;
  if (ev.key === 'Escape') {
    if ((ev.target as HTMLElement).closest('dialog')) {
      state.dialogOk = null;
      return;
    }
    const dlg = document.querySelector('dialog[open]') as HTMLDialogElement | null;
    if (dlg) {
      state.dialogOk = null;
      dlg.close();
      return;
    }
    const openPopovers = ESCAPE_POPOVER_IDS.map((id) => $(id)).filter((pop) => pop.matches(':popover-open'));
    const layer = escapeLayer({
      confirm: $('pop-confirm').matches(':popover-open'),
      popover: openPopovers.length > 0,
      selection: state.pickedBranches.length > 0 || state.commitRange.length > 0,
      details: !!state.details,
    });
    if (layer === 'confirm') {
      closeConfirmTip();
      return;
    }
    if (layer === 'popover') {
      for (const pop of openPopovers) pop.hidePopover?.();
      return;
    }
    if (layer === 'selection') {
      state.pickedBranches = [];
      state.commitRange = [];
      state.rangeAnchor = null;
      paint();
      return;
    }
    if (layer === 'details') {
      state.details = null;
      state.selected = null;
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
  if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Enter') && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
    if (document.querySelector('dialog[open], [popover]:popover-open')) return;
    const target = ev.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (ev.key === 'Enter') {
      // Enter on a button or link presses it.
      if (target.closest('button, a, summary')) return;
      const current = state.selected;
      const action = enterOnCommit(current && state.snap.commits.some((c) => c.hash === current) ? current : null, !!state.details);
      if (action === 'none') return;
      ev.preventDefault();
      state.rangeAnchor = current;
      state.commitRange = [];
      clearCompare();
      if (action === 'close') {
        // The selection stays so the arrow keys continue from this commit.
        state.details = null;
        post({ type: 'openRow', hash: null });
      } else {
        post({ type: 'openRow', hash: current });
      }
      persistView();
      paint();
      return;
    }
    const nextIndex = adjacentShownCommit(shownCommits(), state.selected ? state.snap.commits.findIndex((c) => c.hash === state.selected) : -1, ev.key === 'ArrowDown' ? 1 : -1);
    ev.preventDefault();
    if (nextIndex == null) return;
    const next = state.snap.commits[nextIndex];
    if (!next) return;
    state.selected = next.hash;
    state.rangeAnchor = next.hash;
    state.commitRange = [];
    persistView();
    clearCompare();
    // Open details follow the selection. Closed details stay closed until Enter.
    if (state.details) post({ type: 'openRow', hash: state.selected });
    paint();
    revealSelectedRow();
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
  if (shortcutMatches(state.snap.config.keyboard.find, ev)) {
    ev.preventDefault();
    $('pop-find').showPopover?.();
    $('find-q').focus();
  }
  if (shortcutMatches(state.snap.config.keyboard.refresh, ev)) {
    ev.preventDefault();
    refreshGraph();
  }
  if (shortcutMatches(state.snap.config.keyboard.scrollToHead, ev) && state.snap.head) {
    ev.preventDefault();
    scrollToHash(state.snap.head);
  }
  if (shortcutMatches(state.snap.config.keyboard.scrollToStash, ev)) {
    ev.preventDefault();
    jumpToStash(ev.shiftKey);
  }
}
