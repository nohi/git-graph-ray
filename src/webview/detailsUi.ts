import { t } from '@vscode/l10n';
import { compareOpenDiff } from '../shared/compareSplit';
import { UNCOMMITTED } from '../shared/types';
import type { CompareView } from '../shared/compareSplit';
import type { CommitDetails } from '../shared/types';
import { post } from './host';
import { persistView, state } from './state';
import { btn, clearCompare, joinRepoPath, showCopiedToast } from './dom';
import { activeCompareView, displayIndexForHash, estimateFromDetails, filesPaneHtml, paint, scheduleFitDetails, signaturePaneHtml } from './paint';
import { scrollToHash } from './refsUi';

export function setCompareView(next: CompareView): void {
  if (!state.details?.compare) return;
  if (next === 'diverge' && !state.details.compareSplit) return;
  if (state.compareView === next) return;
  state.compareView = next;
  if (state.detailsH == null) state.autoDetailsH = estimateFromDetails(state.details);
  paint();
  if (state.detailsH == null) scheduleFitDetails();
}

export function toggleSignaturePane(): void {
  state.signatureOpen = !state.signatureOpen;
  state.detailsKey = '';
  persistView();
  const pane = document.querySelector('.sig-block');
  if (pane && state.details) pane.outerHTML = signaturePaneHtml(state.details);
  else paint();
  if (state.details && state.detailsH == null) {
    state.autoDetailsH = estimateFromDetails(state.details);
    scheduleFitDetails();
  }
}

export function refreshFileView(): void {
  if (!state.snap || !state.details) return;
  const tree = state.snap.config.fileViewType !== 'list';
  for (const btn of document.querySelectorAll<HTMLElement>('.fv-btn')) {
    if (!btn.dataset.fv) continue;
    btn.setAttribute('aria-pressed', String(btn.dataset.fv === (tree ? 'tree' : 'list')));
  }
  const files = document.querySelector('.files');
  if (files) files.innerHTML = filesPaneHtml(state.details);
  if (state.detailsH == null) scheduleFitDetails();
}

export function postDiff(file: { path: string; oldPath?: string; rev?: string }): void {
  if (!state.details) return;
  const target = compareOpenDiff({
    view: activeCompareView(state.details),
    hash: state.details.hash,
    compare: state.details.compare,
    base: state.details.compareSplit?.base,
    rev: file.rev,
  });
  post({
    type: 'diff',
    hash: target.hash,
    path: file.path,
    oldPath: file.oldPath,
    ...(target.parent ? { parent: target.parent } : {}),
    ...(target.compare ? { compare: target.compare } : {}),
  });
}

export function flashCopied(el: HTMLElement): void {
  el.classList.add('copied');
  const r = el.getBoundingClientRect();
  showCopiedToast(r.left + r.width / 2, r.top);
  window.setTimeout(() => el.classList.remove('copied'), 2000);
}

export function fileRef(file: HTMLElement): { path: string; oldPath?: string; rev?: string } {
  return {
    path: file.dataset.path ?? '',
    oldPath: file.dataset.old || undefined,
    rev: file.dataset.rev || undefined,
  };
}

export function viewFileAtRevision(file: HTMLElement): void {
  if (!state.details) return;
  const path = file.dataset.path ?? '';
  const rev = file.dataset.rev;
  const added = file.dataset.st === 'A' || file.dataset.st === 'U';
  if (!rev && state.details.hash === UNCOMMITTED && added) {
    post({ type: 'openWorkFile', path });
    return;
  }
  const hash = rev || (state.details.hash === UNCOMMITTED ? 'HEAD' : state.details.hash);
  post({ type: 'showBlob', hash, path });
}

export function runFileAction(kind: string, file: HTMLElement): void {
  if (!state.details) return;
  const path = file.dataset.path ?? '';
  if (kind === 'diff') {
    postDiff(fileRef(file));
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

export function onDetailsClick(ev: MouseEvent): boolean {
  const target = ev.target as HTMLElement;
  if (target.closest('.sig-toggle')) {
    ev.preventDefault();
    toggleSignaturePane();
    return true;
  }
  const fv = target.closest<HTMLElement>('[data-fv]');
  if (fv && state.snap && state.details) {
    const value = fv.dataset.fv as 'tree' | 'list';
    state.snap.config.fileViewType = value;
    post({ type: 'setFileView', value });
    refreshFileView();
    return true;
  }
  const cv = target.closest<HTMLElement>('[data-cv]');
  if (cv && state.details?.compare) {
    setCompareView(cv.dataset.cv === 'snapshot' ? 'snapshot' : 'diverge');
    return true;
  }
  const fileHit = target.closest<HTMLElement>('.file');
  if (fileHit && state.details && (ev.ctrlKey || ev.metaKey || ev.shiftKey) && !target.closest('.file-act')) {
    ev.preventDefault();
    togglePickedFile(fileHit.dataset.path ?? '', ev.shiftKey);
    return true;
  }
  const act = target.closest<HTMLElement>('[data-fa]');
  if (act && state.details) {
    const file = target.closest<HTMLElement>('.file');
    if (file) {
      runFileAction(act.dataset.fa ?? '', file);
      if (act.dataset.fa === 'copy-full' || act.dataset.fa === 'copy-rel') flashCopied(act);
    }
    return true;
  }
  const name = target.closest<HTMLElement>('.file-name');
  if (name && state.details) {
    const file = target.closest<HTMLElement>('.file');
    if (file) {
      if (name.dataset.open === 'blob') viewFileAtRevision(file);
      else postDiff(fileRef(file));
    }
    return true;
  }
  const copy = target.closest<HTMLElement>('[data-copy]');
  if (copy?.dataset.copy) {
    ev.preventDefault();
    post({ type: 'copy', text: copy.dataset.copy });
    flashCopied(copy);
    return true;
  }
  const parent = target.closest<HTMLElement>('[data-parent]');
  if (parent?.dataset.parent) {
    ev.preventDefault();
    state.selected = parent.dataset.parent;
    clearCompare();
    persistView();
    post({ type: 'openRow', hash: state.selected });
    if (displayIndexForHash(state.selected) < 0) scrollToHash(state.selected);
    return true;
  }
  return false;
}

export /** Drop a details reply that belongs to an earlier selection. */
function acceptDetails(payload: CommitDetails | null): boolean {
  if (state.commitRange.length >= 3) return !payload;
  if (state.commitRange.length === 2) {
    if (!payload?.compare) return false;
    const pair = new Set(state.commitRange);
    return pair.has(payload.hash) && pair.has(payload.compare);
  }
  if (state.commitRange.length === 1) return !payload || (payload.hash === state.commitRange[0] && !payload.compare);
  return true;
}

export function fileMenu(clicked: string): string {
  const items = [
    btn('f-diff', t('Diff')),
    btn('f-open', t('Open file')),
    btn('f-blob', t('View at revision')),
    btn('f-history', t('File history')),
    btn('f-blame', t('Blame')),
    btn('f-copy', t('Copy path')),
    btn('f-copy-full', t('Copy Full Path')),
  ];
  if (!state.details || state.details.compare) return items.join('');
  const files = chosenFiles(clicked);
  state.ctxFiles = files;
  const count = files.length;
  items.push('<hr class="menu-sep" />');
  if (state.details.hash === UNCOMMITTED) {
    items.push(btn('f-stash', count > 1 ? t('Stash {0} files', count) : t('Stash this file')));
  }
  items.push(btn('f-patch', count > 1 ? t('Create patch for {0} files', count) : t('Create patch')));
  return items.join('');
}

export function chosenFiles(clicked: string): { path: string; untracked: boolean }[] {
  const paths = state.pickedFiles.includes(clicked) ? state.pickedFiles : [clicked];
  const status = new Map((state.details?.files ?? []).map((file) => [file.path, file.status]));
  return paths.filter(Boolean).map((path) => ({ path, untracked: status.get(path) === 'U' }));
}

export function togglePickedFile(path: string, shift: boolean): void {
  if (!path) return;
  if (shift && state.pickedFiles.length) {
    const paths = [...document.querySelectorAll<HTMLElement>('.file')].map((file) => file.dataset.path ?? '').filter(Boolean);
    const anchor = state.pickedFiles[state.pickedFiles.length - 1]!;
    const start = paths.indexOf(anchor);
    const end = paths.indexOf(path);
    if (start >= 0 && end >= 0) {
      const [from, to] = start <= end ? [start, end] : [end, start];
      state.pickedFiles = [...new Set([...state.pickedFiles, ...paths.slice(from, to + 1)])];
    } else if (!state.pickedFiles.includes(path)) state.pickedFiles.push(path);
  } else {
    const index = state.pickedFiles.indexOf(path);
    if (index >= 0) state.pickedFiles.splice(index, 1);
    else state.pickedFiles.push(path);
  }
  for (const file of document.querySelectorAll<HTMLElement>('.file')) {
    file.classList.toggle('picked', state.pickedFiles.includes(file.dataset.path ?? ''));
  }
}
