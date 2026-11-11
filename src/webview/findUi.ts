import { t } from '@vscode/l10n';
import { compileFindRegex, formatFindCount } from '../shared/commitFind';
import { post } from './host';
import { persistView, state } from './state';
import { $, findPressed } from './dom';
import { paint } from './paint';
import { scrollToHash } from './refsUi';

export function scheduleFind(dir = 0): void {
  state.findPendingDir = dir;
  if (state.findDiffTimer) clearTimeout(state.findDiffTimer);
  const q = $('find-q').value;
  const err = $('find-err');
  if (!q) {
    state.findHits = [];
    state.findIndexes = [];
    state.findTruncated = false;
    state.findPendingHash = null;
    err.hidden = true;
    $('find-count').textContent = formatFindCount(0, 0, false);
    paint();
    return;
  }
  if (findPressed('find-regex') && !compileFindRegex(q, !findPressed('find-case'))) {
    state.findHits = [];
    state.findIndexes = [];
    err.hidden = false;
    err.textContent = t('Invalid regular expression');
    $('find-count').textContent = formatFindCount(0, 0);
    paint();
    return;
  }
  err.hidden = true;
  state.findDiffTimer = setTimeout(() => requestFind(), dir === 0 ? 280 : 0);
}

export function requestFind(): void {
  const q = $('find-q').value;
  if (!q) return;
  state.findRequest = String(++state.findSeq);
  post({
    type: 'findCommits',
    requestId: state.findRequest,
    pattern: q,
    ignoreCase: !findPressed('find-case'),
    regex: findPressed('find-regex'),
    diff: findPressed('find-diff'),
  });
}

export function showFindPosition(dir: number): void {
  if (!state.findHits.length) {
    $('find-count').textContent = formatFindCount(0, 0);
    paint();
    return;
  }
  if (dir === 0) state.findI = Math.min(state.findI, state.findHits.length - 1);
  else state.findI = (state.findI + dir + state.findHits.length) % state.findHits.length;
  $('find-count').textContent = formatFindCount(state.findI + 1, state.findHits.length, true, state.findTruncated);
  paint();
  if (dir === 0) return;
  jumpToFindHash(state.findHits[state.findI]!, state.findIndexes[state.findI] ?? -1);
}

export function jumpToFindHash(hash: string, index: number): void {
  if (!state.snap) return;
  if (state.snap.commits.some((commit) => commit.hash === hash)) {
    state.findPendingHash = null;
    state.selected = hash;
    scrollToHash(hash);
    persistView();
    return;
  }
  state.findPendingHash = hash;
  post({ type: 'loadUntil', hash, index });
}

export function continueFindJump(): void {
  if (!state.findPendingHash || !state.snap) return;
  if (!state.snap.commits.some((commit) => commit.hash === state.findPendingHash)) {
    if (!state.snap.hasMore) {
      state.findPendingHash = null;
      const err = $('find-err');
      err.hidden = false;
      err.textContent = t('That commit is outside the loaded history.');
    }
    return;
  }
  const hash = state.findPendingHash;
  state.findPendingHash = null;
  state.selected = hash;
  scrollToHash(hash);
  persistView();
}

export function runFind(dir: number): void {
  if (!state.snap) return;
  const q = $('find-q').value;
  if (!q) {
    scheduleFind(0);
    return;
  }
  if (findPressed('find-regex') && !compileFindRegex(q, !findPressed('find-case'))) {
    scheduleFind(0);
    return;
  }
  if (!state.findHits.length) {
    scheduleFind(dir);
    return;
  }
  showFindPosition(dir);
}
