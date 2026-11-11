import { t } from '@vscode/l10n';
import { mergeDialogHtml, rebaseDialogHtml } from '../shared/branchDialog';
import { comparePick } from '../shared/comparePick';
import { deleteBranchConfirm } from '../shared/deleteBranch';
import { applySpaceSubstitution } from '../shared/dialogs';
import { lanePriorityToSetting, upsertLanePriority } from '../shared/layout';
import { cursorDialogPlacement } from '../shared/popover';
import { tagOnRemoteIcon, tagRemoteLoadingIcon } from '../shared/pushDialog';
import { DEFAULT_LABEL_COLOUR, hexToHsv, hsvToHex, labelColourDialogHtml, normalizeHex, refColoursToSetting, refLabelColour, upsertRefColour } from '../shared/refColours';
import { remoteTagErrorText, tagOnRemote } from '../shared/remoteTags';
import { worktreeFormState } from '../shared/worktreeDialog';
import type { Hsv } from '../shared/refColours';
import type { RemoteTagError, RemoteTagTip } from '../shared/remoteTags';
import type { GraphRef } from '../shared/types';
import { post } from './host';
import { persistView, state } from './state';
import { $, esc } from './dom';
import { placePopover, positionAnchoredPopover } from './popovers';
import { paint, refRowColourAttrs } from './paint';

export function lanePriorityDialog(title: string, pattern: string, priority: string, previous?: string): void {
  gitDialog(
    title,
    `<label class="dlg-field">${t('Pattern')} <input id="lp-pattern" placeholder="main or release*" value="${esc(pattern)}" /></label><label class="dlg-field">${t('Priority')} <input id="lp-priority" type="number" step="1" placeholder="50" value="${esc(priority)}" /></label>`,
    () => {
      if (!state.snap) return;
      const nextPattern = (document.getElementById('lp-pattern') as HTMLInputElement).value;
      const nextPriority = Number((document.getElementById('lp-priority') as HTMLInputElement).value);
      const next = upsertLanePriority(state.snap.config.lanePriority, nextPattern, nextPriority, previous);
      if (!next) return;
      post({ type: 'setLanePriority', priorities: lanePriorityToSetting(next) });
    },
  );
}

export function syncWorktreeForm(): void {
  const loc = document.getElementById('wt-loc') as HTMLInputElement | null;
  const name = document.getElementById('wt-name') as HTMLInputElement | null;
  const preview = document.getElementById('wt-preview');
  const warn = document.getElementById('wt-warn');
  if (!loc || !name || !preview || !warn || !state.snap) return;
  const main = state.snap.mainWorktreePath || state.snap.repoPath;
  const stored = worktreeFormState(loc.value, name.value, main);
  preview.textContent = stored.canCreate ? t('Create at {0}', stored.destination) : t('Enter a folder name.');
  warn.hidden = !stored.insideMain;
  warn.textContent = stored.warning;
  $('git-ok').disabled = !stored.canCreate;
}

export function openLabelColourDialog(ref: GraphRef, at?: { x: number; y: number }): void {
  if (!state.snap) return;
  const current = refLabelColour(ref, state.snap.config.referenceLabelColours) ?? DEFAULT_LABEL_COLOUR;
  gitDialog(t('Label colour'), labelColourDialogHtml({ pattern: ref.name, colour: current }), () => {
    if (!state.snap) return;
    const pattern = (document.getElementById('lc-pattern') as HTMLInputElement | null)?.value ?? '';
    const colour = (document.getElementById('lc-hex') as HTMLInputElement | null)?.value ?? '';
    const next = upsertRefColour(state.snap.config.referenceLabelColours, pattern, colour);
    if (!next) return;
    post({ type: 'setLabelColours', colours: refColoursToSetting(next) });
  }, at);
  const hsv = hexToHsv(current) ?? { h: 0, s: 1, v: 1 };
  renderLabelColourHsv(hsv, normalizeHex(current) ?? DEFAULT_LABEL_COLOUR);
  syncLabelColourOk();
}

export function renderLabelColourHsv(hsv: Hsv, text?: string): void {
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

export function labelColourHsv(): Hsv {
  const pad = document.getElementById('lc-sv');
  return {
    h: Number((document.getElementById('lc-hue') as HTMLInputElement | null)?.value ?? 0),
    s: Number(pad?.dataset.s ?? 1),
    v: Number(pad?.dataset.v ?? 1),
  };
}

export function moveLabelColourSv(pad: HTMLElement, ev: PointerEvent): void {
  const rect = pad.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const s = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
  const v = Math.min(1, Math.max(0, 1 - (ev.clientY - rect.top) / rect.height));
  renderLabelColourHsv({ h: labelColourHsv().h, s, v });
  syncLabelColourOk();
}

export function hideLabelColourTip(): void {
  document.getElementById('lc-tip')?.hidePopover?.();
  document.getElementById('lc-help')?.setAttribute('aria-expanded', 'false');
}

export function toggleLabelColourTip(): void {
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

export function syncLabelColourOk(): void {
  const pattern = (document.getElementById('lc-pattern') as HTMLInputElement | null)?.value.trim() ?? '';
  const hex = (document.getElementById('lc-hex') as HTMLInputElement | null)?.value ?? '';
  if (!document.getElementById('lc-pattern')) return;
  $('git-ok').disabled = !pattern || !normalizeHex(hex);
  const remove = document.getElementById('lc-remove') as HTMLButtonElement | null;
  if (remove) remove.disabled = !state.snap?.config.referenceLabelColours.some((rule) => rule.pattern === pattern);
}

export function clearCursorDialog(dlg: HTMLElement): void {
  dlg.classList.remove('at-cursor');
  dlg.style.left = '';
  dlg.style.top = '';
  dlg.style.width = '';
  dlg.style.height = '';
}

export function placeCursorDialog(dlg: HTMLElement, at: { x: number; y: number }): void {
  dlg.classList.add('at-cursor');
  const place = cursorDialogPlacement(
    at,
    { width: dlg.offsetWidth, height: dlg.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  );
  dlg.style.left = `${place.left}px`;
  dlg.style.top = `${place.top}px`;
}

export function gitDialog(title: string, body: string, onOk: () => void, at?: { x: number; y: number }): void {
  state.dialogOk = onOk;
  state.gitDialogAt = at ?? null;
  state.pendingAmend = null;
  $('git-title').textContent = title;
  $('git-body').innerHTML = body;
  $('git-ok').disabled = false;
  syncGitOkFromRemotes();
  syncDeleteBranchForm();
  syncLanePriorityForm();
  syncAmendForm();
  syncSquashForm();
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

export function selectedPushRemotes(): string[] {
  const checked = [...$('git-body').querySelectorAll<HTMLInputElement>('input[name="rm"]:checked')].map((el) => el.value);
  if (checked.length) return checked;
  const sel = $('git-body').querySelector<HTMLSelectElement>('select#rm');
  return sel?.value ? [sel.value] : [];
}

export function syncDeleteBranchForm(): void {
  const force = document.getElementById('fr') as HTMLInputElement | null;
  const warn = document.getElementById('del-unmerged');
  if (!force || !warn) return;
  const stored = deleteBranchConfirm(state.deleteBranchMerge, force.checked);
  warn.hidden = !stored.showWarning;
  $('git-ok').disabled = !stored.okEnabled;
}

export function syncLanePriorityForm(): void {
  const pattern = document.getElementById('lp-pattern') as HTMLInputElement | null;
  const priority = document.getElementById('lp-priority') as HTMLInputElement | null;
  if (!pattern || !priority) return;
  const text = priority.value.trim();
  const n = Number(text);
  $('git-ok').disabled = !pattern.value.trim() || text === '' || !Number.isFinite(n);
}

export function syncAmendForm(): void {
  const subject = document.getElementById('am-subject') as HTMLInputElement | null;
  if (!subject) return;
  $('git-ok').disabled = !subject.value.trim();
}

export function syncSquashForm(): void {
  const message = document.getElementById('sq-msg') as HTMLTextAreaElement | null;
  if (!message) return;
  $('git-ok').disabled = !message.value.trim();
}

export function syncGitOkFromRemotes(): void {
  if ($('git-body').querySelector('[data-push-optional]')) return;
  const boxes = $('git-body').querySelectorAll<HTMLInputElement>('input[name="rm"]');
  const sel = $('git-body').querySelector<HTMLSelectElement>('select#rm');
  if (!boxes.length && !sel) return;
  $('git-ok').disabled = selectedPushRemotes().length === 0;
}

export function indexRemoteTags(tags: RemoteTagTip[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags) map.set(`${tag.remote}\0${tag.name}`, tag.commit);
  return map;
}

export function tagMarkName(): string {
  if (!state.tagMark) return '';
  if (state.tagMark.name != null) return state.tagMark.name;
  const raw = (document.getElementById('tn') as HTMLInputElement | null)?.value ?? '';
  return applySpaceSubstitution(raw, state.snap?.config.dialogs.spaceSubstitution ?? 'keep');
}

export function paintRemoteTagError(errors: readonly RemoteTagError[]): void {
  const el = document.getElementById('tag-remote-err');
  if (!el) return;
  const text = remoteTagErrorText(errors);
  el.textContent = text;
  el.hidden = !text;
}

export function paintTagRemoteMarks(): void {
  if (!state.tagMark) return;
  const name = tagMarkName();
  const iconFor = (remote: string) =>
    state.remoteTagLoading
      ? tagRemoteLoadingIcon()
      : tagOnRemoteIcon(tagOnRemote(state.tagMark!.commit, remote ? state.remoteTagCommits.get(`${remote}\0${name}`) : undefined));
  for (const el of $('git-body').querySelectorAll<HTMLElement>('[data-tag-mark]')) el.innerHTML = iconFor(el.dataset.tagMark ?? '');
  const sel = $('git-body').querySelector<HTMLSelectElement>('select#rm');
  const selMark = document.getElementById('rm-mark');
  if (sel && selMark) selMark.innerHTML = iconFor(sel.value);
}

export function watchRemoteTags(commit: string, name: string | null): void {
  state.tagMark = { commit, name };
  state.remoteTagCommits = new Map();
  state.remoteTagLoading = (state.snap?.remotes.length ?? 0) > 0;
  paintTagRemoteMarks();
  if (!state.remoteTagLoading || !state.snap) return;
  const requestId = String(++state.remoteTagSeq);
  state.remoteTagReq = requestId;
  post({ type: 'remoteTags', requestId, remotes: state.snap.remotes.map((remote) => remote.name) });
}

export function showConfirmTip(message: string, onOk: () => void, x: number, y: number, okLabel = t('Delete')): void {
  state.confirmOk = onOk;
  $('confirm-msg').textContent = message;
  $('confirm-ok').textContent = okLabel;
  placePopover($('pop-confirm'), x, y);
}

export function closeConfirmTip(): void {
  state.confirmOk = null;
  $('pop-confirm').hidePopover?.();
}

export function canCompareWithHead(hash: string): boolean {
  return Boolean(hash && state.snap?.head && hash !== state.snap.head);
}

export function startCompare(a: string, b: string, names?: { left?: string; right?: string }): void {
  if (!a || !b) return;
  state.pickedBranches = [];
  state.selected = a;
  state.compare = b;
  state.compareAnchor = a;
  state.compareLeftName = names?.left;
  state.compareRightName = names?.right;
  post({ type: 'compare', a, b });
  persistView();
  paint();
}

export function fillCompareList(): void {
  if (!state.snap) return;
  const picked = comparePick({
    refs: state.snap.filterRefs ?? [],
    commits: state.snap.commits,
    query: ($('cmp-q') as HTMLInputElement).value,
    limit: state.snap.config.refsListLimit,
    branchSort: state.snap.config.branchSort,
    tagSort: state.snap.config.tagSort,
  });
  state.compareRows = picked.sections.flatMap((section) => section.items);
  if (state.compareActive >= state.compareRows.length) state.compareActive = 0;
  let index = 0;
  $('cmp-list').innerHTML = picked.sections
    .map((section) => {
      const rows = section.items
        .map((item) => {
          const i = index++;
          const on = i === state.compareActive ? ' aria-selected="true"' : '';
          const detail = item.detail ? `<span class="cmp-detail">${esc(item.detail)}</span>` : '';
          const paint = item.kind === 'commit' ? { mark: '', name: '' } : refRowColourAttrs({ kind: item.kind, name: item.label });
          return `<button type="button" class="ref-item kind-${item.kind}" role="option" data-cmp="${i}"${on}><span class="ref-mark" aria-hidden="true"${paint.mark}></span><span class="ref-name"${paint.name}>${esc(item.label)}</span>${detail}</button>`;
        })
        .join('');
      return `<div class="cmp-section"><div class="cmp-h">${esc(section.title)}</div>${rows}</div>`;
    })
    .join('');
  $('cmp-empty').hidden = state.compareRows.length > 0;
  $('cmp-more').hidden = !picked.truncated;
  $('cmp-list').querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

export function openCompareDialog(base: string, baseName?: string): void {
  if (!base || !state.snap) return;
  state.compareBase = base;
  state.compareBaseName = baseName;
  state.compareActive = 0;
  ($('cmp-q') as HTMLInputElement).value = '';
  fillCompareList();
  ($('dlg-compare') as unknown as HTMLDialogElement).showModal();
  $('cmp-q').focus();
}

export function chooseCompare(index: number): void {
  const row = state.compareRows[index];
  const base = state.compareBase;
  if (!row || !base) return;
  ($('dlg-compare') as unknown as HTMLDialogElement).close();
  const right = row.kind === 'head' || row.kind === 'remote' ? row.label : undefined;
  startCompare(base, row.rev, { left: state.compareBaseName, right });
}

export function mergeBody(from: string): string {
  const dialogs = state.snap!.config.dialogs;
  return mergeDialogHtml({
    into: state.snap!.currentBranch,
    from,
    noCommit: dialogs.mergeNoCommit,
    noFastForward: dialogs.mergeNoFastForward,
    squash: dialogs.mergeSquash,
  });
}

export function rebaseBody(onto: string, interactive?: boolean): string {
  const dialogs = state.snap!.config.dialogs;
  return rebaseDialogHtml({
    onto,
    from: state.snap!.currentBranch,
    ignoreDate: dialogs.rebaseIgnoreDate,
    ...(interactive === undefined ? {} : { interactive }),
  });
}
