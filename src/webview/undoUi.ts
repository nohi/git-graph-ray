import { t } from '@vscode/l10n';
import { ROW, colourForLane, edgeCurveAt, edgePath, graphWidth, laneX, rowY } from '../shared/graph';
import { layoutCommits } from '../shared/layout';
import { groupChipRefs, isCheckedOutBranch } from '../shared/refsList';
import { formatRefChange, presentPreview } from '../shared/undo';
import type { GitAction, HostToView } from '../shared/protocol';
import type { GraphCommit, GraphRef } from '../shared/types';
import { post } from './host';
import { state } from './state';
import { $, esc } from './dom';
import { bindPopoverAnchor } from './popovers';
import { chipColourAttrs, chipFace, chipPairHtml } from './paint';

export function placeBusyHint(): void {
  const hint = $('git-busy-hint');
  const size = 18;
  const offset = 12;
  hint.style.left = `${Math.max(4, Math.min(state.lastPointer.x + offset, window.innerWidth - size - 4))}px`;
  hint.style.top = `${Math.max(4, Math.min(state.lastPointer.y + offset, window.innerHeight - size - 4))}px`;
}

export function setGitBusy(on: boolean, fetch = false): void {
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

export function sendGit(action: GitAction): void {
  setGitBusy(true, action.kind === 'fetchRemote');
  post({ type: 'git', action });
}

export function paintUndoButtons(): void {
  const busy = document.documentElement.classList.contains('git-busy');
  setHistoryButton($('btn-undo'), $('btn-undo-menu'), state.undoButtons.canUndo && !busy, state.undoButtons.undoLabel, 'undo', 'Ctrl/Cmd+Z');
  setHistoryButton($('btn-redo'), $('btn-redo-menu'), state.undoButtons.canRedo && !busy, state.undoButtons.redoLabel, 'redo', 'Ctrl/Cmd+Shift+Z');
}

export function setHistoryButton(el: HTMLElement, menu: HTMLElement, enabled: boolean, label: string | null, direction: 'undo' | 'redo', keys: string): void {
  for (const node of [el, menu]) {
    node.classList.toggle('is-disabled', !enabled);
    node.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }
  const verb = direction === 'undo' ? t('Undo') : t('Redo');
  const empty = direction === 'undo' ? t('Nothing to undo') : t('Nothing to redo');
  const history = direction === 'undo' ? t('Undo history') : t('Redo history');
  el.title = label ? t('{0}: {1} ({2})', verb, label, keys) : empty;
  menu.title = enabled ? history : empty;
}

export function closeHistoryMenus(): void {
  for (const id of ['pop-undo', 'pop-redo']) {
    const pop = $(id);
    if (pop.matches(':popover-open')) pop.hidePopover?.();
  }
}

export function requestHistory(direction: 'undo' | 'redo', steps = 1): void {
  const enabled = direction === 'undo' ? state.undoButtons.canUndo : state.undoButtons.canRedo;
  const labels = direction === 'undo' ? state.undoButtons.undoLabels : state.undoButtons.redoLabels;
  if (!enabled || steps < 1 || steps > labels.length || document.documentElement.classList.contains('git-busy')) return;
  closeHistoryMenus();
  post({ type: direction, steps });
}

export function bindHistoryMenu(direction: 'undo' | 'redo'): void {
  const menu = $(direction === 'undo' ? 'btn-undo-menu' : 'btn-redo-menu');
  const pop = $(direction === 'undo' ? 'pop-undo' : 'pop-redo');
  pop.addEventListener('beforetoggle', (ev) => {
    if ((ev as ToggleEvent).newState !== 'open') return;
    const labels = direction === 'undo' ? state.undoButtons.undoLabels : state.undoButtons.redoLabels;
    if (menu.classList.contains('is-disabled') || !labels.length) {
      ev.preventDefault();
      return;
    }
    const verb = direction === 'undo' ? t('Undo') : t('Redo');
    pop.innerHTML = labels
      .map((label, index) => {
        const steps = index + 1;
        const count = steps > 1 ? `<span class="hist-count">${t('{0} steps', steps)}</span>` : '';
        const hint = steps === 1 ? label : t('{0} {1} steps, including newer entries', verb, steps);
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

export function showUndoPreview(m: Extract<HostToView, { type: 'undoPreview' }>): void {
  if (!state.snap) return;
  state.undoPending = m.direction;
  state.undoSteps = m.steps;
  state.undoPreviewMsg = m;
  const verb = m.direction === 'undo' ? t('Undo') : t('Redo');
  $('undo-title').textContent = t('{0} {1}', verb, m.label);
  const warn = $('undo-warning');
  warn.hidden = !m.warning;
  warn.textContent = m.warning ?? '';
  ($('undo-side') as HTMLInputElement).checked = state.undoSideBySide;
  ($('undo-unrelated') as HTMLInputElement).checked = state.undoShowUnrelated;
  ($('undo-head') as HTMLInputElement).checked = state.undoShowHead;
  renderUndoGraphs();
  $('undo-changes').innerHTML = m.changes.map((change) => `<li>${esc(formatRefChange(change))}</li>`).join('');
  $('undo-cmds').textContent = m.commands.join('\n');
  $('undo-ok').textContent = verb;
  const dlg = document.getElementById('dlg-undo') as HTMLDialogElement;
  if (!dlg.open) dlg.showModal();
}

export function renderUndoGraphs(): void {
  const m = state.undoPreviewMsg;
  const graphs = $('undo-graphs');
  const options = $('undo-options');
  if (!m?.showGraphs || !state.snap) {
    graphs.hidden = true;
    options.hidden = true;
    graphs.innerHTML = '';
    return;
  }
  graphs.hidden = false;
  options.hidden = false;
  graphs.classList.toggle('side-by-side', state.undoSideBySide);
  const view = presentPreview(m.before, m.after, {
    showUnrelated: state.undoShowUnrelated,
    showHead: state.undoShowHead,
    head: { branch: m.headBranch, hash: m.beforeHead },
  });
  const empty = view.before.length === 0 && view.after.length === 0;
  graphs.innerHTML = empty
    ? `<p class="dlg-note">${t('Those commits are outside the loaded history.')}</p>`
    : `${undoSide(t('Before'), view.before, m.beforeHead)}${undoSide(t('After'), view.after, m.afterHead)}`;
}

export function undoSide(title: string, commits: GraphCommit[], head: string | null): string {
  if (!commits.length) return `<section class="undo-side"><h3>${esc(title)}</h3><p class="dlg-note">${t('No visible commits')}</p></section>`;
  const drawn = undoGraph(commits, head);
  const rows = commits
    .map((commit) => {
      const refs = state.undoShowUnrelated ? undoChips(commit.refs) : commit.refs.map((ref) => `<span class="refs${ref.ghost ? ' ghost' : ''}">${esc(ref.name)}</span>`).join('');
      return `<div class="undo-row${commit.ghost ? ' ghost' : ''}"><span class="hash">${esc(commit.hash.slice(0, 7))}</span><span class="subj">${esc(commit.subject)}</span>${refs}</div>`;
    })
    .join('');
  return `<section class="undo-side"><h3>${esc(title)}</h3><div class="undo-board"><svg width="${drawn.width}" height="${drawn.height}" aria-hidden="true">${drawn.svg}</svg><div class="undo-rows">${rows}</div></div></section>`;
}

export function undoChips(refs: GraphRef[]): string {
  if (!state.snap || !refs.length) return '';
  const groups = groupChipRefs(refs, state.snap.config.combineLocalAndRemote);
  const mk = (ref: GraphRef, short = false) => {
    const detached = ref.kind === 'head' && ref.name === 'HEAD';
    const current = isCheckedOutBranch(ref, state.snap!.currentBranch);
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

export function undoGraph(commits: GraphCommit[], head: string | null): { svg: string; width: number; height: number } {
  const layout = layoutCommits(commits, state.snap!.config.lanePriority);
  const height = Math.max(commits.length, 1) * ROW;
  const theme = state.snap!.config.theme === 'Ray Stream' ? 'classic' : state.snap!.config.theme;
  const nodeAt = new Set(layout.vertices.map((vertex) => `${vertex.row}:${vertex.lane}`));
  const parts: string[] = [];
  for (const edge of layout.edges) {
    const from = commits[edge.fromRow];
    const fromVertex = layout.vertices[edge.fromRow];
    const fromIsMerge = !!from && from.parents.length > 1 && fromVertex?.lane === edge.fromLane;
    const colour = colourForLane(edge.lane, state.snap!.config.graphColours, theme);
    const d = edgePath(
      laneX(edge.fromLane),
      rowY(edge.fromRow),
      laneX(edge.toLane),
      rowY(edge.toRow),
      state.snap!.config.graphStyle,
      edgeCurveAt(nodeAt.has(`${edge.toRow}:${edge.toLane}`), fromIsMerge),
    );
    const ghost = commits[edge.fromRow]?.ghost || commits[edge.toRow]?.ghost;
    parts.push(`<path d="${d}" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round"${ghost ? ' stroke-dasharray="4 3" opacity="0.45"' : ''}/>`);
  }
  for (const vertex of layout.vertices) {
    const colour = colourForLane(vertex.lane, state.snap!.config.graphColours, theme);
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
