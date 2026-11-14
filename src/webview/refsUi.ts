import { t } from '@vscode/l10n';
import { firstCommitIndexForDate, localDayBounds } from '../shared/date';
import { commitHidden, copyDateFilter, dateBuckets, filterBuckets, revealCommitMonths, yearCheck } from '../shared/dateFilter';
import { ROW, shortcutLabel } from '../shared/graph';
import { copyPersonFilter, filterPeople, personBuckets, personHidden, personLabel, revealCommitPeople } from '../shared/personFilter';
import { filterRefsForTab, refDisplayName, refJumpHash, refLogArg, repoChoices, sortFilterRefs, windowRefs } from '../shared/refsList';
import { UNCOMMITTED } from '../shared/types';
import type { FilterTab } from '../shared/refsList';
import type { GraphRef } from '../shared/types';
import { post } from './host';
import { persistView, state } from './state';
import { $, esc } from './dom';
import { displayIndexForCommit, expandedRemoteLabels, paint, refRowColourAttrs, remoteLabelKey } from './paint';

export function fillRepos(): void {
  if (!state.snap) return;
  const choices = repoChoices(state.snap.repos, state.snap.repoPath);
  const current = choices.find((c) => c.current) ?? choices[0];
  $('repo-name').textContent = current?.name ?? '';
  $('btn-repo').setAttribute('title', current?.path ?? '');
  $('repo-list').innerHTML = choices
    .map(
      (c) =>
        `<label class="repo-row"><input type="radio" name="repo-pick" value="${esc(c.path)}"${c.current ? ' checked' : ''} />` +
        `<span class="repo-names"><span class="repo-name">${esc(c.name)}</span><span class="repo-path">${esc(c.path)}</span></span></label>`,
    )
    .join('');
  const show = state.snap.repos.length > 1;
  $('btn-repo').hidden = !show;
  $('btn-repo-help').hidden = !show;
  if (!show) {
    $('pop-repo').hidePopover?.();
    $('pop-repo-help').hidePopover?.();
  }
}

export function filterCatalog(): GraphRef[] {
  if (!state.snap) return [];
  const globs = state.snap.globPatterns.map((g) => ({ kind: 'head' as const, name: `glob:${g.name}`, hash: g.glob }));
  return [...(state.snap.filterRefs ?? []), ...globs];
}

export function sameCommitBranchesShown(): boolean {
  return state.snap?.repoSettings.showSameCommitBranches !== false;
}

export function startFilterDraft(): void {
  if (!state.snap) return;
  state.filterDraft = {
    showAll: state.snap.selectedBranches === 'all',
    showRemotes: state.snap.config.showRemoteBranches,
    showSameCommitBranches: sameCommitBranchesShown(),
    tab: 'branch',
    picked: new Set(state.snap.selectedBranches === 'all' ? [] : state.snap.selectedBranches),
    shown: state.snap.config.refsListLimit,
  };
}

export function applyFilter(): void {
  if (!state.filterDraft) return;
  const branches = state.filterDraft.showAll ? 'all' : [...state.filterDraft.picked];
  post({
    type: 'setFilter',
    branches,
    showRemotes: state.filterDraft.showRemotes,
    showSameCommitBranches: state.filterDraft.showSameCommitBranches,
  });
}

export function fillRefs(): void {
  if (!state.snap) return;
  if ($('pop-refs').matches(':popover-open') && !state.filterDraft) startFilterDraft();
  const draft = state.filterDraft ?? {
    showAll: state.snap.selectedBranches === 'all',
    showRemotes: state.snap.config.showRemoteBranches,
    showSameCommitBranches: sameCommitBranchesShown(),
    tab: 'branch' as FilterTab,
    picked: new Set(state.snap.selectedBranches === 'all' ? [] : state.snap.selectedBranches),
    shown: state.snap.config.refsListLimit,
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
    state.snap.config.branchSort,
    state.snap.config.tagSort,
  );
  const list = $('ref-list');
  const top = list.scrollTop;
  const visible = windowRefs(sorted, draft.shown);
  const catalog = filterCatalog();
  const loaded = new Set(state.snap.commits.map((commit) => commit.hash));
  list.innerHTML = visible
    .map((r) => {
      const rev = refLogArg(r);
      const detached = r.kind === 'head' && r.name === 'HEAD';
      const kindTitle = r.kind === 'head' ? t('Branch') : r.kind === 'remote' ? t('Remote') : r.kind === 'tag' ? t('Tag') : r.kind === 'worktree' ? t('Worktree') : r.kind;
      const paint = refRowColourAttrs(r);
      const label = refDisplayName(r);
      return `<div class="ref-line">${refJumpButton(r, refJumpHash(r, catalog, loaded))}<label class="ref-item kind-${r.kind}${detached ? ' detached' : ''}"><input type="checkbox" data-ref="${esc(rev)}" ${draft.picked.has(rev) ? 'checked' : ''}/><span class="ref-mark" title="${esc(kindTitle)}"${paint.mark}></span><span class="ref-name" title="${esc(label)}"${paint.name}>${esc(label)}</span></label></div>`;
    })
    .join('');
  list.scrollTop = top;
}

export const REF_JUMP_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="2.35" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="0.9" fill="currentColor"/><path d="M8 1.4v2.15M8 12.45v2.15M1.4 8h2.15M12.45 8h2.15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

export function refJumpButton(r: GraphRef, hash: string | null): string {
  if (!hash) {
    return `<button type="button" class="ref-jump" disabled title="${t('A pattern does not point at one commit')}" aria-label="${t('Cannot jump to a pattern')}">${REF_JUMP_ICON}</button>`;
  }
  const label = r.name === 'HEAD' ? t('Jump to HEAD') : t('Jump to {0}', refDisplayName(r));
  return `<button type="button" class="ref-jump" data-jump="${esc(hash)}" title="${esc(label)}" aria-label="${esc(label)}">${REF_JUMP_ICON}</button>`;
}

export function hideRefJumpMiss(): void {
  const miss = $('ref-jump-miss');
  miss.hidden = true;
  miss.textContent = '';
  miss.classList.remove('is-error');
}

export function showRefJumpMiss(message: string, error: boolean): void {
  const miss = $('ref-jump-miss');
  miss.hidden = false;
  miss.textContent = message;
  miss.classList.toggle('is-error', error);
}

export function jumpToRef(hash: string): void {
  if (!state.snap || !hash) return;
  if (state.snap.commits.some((commit) => commit.hash === hash)) {
    state.pendingRefJump = null;
    hideRefJumpMiss();
    scrollToHash(hash);
    return;
  }
  if (!state.snap.hasMore) {
    state.pendingRefJump = null;
    showRefJumpMiss(t('That commit is not in the loaded graph.'), true);
    return;
  }
  if (state.pendingRefJump === hash) return;
  state.pendingRefJump = hash;
  showRefJumpMiss(t('Loading history…'), false);
  post({ type: 'loadUntil', hash, index: -1 });
}

export function continueRefJump(): void {
  if (!state.pendingRefJump || !state.snap) return;
  if (state.snap.commits.some((commit) => commit.hash === state.pendingRefJump)) {
    const hash = state.pendingRefJump;
    state.pendingRefJump = null;
    hideRefJumpMiss();
    scrollToHash(hash);
    return;
  }
  if (!state.snap.hasMore) {
    state.pendingRefJump = null;
    showRefJumpMiss(t('That commit is not in the loaded graph.'), true);
  }
}

export function fillDates(): void {
  if (!state.snap) return;
  const draft = state.dateDraft ?? state.dateFilter;
  const hidden = draft[state.dateTab];
  const buckets = filterBuckets(dateBuckets(state.snap.commits, state.dateTab), $('date-q').value);
  $('date-show-all').checked = hidden.size === 0;
  $('date-tab-author').setAttribute('aria-selected', String(state.dateTab === 'author'));
  $('date-tab-committer').setAttribute('aria-selected', String(state.dateTab === 'committer'));
  const list = $('date-list');
  const top = list.scrollTop;
  list.innerHTML = buckets
    .map((year) => {
      const stored = yearCheck(year, draft, state.dateTab);
      const months = year.months
        .map((month) => {
          const checked = !hidden.has(month.key);
          return `<label class="ref-item date-item"><input type="checkbox" data-month="${esc(month.key)}" ${checked ? 'checked' : ''}/><span class="ref-name">${String(month.month).padStart(2, '0')}</span><span class="date-count">${month.count.toLocaleString('en-US')}</span></label>`;
        })
        .join('');
      return `<div class="date-year"><label class="ref-item date-item"><input type="checkbox" data-year="${year.year}" ${stored === 'checked' ? 'checked' : ''}/><span class="ref-name">${year.year}</span><span class="date-count">${year.count.toLocaleString('en-US')}</span></label><div class="date-months">${months}</div></div>`;
    })
    .join('');
  for (const box of list.querySelectorAll<HTMLInputElement>('[data-year]')) {
    const year = buckets.find((item) => String(item.year) === box.dataset.year);
    box.indeterminate = !!year && yearCheck(year, draft, state.dateTab) === 'mixed';
  }
  list.scrollTop = top;
}

export function applyDateFilter(): void {
  if (state.dateDraft) state.dateFilter = copyDateFilter(state.dateDraft);
  $('pop-dates').hidePopover?.();
  paint();
  persistView();
}

export function fillPeople(): void {
  if (!state.snap) return;
  const draft = state.personDraft ?? state.personFilter;
  const hidden = draft[state.personTab];
  const buckets = filterPeople(personBuckets(state.snap.commits, state.personTab), $('person-q').value);
  $('person-show-all').checked = hidden.size === 0;
  $('person-tab-author').setAttribute('aria-selected', String(state.personTab === 'author'));
  $('person-tab-committer').setAttribute('aria-selected', String(state.personTab === 'committer'));
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

export function applyPersonFilter(): void {
  if (state.personDraft) state.personFilter = copyPersonFilter(state.personDraft);
  $('pop-contributor').hidePopover?.();
  paint();
  persistView();
}

export function fillRemotes(): void {
  if (!state.snap) return;
  $('remote-list').innerHTML = state.snap.remotes
    .map(
      (r) =>
        `<div class="remote-row"><span class="remote-name">${esc(r.name)}</span><button type="button" class="remote-act" data-ed="${esc(r.name)}">${t('Edit')}</button><button type="button" class="remote-del" data-del="${esc(r.name)}">${t('Delete')}</button></div>`,
    )
    .join('');
}

export function fillLanePriority(): void {
  if (!state.snap) return;
  $('lane-list').innerHTML = state.snap.config.lanePriority
    .map(
      (rule, index) =>
        `<div class="remote-row"><span class="remote-name">${esc(rule.pattern)}</span><span class="lane-pri">${esc(String(rule.priority))}</span><button type="button" class="remote-act" data-lane-ed="${index}">${t('Edit')}</button><button type="button" class="remote-del" data-lane-del="${index}">${t('Delete')}</button></div>`,
    )
    .join('');
}

export function fillPr(): void {
  if (!state.snap) return;
  const names = ['GitHub', 'GitLab', 'Bitbucket', ...state.snap.customPrProviders.map((p) => p.name)];
  $('pr-provider').innerHTML = names.map((n) => `<option>${esc(n)}</option>`).join('');
}

export function scrollToHash(hash: string): void {
  if (!state.snap) return;
  const i = state.snap.commits.findIndex((c) => c.hash === hash);
  if (i < 0) return;
  const commit = state.snap.commits[i]!;
  if (commitHidden(commit, state.dateFilter)) {
    state.dateFilter = revealCommitMonths(state.dateFilter, commit);
    if (state.dateDraft) state.dateDraft = revealCommitMonths(state.dateDraft, commit);
    fillDates();
  }
  if (personHidden(commit, state.personFilter)) {
    state.personFilter = revealCommitPeople(state.personFilter, commit);
    if (state.personDraft) state.personDraft = revealCommitPeople(state.personDraft, commit);
    fillPeople();
  }
  paint();
  const row = displayIndexForCommit(i);
  if (row >= 0) $('scroll').scrollTop = row * ROW - 80;
}

export function todayInputValue(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function dateJumpField(): 'author' | 'committer' {
  return $('date-kind-committer').checked ? 'committer' : 'author';
}

export function continueDateJump(): void {
  if (!state.snap || !state.pendingDateJump) return;
  const miss = $('date-jump-miss');
  miss.hidden = true;
  const hit = firstCommitIndexForDate(
    state.snap.commits,
    localDayBounds(state.pendingDateJump.day),
    state.pendingDateJump.field,
    UNCOMMITTED,
  );
  if (hit.index >= 0) {
    state.pendingDateJump = null;
    scrollToHash(state.snap.commits[hit.index]!.hash);
    $('pop-date').hidePopover?.();
    return;
  }
  if (hit.status === 'need-more' && state.snap.hasMore) {
    post({ type: 'more' });
    return;
  }
  state.pendingDateJump = null;
  miss.hidden = false;
}

export function startDateJump(): void {
  const day = $('date-jump-input').value;
  if (!day || !state.snap) return;
  state.pendingDateJump = { day, field: dateJumpField() };
  continueDateJump();
}

export function fillHelp(): void {
  const k = state.snap?.config.keyboard ?? {
    find: 'mod+f',
    refresh: 'mod+r',
    scrollToHead: 'mod+h',
    scrollToStash: 'mod+s',
  };
  const rows: Array<[string, string]> = [
    [t('Undo'), 'Ctrl/Cmd+Z'],
    [t('Redo'), 'Ctrl/Cmd+Shift+Z'],
    [t('Find'), shortcutLabel(k.find)],
    [t('Find next'), 'F3'],
    [t('Find previous'), 'Shift+F3'],
    [t('Refresh'), shortcutLabel(k.refresh)],
    [t('Jump to HEAD'), shortcutLabel(k.scrollToHead)],
    [t('Jump to stash'), shortcutLabel(k.scrollToStash)],
  ];
  $('help-keys').innerHTML = rows.map(([l, v]) => `<dt>${esc(l)}</dt><dd><kbd>${esc(v)}</kbd></dd>`).join('');
}

export function setRemoteLabelsExpanded(hash: string, branch: string, expanded: boolean): void {
  const key = remoteLabelKey(hash, branch);
  if (expanded) {
    expandedRemoteLabels.add(key);
    state.remoteLabelsExpandedAt = performance.now();
  } else expandedRemoteLabels.delete(key);
  paint();
}
