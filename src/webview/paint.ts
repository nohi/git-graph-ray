import { t } from '@vscode/l10n';
import { highlightFind } from '../shared/commitFind';
import { branchNameAt, compareBanners } from '../shared/compareSplit';
import { formatDate } from '../shared/date';
import { visibleCommitIndices } from '../shared/dateFilter';
import { commitMessageText, detailsMetaRows } from '../shared/detailsMeta';
import { shortRevLabel } from '../shared/diffSides';
import { buildFileTree, folderFoldPlan } from '../shared/fileTree';
import { DETAILS_MAX, DETAILS_MIN, RAY_STREAM_PERIOD, ROW, ancestorHashes, branchHistoryHashes, colourForLane, edgeCurveAt, estimateDetailsHeight, graphWidth, laneX, rayStreamGradient, rowTop, rowY, scrollNeededToRevealDetails, visibleRowRange } from '../shared/graph';
import { edgeTouchesRange, renderEdges, renderNodes } from '../shared/graphPaint';
import { applyEmoji, formatCommitMessageHtml } from '../shared/issueLinks';
import { foldBridgeEdges, historyEdgeHot, historyLanes, layoutCommits } from '../shared/layout';
import { personHidden } from '../shared/personFilter';
import { refLabelColour } from '../shared/refColours';
import { REMOTE_LABEL_FOLD, commitLabelKey, groupChipRefs, isCheckedOutBranch, refDisplayName, remoteChipText, remoteLabelsUseIcons, remoteShortName } from '../shared/refsList';
import { signatureColumn, signatureInfoRows, signatureSummary } from '../shared/signature';
import { UNCOMMITTED } from '../shared/types';
import type { CompareView } from '../shared/compareSplit';
import type { DetailsMetaRow, MetaCopyIcon } from '../shared/detailsMeta';
import type { FolderFoldPlan } from '../shared/fileTree';
import type { DrawnEdge, DrawnNode } from '../shared/graphPaint';
import type { Edge, Layout } from '../shared/layout';
import type { SignatureInfoRow } from '../shared/signature';
import type { CommitDetails, GraphCommit, GraphRef } from '../shared/types';
import { post } from './host';
import { state } from './state';
import { $, detailsAnchor, esc, findPressed, macPlatform, statusTitle, syncGraphClip, syncHeaderScroll } from './dom';

export const rowByHash = new Map<string, HTMLDivElement>();

export /** Expanded remote bundles, keyed by commit hash and branch name. */
const expandedRemoteLabels = new Set<string>();

export function paintGraphSvg(svg: HTMLElement, markup: string, stream: boolean, height: number): void {
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

export function syncStreamGradient(svg: HTMLElement, height: number): void {
  const grad = svg.querySelector('#ray-stream');
  if (!grad) return;
  const h = Math.max(Math.round(height), 1);
  grad.setAttribute('y1', String(h));
  grad.setAttribute('y2', String(h - RAY_STREAM_PERIOD));
}

export function detailsHeightCap(): number {
  return state.snap?.config.detailsMaxHeight ?? DETAILS_MAX;
}

export function estimateFromDetails(d: CommitDetails): number {
  const dates = state.snap
    ? { author: formatDate(d.authorDate, state.snap.config.dateFormat), committer: formatDate(d.committerDate, state.snap.config.dateFormat) }
    : { author: '', committer: '' };
  const sigRows = state.signatureOpen ? signatureRows(d.signature).length + 1 : 1;
  return estimateDetailsHeight({
    message: commitMessageText(d),
    fileCount: shownCompareFileCount(d),
    metaRowCount: detailsMetaRows(d, dates).length + sigRows,
    maxHeight: detailsHeightCap(),
  });
}

export function currentDetailsHeight(): number {
  if (state.detailsH != null) return Math.max(DETAILS_MIN, state.detailsH);
  return state.autoDetailsH;
}

export function measureNaturalDetailsHeight(): number {
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

export function scheduleFitDetails(): void {
  const gen = ++state.fitGen;
  requestAnimationFrame(() => {
    if (gen !== state.fitGen || !state.details) return;
    if (state.detailsH == null) {
      const next = Math.min(detailsHeightCap(), Math.max(DETAILS_MIN, measureNaturalDetailsHeight()));
      if (Math.abs(next - state.autoDetailsH) > 2) {
        state.autoDetailsH = next;
        paint();
      }
    }
    ensureDetailsVisible();
  });
}

export function ensureDetailsVisible(): void {
  if (!state.snap || !state.details || state.snap.config.detailsLocation === 'bottom') return;
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

export function shownCommits(): number[] {
  if (!state.snap) return [];
  const key = dateFilterKey();
  if (state.shownCache?.commits === state.snap.commits && state.shownCache.key === key) return state.shownCache.rows;
  const commits = state.snap.commits;
  const rows = visibleCommitIndices(commits, state.dateFilter).filter((index) => !personHidden(commits[index]!, state.personFilter));
  state.shownCache = { commits, key, rows };
  return rows;
}

export function fullLayout(): Layout {
  return layoutState().layout;
}

export function lanePriorityMark(): string {
  const combine = state.snap?.config.lanePriorityCombineRemotes ?? true;
  return `${combine ? '1' : '0'}\n${state.snap?.config.lanePriority.map((rule) => `${rule.pattern}\0${rule.priority}`).join('\n') ?? ''}`;
}

export function layoutState(): { layout: Layout; byFrom: Edge[][] } {
  if (!state.snap) return { layout: { vertices: [], edges: [], maxLanes: 1 }, byFrom: [] };
  const priority = lanePriorityMark();
  if (state.layoutCache?.commits === state.snap.commits && state.layoutCache.priority === priority) return state.layoutCache;
  const layout = layoutCommits(state.snap.commits, state.snap.config.lanePriority, state.snap.config.lanePriorityCombineRemotes);
  const byFrom: Edge[][] = [];
  for (const edge of layout.edges) (byFrom[edge.fromRow] ??= []).push(edge);
  state.layoutCache = { commits: state.snap.commits, priority, layout, byFrom };
  return state.layoutCache;
}

export function displayIndex(rows: readonly number[]): Map<number, number> {
  if (state.displayCache?.rows === rows) return state.displayCache.map;
  const map = new Map<number, number>();
  for (let i = 0; i < rows.length; i++) map.set(rows[i]!, i);
  state.displayCache = { rows, map };
  return map;
}

export function displayIndexForCommit(commitIndex: number): number {
  if (commitIndex < 0) return -1;
  return shownCommits().indexOf(commitIndex);
}

export function displayIndexForHash(hash: string): number {
  if (!state.snap) return -1;
  return displayIndexForCommit(state.snap.commits.findIndex((commit) => commit.hash === hash));
}

export function detailsGap(rows: number[]): { after: number; height: number } | null {
  if (!state.snap || !state.details || state.snap.config.detailsLocation !== 'inline') return null;
  const anchor = detailsAnchor();
  if (!anchor) return null;
  const commitIndex = state.snap.commits.findIndex((commit) => commit.hash === anchor);
  const after = rows.indexOf(commitIndex);
  if (after < 0) return null;
  return { after, height: currentDetailsHeight() };
}

export function dateFilterKey(): string {
  const pack = (values: ReadonlySet<string>) => JSON.stringify([...values].sort());
  return `${[...state.dateFilter.author].sort().join(',')}|${[...state.dateFilter.committer].sort().join(',')}|${pack(state.personFilter.author)}|${pack(state.personFilter.committer)}`;
}

export function paint(): void {
  if (!state.snap) return;
  state.rowsDirty = true;
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

export function paintViewport(): void {
  if (!state.snap) return;
  const rows = shownCommits();
  const gap = detailsGap(rows);
  const height = rows.length * ROW + (gap ? gap.height : 0);
  const range = viewRange(rows, gap);
  if (viewportStale(rows, gap, range)) paintRows(rows, gap, height, range);
  paintGraph(rows, gap, height, range);
  syncHeaderScroll();
}

export function scheduleViewportPaint(): void {
  if (state.viewportFrame) return;
  state.viewportFrame = requestAnimationFrame(() => {
    state.viewportFrame = 0;
    paintViewport();
    if (state.pendingDateJump || state.findPendingHash || state.pendingRefJump) return;
    if (state.snap?.hasMore && state.snap.config.loadMoreAutomatically) {
      const s = $('scroll');
      if (s.scrollTop + s.clientHeight > s.scrollHeight - 80) post({ type: 'more' });
    }
  });
}

export function viewRange(rows: readonly number[], gap: { after: number; height: number } | null): { start: number; end: number } {
  const scroll = $('scroll');
  return visibleRowRange({
    scrollTop: scroll.scrollTop,
    viewHeight: scroll.clientHeight,
    rowCount: rows.length,
    gap,
  });
}

export function viewportStale(
  rows: number[],
  gap: { after: number; height: number } | null,
  range: { start: number; end: number },
): boolean {
  return (
    state.rowsDirty ||
    state.viewportRows !== rows ||
    state.viewportStart !== range.start ||
    state.viewportEnd !== range.end ||
    state.viewportGapAfter !== (gap?.after ?? -1) ||
    state.viewportGapH !== (gap?.height ?? 0) ||
    state.viewportChrome !== rowChrome()
  );
}

export function rowChrome(): string {
  return `${state.selected ?? ''}\0${state.compare ?? ''}\0${state.commitRange.join('\0')}\0${state.pickedBranches.join('\0')}`;
}

export function paintGraph(
  rows: number[],
  gap: { after: number; height: number } | null,
  height: number,
  range: { start: number; end: number },
): void {
  if (!state.snap) return;
  const key = [
    rows.length,
    rows[0] ?? '',
    rows[rows.length - 1] ?? '',
    dateFilterKey(),
    gap?.after ?? '',
    gap?.height ?? '',
    state.snap.config.theme,
    state.snap.config.graphStyle,
    state.snap.config.graphColours.join(','),
    state.snap.config.uncommittedChanges,
    state.snap.head ?? '',
    state.snap.currentBranch ?? '',
    state.snap.hasMore ? '1' : '0',
    state.pickedBranches.join('\0'),
  ].join('|');
  if (state.graphCommits === state.snap.commits && key === state.graphKey && state.graphStart === range.start && state.graphEnd === range.end) return;
  const svg = $('svg');
  const { layout, byFrom } = layoutState();
  const displayOf = displayIndex(rows);
  const lanes = pickedLaneMask();
  const history = pickedHistory();
  const style = state.snap.config.graphStyle;
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
    const from = state.snap!.commits[fromCommitIndex];
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
        colour: colourForLane(lane, state.snap!.config.graphColours, state.snap!.config.theme),
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
    const commit = state.snap.commits[commitIndex];
    const colour = colourForLane(vertex.lane, state.snap.config.graphColours, state.snap.config.theme);
    const open =
      (commit?.hash === UNCOMMITTED && state.snap.config.uncommittedChanges !== 'head') ||
      (commit?.hash === state.snap.head && (state.snap.config.uncommittedChanges === 'head' || !state.snap.currentBranch));
    const isHead = commit?.hash === state.snap.head && commit.hash !== UNCOMMITTED;
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
  state.graphCommits = state.snap.commits;
  state.graphKey = key;
  state.graphStart = range.start;
  state.graphEnd = range.end;
  if (state.userG != null) document.documentElement.style.setProperty('--g', `${state.userG}px`);
  else document.documentElement.style.removeProperty('--g');
  svg.setAttribute('width', String(graphWidth(layout.maxLanes)));
  svg.setAttribute('height', String(height));
  paintGraphSvg(svg, renderEdges(edges, style, yAt) + renderNodes(nodes, yAt), state.snap.config.theme === 'Ray Stream', height);
}

export const NO_HISTORY: { set: Set<string> | null; lanes: boolean[][] | null } = { set: null, lanes: null };

export function pickedHistory(): Set<string> | null {
  return historyState().set;
}

export function pickedLaneMask(): boolean[][] | null {
  return historyState().lanes;
}

export function historyState(): { set: Set<string> | null; lanes: boolean[][] | null } {
  if (!state.snap || state.pickedBranches.length === 0) return NO_HISTORY;
  const key = state.pickedBranches.join('\0');
  if (state.historyCache?.commits === state.snap.commits && state.historyCache.key === key) return state.historyCache;
  const set = branchHistoryHashes(state.snap.commits, state.pickedBranches);
  const lanes = set ? historyLanes(fullLayout(), state.snap.commits, set) : null;
  state.historyCache = { commits: state.snap.commits, key, set, lanes };
  return state.historyCache;
}

export function headAncestors(): Set<string> | null {
  if (!state.snap?.config.muteNonAncestorsOfHead) return null;
  const head = state.snap.head;
  if (state.ancestorCache?.commits === state.snap.commits && state.ancestorCache.head === head) return state.ancestorCache.set;
  const set = ancestorHashes(state.snap.commits, head);
  state.ancestorCache = { commits: state.snap.commits, head, set };
  return set;
}

export function rowClass(c: GraphCommit, ancestors: Set<string> | null, history: Set<string> | null): string {
  if (!state.snap) return 'row';
  const muteMerge = state.snap.config.muteMergeCommits && c.parents.length > 1;
  const muteRow = Boolean(ancestors && c.hash !== UNCOMMITTED && !ancestors.has(c.hash));
  const onHistory = Boolean(history?.has(c.hash));
  return `row${muteMerge ? ' muted-merge' : ''}${muteRow ? ' muted' : ''}${onHistory ? ' branch-hist' : ''}${state.commitRange.includes(c.hash) ? ' range' : ''}${c.hash === state.selected ? ' sel' : ''}${state.compare && c.hash === state.selected ? ' cmp-base' : ''}${c.hash === state.compare ? ' cmp' : ''}${c.hash === state.snap.head ? ' head-commit' : ''}`;
}

export function rowContentMark(c: GraphCommit): string {
  if (!state.snap) return '';
  const flags = findFlags();
  const divergence = state.snap.divergence ? `${state.snap.divergence.ahead}:${state.snap.divergence.behind}` : '';
  return [
    $('find-q').value,
    flags.ignoreCase ? '1' : '0',
    flags.regex ? '1' : '0',
    state.faces.has(c.authorEmail) ? '1' : '0',
    state.snap.config.dateFormat,
    divergence,
    c.subject,
    c.authorName,
    c.committerName,
    String(c.authorDate),
    String(c.committerDate),
    c.signatureKind ?? '',
    state.snap.config.referenceLabelColours.map((rule) => `${rule.pattern}=${rule.colour}`).join(';'),
    commitLabelKey(state.snap.currentBranch, c.refs),
    c.refs
      .filter((r) => r.kind === 'head' && state.pickedBranches.includes(r.name))
      .map((r) => r.name)
      .join(','),
    remoteFoldMark(c.hash),
  ].join('\u001f');
}

export function rowInnerHtml(c: GraphCommit): string {
  if (!state.snap) return '';
  const avatar = state.faces.get(c.authorEmail);
  const desc = `${chips(c)}<span class="subj">${subjectHtml(c.subject)}</span>`;
  return `<div class="cell graph"></div>
      <div class="cell desc">${desc}</div>
      <div class="cell author">${avatar ? `<img src="${avatar}" width="14" height="14" alt="" /> ` : ''}${findMark(c.authorName)}</div>
      <div class="cell adate">${esc(formatDate(c.authorDate, state.snap.config.dateFormat))}</div>
      <div class="cell commit">${findMark(c.hash.slice(0, 7))}</div>
      <div class="cell committer">${findMark(c.committerName)}</div>
      <div class="cell cdate">${esc(formatDate(c.committerDate, state.snap.config.dateFormat))}</div>
      ${signatureCellHtml(c)}`;
}

export function paintRows(
  rows: number[],
  gap: { after: number; height: number } | null,
  height: number,
  range?: { start: number; end: number },
): void {
  if (!state.snap) return;
  const { start, end } = range ?? viewRange(rows, gap);
  const ancestors = headAncestors();
  const history = pickedHistory();
  const host = $('rows');
  const keep = new Set<string>();
  for (let i = start; i < end; i++) {
    const c = state.snap.commits[rows[i]!]!;
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
  if (state.snap.hasMore) {
    if (!more) {
      more = document.createElement('div');
      more.id = 'more';
      more.className = 'row';
      more.textContent = t('Load more');
      host.append(more);
    }
    more.style.position = 'absolute';
    more.style.top = `${height}px`;
    more.hidden = false;
  } else if (more) {
    more.remove();
  }
  state.rowsDirty = false;
  state.viewportRows = rows;
  state.viewportStart = start;
  state.viewportEnd = end;
  state.viewportGapAfter = gap?.after ?? -1;
  state.viewportGapH = gap?.height ?? 0;
  state.viewportChrome = rowChrome();
}

export function emojiMaps() {
  return state.snap?.emoji ?? [];
}

export function remoteLabelKey(hash: string, branch: string): string {
  return `${hash}\0${branch}`;
}

export function remoteFoldMark(hash: string): string {
  const prefix = `${hash}\0`;
  return [...expandedRemoteLabels].filter((key) => key.startsWith(prefix)).sort().join(',');
}

export function chips(c: GraphCommit): string {
  if (!state.snap) return '';
  const align = state.snap.config.referenceLabelAlignment;
  const dirtyTrees = new Set(state.snap.worktreeDirty ?? []);
  const groups = groupChipRefs(c.refs, state.snap.config.combineLocalAndRemote);
  const mk = (r: GraphRef, short = false, iconOnly = false) => {
    const detached = r.kind === 'head' && r.name === 'HEAD';
    const current = isCheckedOutBranch(r, state.snap!.currentBranch);
    const picked = r.kind === 'head' && !detached && state.pickedBranches.includes(r.name);
    const face = chipFace(r, short, iconOnly);
    const colour = chipColourAttrs(r);
    const divergence =
      current && state.snap!.divergence
        ? `<span class="divergence">${esc(t('{0} ahead · {1} behind', state.snap!.divergence.ahead, state.snap!.divergence.behind))}</span>`
        : '';
    const dirty = r.kind === 'worktree' && r.worktreePath != null && dirtyTrees.has(r.worktreePath);
    const tip =
      r.kind === 'worktree' && r.worktreePath != null
        ? `${r.worktreePath}${dirty ? ` — ${t('Has uncommitted changes')}` : ''}`
        : dirty
          ? t('Has uncommitted changes')
          : '';
    const tipAttr = tip ? ` title="${esc(tip)}"` : '';
    const tag = iconOnly ? 'button' : 'span';
    const type = iconOnly ? ' type="button"' : '';
    const cls = `chip ${r.kind}${face.extra}${detached ? ' detached' : ''}${current ? ' current' : ''}${picked ? ' picked' : ''}${dirty ? ' dirty' : ''}${colour.cls}`;
    return `<${tag}${type} class="${cls}"${colour.style}${face.title || tipAttr} data-kind="${r.kind}" data-name="${esc(r.name)}" data-hash="${esc(r.hash)}" data-remote="${esc(r.remote ?? '')}" data-wt="${esc(r.worktreePath ?? '')}">${face.icon}${iconOnly ? '' : findMark(face.label)}${divergence}</${tag}>`;
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
  if (align === 'split') return `<span class="refs">${left.map(html).join('')}</span>`;
  return `<span class="refs">${groups.map(html).join('')}</span>`;
}

export function chipPairHtml(branch: string, remoteCount: number, body: string, collapsed: boolean, interactive: boolean): string {
  const fold = interactive && remoteCount >= REMOTE_LABEL_FOLD;
  const cls = `chip-pair${fold ? ' foldable' : ''}${collapsed ? ' collapsed' : ''}`;
  const expanded = fold ? ` aria-expanded="${collapsed ? 'false' : 'true'}"` : '';
  const foldBtn = fold && !collapsed ? remoteFoldButton() : '';
  return `<span class="${cls}" data-fold="${esc(branch)}"${expanded}>${body}${foldBtn}</span>`;
}

export function detailsContentKey(): string {
  if (!state.snap || !state.details) return '';
  return [
    state.detailsStamp,
    state.details.hash,
    state.details.compare ?? '',
    state.snap.config.detailsLocation,
    state.snap.config.fileViewType,
    state.signatureOpen ? '1' : '0',
    state.details.compare ? activeCompareView(state.details) : '',
  ].join('|');
}

export function renderDetails(): void {
  const dock = $('dock');
  const inline = $('inline-details');
  document.documentElement.classList.remove('details-open');
  if (!state.snap) return;
  const key = detailsContentKey();
  const rebuild = key !== state.detailsKey;
  if (state.snap.config.detailsLocation === 'bottom') {
    inline.hidden = true;
    if (rebuild) inline.innerHTML = '';
    dock.hidden = !state.details;
    if (!state.details) {
      if (rebuild) dock.innerHTML = '';
      state.detailsKey = key;
      return;
    }
    dock.style.height = `${currentDetailsHeight()}px`;
    if (rebuild) dock.innerHTML = `<div class="sash-y" id="sash-y" data-dir="up"></div><div class="details-body">${detailsHtml(state.details)}</div>`;
    document.documentElement.classList.add('details-open');
    state.detailsKey = key;
    return;
  }
  dock.hidden = true;
  if (rebuild) dock.innerHTML = '';
  const anchor = detailsAnchor();
  if (!state.details || !anchor) {
    inline.hidden = true;
    if (rebuild) inline.innerHTML = '';
    state.detailsKey = key;
    return;
  }
  const idx = displayIndexForHash(anchor);
  if (idx < 0) {
    inline.hidden = true;
    if (rebuild) inline.innerHTML = '';
    state.detailsKey = key;
    return;
  }
  document.documentElement.classList.add('details-open');
  inline.hidden = false;
  inline.style.top = `${(idx + 1) * ROW}px`;
  inline.style.height = `${currentDetailsHeight()}px`;
  if (rebuild) inline.innerHTML = `<div class="details-body">${detailsHtml(state.details)}</div><div class="sash-y" id="sash-y"></div>`;
  state.detailsKey = key;
}

export function detailsHtml(d: CommitDetails): string {
  if (!state.snap) return '';
  const issue = state.snap.repoSettings.issueLinking;
  const body = formatCommitMessageHtml(applyEmoji(commitMessageText(d), emojiMaps()), state.snap.config.markdown, issue);
  const tree = state.snap.config.fileViewType !== 'list';
  const rows = detailsMetaRows(d, {
    author: formatDate(d.authorDate, state.snap.config.dateFormat),
    committer: formatDate(d.committerDate, state.snap.config.dateFormat),
  });
  const table = `<div class="meta-table">${rows.map(metaRowHtml).join('')}${signaturePaneHtml(d)}</div>`;
  const modes = d.compare ? compareModeButtons(d) : '';
  const gap = modes ? '<span class="files-toolbar-gap"></span>' : '';
  return `<div class="meta">${table}<div class="meta-msg">${body}</div>
  </div><div class="sash" id="sash-x"></div><div class="files-pane">
    <div class="files-toolbar">
      ${modes}${gap}
      <button type="button" class="fv-btn" data-fv="tree" aria-pressed="${tree}">${t('Tree')}</button>
      <button type="button" class="fv-btn" data-fv="list" aria-pressed="${!tree}">${t('List')}</button>
    </div>
    <div class="files">${filesPaneHtml(d)}</div>
  </div>`;
}

export function activeCompareView(d: CommitDetails): CompareView {
  if (!d.compare || !d.compareSplit) return 'snapshot';
  return state.compareView;
}

export function shownCompareFileCount(d: CommitDetails): number {
  const split = d.compare && activeCompareView(d) === 'diverge' ? d.compareSplit : undefined;
  if (!split) return d.files.length;
  return split.leftOnly.length + split.rightOnly.length + split.both.length * 2;
}

export function compareModeButtons(d: CommitDetails): string {
  const diverge = activeCompareView(d) === 'diverge';
  const disabled = d.compareSplit ? '' : ' disabled';
  const divergeTitle = d.compareSplit
    ? t('Changes on each side since the common parent')
    : (d.compareNote ?? t('No common parent'));
  return `<button type="button" class="fv-btn" data-cv="diverge" aria-pressed="${diverge}"${disabled} title="${esc(divergeTitle)}">${t('Since diverge')}</button><button type="button" class="fv-btn" data-cv="snapshot" aria-pressed="${!diverge}" title="${esc(t('Direct diff between the two revisions'))}">${t('Snapshot')}</button>`;
}

export function filesPaneHtml(d: CommitDetails): string {
  if (!state.snap) return '';
  const tree = state.snap.config.fileViewType !== 'list';
  if (d.compare && activeCompareView(d) === 'diverge' && d.compareSplit) return divergeFilesHtml(d, tree);
  const body = tree ? treeHtml(buildFileTree(d.files, state.snap.config.compactFolders)) : fileListHtml(d.files);
  if (d.compare && !d.compareSplit && d.compareNote) return `<p class="cmp-note">${esc(d.compareNote)}</p>${body}`;
  return body;
}

export function divergeFilesHtml(d: CommitDetails, tree: boolean): string {
  const split = d.compareSplit;
  if (!split) return '';
  const leftLabel = sideHeading(d.hash, state.compareLeftName);
  const rightLabel = sideHeading(d.compare ?? '', state.compareRightName);
  const notes = compareBanners({
    relation: split.relation,
    leftLabel,
    rightLabel,
    severalParents: (split.bases?.length ?? 0) > 1,
    baseLabel: shortRevLabel(split.base),
    leftEmpty: split.leftOnly.length === 0 && split.both.length === 0,
    rightEmpty: split.rightOnly.length === 0 && split.both.length === 0,
  })
    .map((line) => `<p class="cmp-note">${esc(line)}</p>`)
    .join('');
  return (
    notes +
    sideSection(t('Only on {0}', leftLabel), 'base', split.leftOnly, d.hash, tree) +
    sideSection(t('Only on {0}', rightLabel), 'other', split.rightOnly, d.compare ?? '', tree) +
    bothSection(split.both, leftLabel, d.hash, rightLabel, d.compare ?? '', tree)
  );
}

export function sideHeading(rev: string, chosen?: string): string {
  if (chosen) return chosen;
  return branchNameAt(rev, state.snap?.filterRefs ?? []) ?? shortRevLabel(rev);
}

export function foldSection(title: string, tone: '' | 'base' | 'other', body: string): string {
  const toneClass = tone ? ` cmp-sec-${tone}` : '';
  const group = tone ? `cmp-group cmp-group-${tone}` : 'cmp-group cmp-group-both';
  return `<section class="${group}"><details class="cmp-fold" open><summary class="cmp-sec${toneClass}" title="${esc(t('Show or hide these files'))}">${FOLDER_CHEVRON}${esc(title)}</summary>${body}</details></section>`;
}

export function sideSection(
  title: string,
  tone: 'base' | 'other',
  files: CommitDetails['files'],
  rev: string,
  tree: boolean,
): string {
  if (!files.length || !state.snap) return '';
  const body = tree
    ? treeHtml(buildFileTree(files.map((file) => ({ ...file, rev })), state.snap.config.compactFolders))
    : fileListHtml(files, rev);
  return foldSection(title, tone, body);
}

export function bothSection(
  pairs: NonNullable<CommitDetails['compareSplit']>['both'],
  leftLabel: string,
  leftRev: string,
  rightLabel: string,
  rightRev: string,
  tree: boolean,
): string {
  if (!pairs.length || !state.snap) return '';
  const files = pairs.flatMap((pair) => [
    { ...pair.left, rev: leftRev, tone: 'base' as const, sideLabel: leftLabel },
    { ...pair.right, rev: rightRev, tone: 'other' as const, sideLabel: rightLabel },
  ]);
  const body = tree
    ? treeHtml(buildFileTree(files, state.snap.config.compactFolders))
    : files
        .map((file) => sideFileRow(file, file.rev, file.tone, file.sideLabel))
        .join('');
  return foldSection(t('Changed on both'), '', body);
}

export function sideFileRow(
  file: CommitDetails['files'][number],
  rev: string,
  tone: 'base' | 'other',
  label: string,
): string {
  const i = file.path.lastIndexOf('/');
  const name = i >= 0 ? file.path.slice(i + 1) : file.path;
  const dir = i >= 0 ? file.path.slice(0, i) : '';
  return fileRow(file.path, name, file.status, file.oldPath ?? '', dir, file.additions, file.deletions, rev, tone, label);
}

export const COPY_SVG =
  '<svg class="copy-ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2h7a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm3 11h6V5H7v8zM4 12h1V4h6V3H4v9z"/></svg>';

export const ICON_MAIL =
  '<svg class="copy-ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.75 3.25h12.5a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75H1.75a.75.75 0 0 1-.75-.75v-8.5a.75.75 0 0 1 .75-.75zM2.5 4.6v.65l5.5 3.25 5.5-3.25V4.6h-11zm11 1.95L8.15 9.7a.75.75 0 0 1-.8 0L2.5 6.55V11.5h11V6.55z"/></svg>';

export const ICON_PERSON =
  '<svg class="copy-ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM3.15 13.7c.3-2.5 2.15-3.9 4.85-3.9s4.55 1.4 4.85 3.9z"/></svg>';

export const ICON_CONTACT =
  '<svg class="copy-ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M1.6 3.1h12.8v9.8H1.6zm1.15 1.15v7.5h10.5v-7.5z"/><circle cx="5.55" cy="6.85" r="1.05" fill="currentColor"/><path fill="currentColor" d="M4.15 10.15c.25-.8.85-1.2 1.4-1.2s1.15.4 1.4 1.2zM8.55 6.15h3.7v.8h-3.7zm0 1.75h3.7v.8h-3.7z"/></svg>';

export const COPY_ICONS: Record<MetaCopyIcon, string> = {
  copy: COPY_SVG,
  mail: ICON_MAIL,
  person: ICON_PERSON,
  contact: ICON_CONTACT,
};

export function copyBtns(copies: DetailsMetaRow['copies']): string {
  return copies
    .map((c) => {
      const icon = COPY_ICONS[c.icon ?? 'copy'];
      const label = c.label ? `<span>${esc(c.label)}</span>` : '';
      return `<button type="button" class="copy-btn" data-copy="${esc(c.text)}" title="${esc(c.title)}" aria-label="${esc(c.title)}">${icon}${label}</button>`;
    })
    .join('');
}

export function signatureCellHtml(c: GraphCommit): string {
  const col = signatureColumn(c.signatureKind);
  const cls = col.signed ? 'signed' : 'unsigned';
  return `<div class="cell signature ${cls}" title="${esc(col.title)}" aria-label="${esc(col.title)}">${esc(col.text)}</div>`;
}

export function signatureRows(sig: CommitDetails['signature']): SignatureInfoRow[] {
  const format = state.snap?.config.dateFormat ?? 'iso';
  return signatureInfoRows(sig, (unix) => formatDate(unix, format));
}

export function signaturePaneHtml(d: CommitDetails): string {
  const rows = signatureRows(d.signature);
  const summary = signatureSummary(d.signature);
  const tone = summary.tone ? ` sig-${summary.tone}` : '';
  const body = state.signatureOpen ? `<div class="sig-body">${rows.map(signatureRowHtml).join('')}</div>` : '';
  return `<div class="sig-block${state.signatureOpen ? ' open' : ''}">
    <div class="meta-row">
      <div class="meta-label"><button type="button" class="sig-toggle" aria-expanded="${state.signatureOpen}" title="${state.signatureOpen ? t('Hide signature') : t('Show signature')}"><span class="sig-chevron" aria-hidden="true"></span>${t('Signature')}</button></div>
      <div class="meta-main"><div class="sig-summary${summary.signed ? ' signed' : ''}${tone}">${esc(summary.text)}</div></div>
    </div>${body}</div>`;
}

export function signatureRowHtml(row: SignatureInfoRow): string {
  const tone = row.tone ? ` sig-${row.tone}` : '';
  const mono = row.mono ? ' mono' : '';
  const copy = row.copy ? `<div class="copy-btns">${copyBtns([{ label: '', text: row.copy, title: t('Copy') }])}</div>` : '';
  return `<div class="meta-row"><div class="meta-label">${esc(row.label)}</div><div class="meta-main"><div class="meta-value${mono}${tone}">${esc(row.value)}</div>${copy}</div></div>`;
}

export function metaRowHtml(row: DetailsMetaRow): string {
  const hash = Boolean(row.hashLink) || row.label === t('Commit');
  const value = row.hashLink
    ? `<a href="#" data-parent="${esc(row.hashLink)}">${esc(row.value)}</a>`
    : esc(row.value);
  return `<div class="meta-row"><div class="meta-label">${esc(row.label)}</div><div class="meta-main"><div class="meta-value${hash ? ' mono' : ''}">${value}</div><div class="copy-btns">${copyBtns(row.copies)}</div></div></div>`;
}

export const ICON_DIFF =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 1.5h5A1.5 1.5 0 0 1 8.5 3v10A1.5 1.5 0 0 1 7 14.5H2A1.5 1.5 0 0 1 .5 13V3A1.5 1.5 0 0 1 2 1.5zm0 1A.5.5 0 0 0 1.5 3v10a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5zm7 0h5A1.5 1.5 0 0 1 15.5 3v10a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 13V3A1.5 1.5 0 0 1 9 1.5zm0 1A.5.5 0 0 0 8.5 3v10a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5z"/></svg>';

export const ICON_OPEN =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.5 2.5H14v8h-1.5V4H6.5zm-4 3H10v8H2.5zM4 7v5h4.5V7z"/></svg>';

export const ICON_BLOB =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2.5h7l3 3V13.5H3zm1 1v9h8V6H9V3.5zm2 3h5v1H6zm0 2.5h5v1H6z"/></svg>';

export const ICON_HISTORY =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M8 3.2a4.8 4.8 0 1 1-3.4 1.4"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M4.2 2.4v2.4h2.4M8 5.6V8.4L9.8 9.4"/></svg>';

export const ICON_BLAME =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M3 3.5h10M3 8h10M3 12.5h6"/></svg>';

export const ICON_COPY_REL =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2h7a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm3 11h6V5H7v8zM4 12h1V4h6V3H4v9z"/></svg>';

export const ICON_COPY_FULL =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2h7a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm3 11h6V5H7v8zM4 12h1V4h6V3H4v9z"/><path fill="currentColor" d="M2 7h3v1H3v3H2z"/></svg>';

export function fileActionsHtml(): string {
  return `<span class="file-actions">
    <button type="button" class="file-act" data-fa="diff" title="${t('Diff')}">${ICON_DIFF}</button>
    <button type="button" class="file-act" data-fa="open" title="${t('Open File')}">${ICON_OPEN}</button>
    <button type="button" class="file-act" data-fa="blob" title="${t('View at revision')}">${ICON_BLOB}</button>
    <button type="button" class="file-act" data-fa="history" title="${t('File history')}">${ICON_HISTORY}</button>
    <button type="button" class="file-act" data-fa="blame" title="${t('Blame')}">${ICON_BLAME}</button>
    <button type="button" class="file-act" data-fa="copy-full" title="${t('Copy Full Path')}" aria-label="${t('Copy Full Path')}">${ICON_COPY_FULL}<span class="file-act-mark" aria-hidden="true">F</span></button>
    <button type="button" class="file-act" data-fa="copy-rel" title="${t('Copy Relative Path')}" aria-label="${t('Copy Relative Path')}">${ICON_COPY_REL}<span class="file-act-mark" aria-hidden="true">R</span></button>
  </span>`;
}

export function fileStatHtml(additions?: number, deletions?: number): string {
  const parts: string[] = [];
  if (additions != null && additions > 0) parts.push(`<span class="file-add" title="${t('{0} added', additions)}">+${additions}</span>`);
  if (deletions != null && deletions > 0) parts.push(`<span class="file-del" title="${t('{0} deleted', deletions)}">-${deletions}</span>`);
  if (!parts.length) return '';
  return `<span class="file-stats">${parts.join('')}</span>`;
}

export function fileEnd(dir: string, additions?: number, deletions?: number): string {
  const stats = fileStatHtml(additions, deletions);
  const directory = dir ? `<span class="file-dir">${esc(dir)}</span>` : '';
  if (!stats && !directory) return '';
  return `<span class="file-end">${stats}${directory}</span>`;
}

export function fileRow(
  path: string,
  name: string,
  status: string,
  oldPath = '',
  dir = '',
  additions?: number,
  deletions?: number,
  rev = '',
  tone: '' | 'base' | 'other' = '',
  sideLabel = '',
): string {
  const added = status === 'A' || status === 'U';
  const picked = state.pickedFiles.includes(path) ? ' picked' : '';
  const revAttr = rev ? ` data-rev="${esc(rev)}"` : '';
  const mark = tone && sideLabel ? `<span class="file-rev file-rev-${tone}">${esc(sideLabel)}</span>` : '';
  return `<div class="file scm-file${picked}" data-path="${esc(path)}" data-old="${esc(oldPath)}" data-st="${status}"${revAttr}>
    <span class="badge st-${status}" title="${statusTitle(status)}">${status}</span>
    ${mark}<span class="file-name" data-open="${added ? 'blob' : 'diff'}">${esc(name)}</span>
    ${fileActionsHtml()}
    ${fileEnd(dir, additions, deletions)}
  </div>`;
}

export function fileListHtml(files: CommitDetails['files'], rev = ''): string {
  return files
    .map((f) => {
      const i = f.path.lastIndexOf('/');
      const name = i >= 0 ? f.path.slice(i + 1) : f.path;
      const dir = i >= 0 ? f.path.slice(0, i) : '';
      return fileRow(f.path, name, f.status, f.oldPath ?? '', dir, f.additions, f.deletions, rev);
    })
    .join('');
}

export function treeHtml(nodes: ReturnType<typeof buildFileTree>): string {
  return `<ul class="scm-tree">${nodes.map((n) => treeNode(n)).join('')}</ul>`;
}

export const FOLDER_CHEVRON =
  '<svg class="scm-twist" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.146 5.854 7.646 10.354c.195.195.512.195.707 0l4.5-4.5c.195-.195.195-.512 0-.707s-.512-.195-.707 0L8 9.293 3.854 5.147c-.195-.195-.512-.195-.707 0s-.195.512 0 .707z"/></svg>';

export function treeNode(n: ReturnType<typeof buildFileTree>[number]): string {
  if (n.children) {
    const key = macPlatform() ? 'Cmd+click' : 'Ctrl+click';
    const hint = t('{0} — {1} expands or collapses nested folders', n.name, key);
    const folderPath = n.path ?? n.name;
    return `<li><details open class="scm-folder" data-path="${esc(folderPath)}"><summary title="${esc(hint)}">${FOLDER_CHEVRON}${esc(n.name)}</summary>${treeHtml(n.children)}</details></li>`;
  }
  return `<li>${fileRow(n.path ?? '', n.name, n.status ?? '', n.oldPath ?? '', '', n.additions, n.deletions, n.rev ?? '', n.tone ?? '', n.sideLabel ?? '')}</li>`;
}

export function applyFolderFold(folder: HTMLDetailsElement, plan: FolderFoldPlan): void {
  folder.open = plan.self;
  for (const node of folder.querySelectorAll('details.scm-folder')) {
    if (node instanceof HTMLDetailsElement) node.open = plan.descendants;
  }
}

export function toggleNestedFolders(folder: HTMLDetailsElement, openBefore: boolean): void {
  const plan = folderFoldPlan(openBefore, 'toggle-nested');
  applyFolderFold(folder, plan);
  queueMicrotask(() => {
    if (folder.isConnected) applyFolderFold(folder, plan);
  });
}

export function paintDetails(): void {
  paint();
}

export function findFlags() {
  return { regex: findPressed('find-regex'), ignoreCase: !findPressed('find-case') };
}

export function findMark(text: string): string {
  return highlightFind(text, $('find-q').value, findFlags());
}

export function subjectHtml(subject: string): string {
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

export const REMOTE_CHIP_ICON = '<span class="chip-ico" aria-hidden="true"></span>';

export function labelColour(ref: { kind: string; name: string; remote?: string }): string | undefined {
  if (!state.snap?.config.referenceLabelColours.length) return undefined;
  return refLabelColour(ref, state.snap.config.referenceLabelColours);
}

export function chipColourAttrs(ref: GraphRef): { cls: string; style: string } {
  const colour = labelColour(ref);
  if (!colour) return { cls: '', style: '' };
  return { cls: ' coloured', style: ` style="color:${colour};--ref-colour:${colour}"` };
}

export function refRowColourAttrs(ref: { kind: string; name: string; remote?: string }): { mark: string; name: string } {
  const colour = labelColour(ref);
  if (!colour) return { mark: '', name: '' };
  return {
    mark: ` style="background:${colour};box-shadow:none"`,
    name: ` style="color:${colour}"`,
  };
}

export function chipFace(r: GraphRef, short: boolean, iconOnly: boolean): { extra: string; icon: string; label: string; title: string } {
  const remoteShort = short && r.kind === 'remote';
  const remoteIcon = !remoteShort && r.kind === 'remote' && state.snap!.config.remoteBranchPrefix !== 'text';
  const icon = remoteShort || remoteIcon ? REMOTE_CHIP_ICON : chipIcon(r.kind);
  const label = remoteShort ? remoteShortName(r) : remoteIcon ? remoteChipText(r.name, 'icon') : refDisplayName(r);
  const extra = `${remoteShort ? ' short' : ''}${iconOnly ? ' icon-only' : ''}`;
  const title = iconOnly
    ? ` title="${esc(label)}" aria-label="${esc(t('{0}, show remotes', label))}"`
    : remoteIcon
      ? ` title="${esc(refDisplayName(r))}"`
      : '';
  return { extra, icon, label, title };
}

export function remoteFoldButton(): string {
  const label = t('Collapse remotes');
  return `<button type="button" class="chip-fold" aria-expanded="true" title="${label}" aria-label="${label}"><svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M10 4 6 8l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
}

export function chipIcon(kind: string): string {
  return kind === 'head' || kind === 'tag' || kind === 'worktree' ? '<span class="chip-ico" aria-hidden="true"></span>' : '';
}
