import { defaultDialogs } from './dialogs';
import { RAY_COLOURS, type ViewConfig } from './types';

export const ROW = 28;
export const LANE = 16;
export const PAD = 10;
export const RADIUS = 4;
export const DETAILS_MIN = 88;
export const DETAILS_MAX = 300;

export function defaultViewConfig(): ViewConfig {
  return {
    graphColours: [
      '#0085d9',
      '#d9008f',
      '#00d90a',
      '#d98500',
      '#a300d9',
      '#ff0000',
      '#00d9cc',
      '#e138e8',
      '#85d900',
      '#dc5b23',
      '#6f24d6',
      '#ffcc00',
    ],
    graphStyle: 'rounded',
    uncommittedChanges: 'Open Circle at the Uncommitted Changes',
    theme: 'classic',
    dateFormat: 'Date & Time',
    columnVisibility: {
      Author: true,
      AuthorDate: true,
      Commit: true,
      Committer: false,
      CommitterDate: false,
    },
    muteMergeCommits: true,
    muteNonAncestorsOfHead: false,
    showRemoteBranches: true,
    showStashes: true,
    showTags: true,
    showWorktrees: true,
    includeCommitsMentionedByReflogs: false,
    onlyFollowFirstParent: false,
    showRemoteHeads: true,
    showUncommittedChanges: true,
    showUntrackedFiles: true,
    showCommitsOnlyReferencedByTags: true,
    combineLocalAndRemote: true,
    referenceLabelAlignment: 'Normal',
    markdown: true,
    enhancedAccessibility: false,
    autoCenter: false,
    detailsMaxHeight: 300,
    detailsLocation: 'Inline',
    fileViewType: 'File Tree',
    compactFolders: true,
    fetchAvatars: false,
    loadMoreAutomatically: true,
    branchSort: 'version:refname',
    tagSort: '-version:refname',
    refsListLimit: 200,
    dialogs: defaultDialogs(),
    keyboard: {
      find: 'CTRL/CMD + F',
      refresh: 'CTRL/CMD + R',
      scrollToHead: 'CTRL/CMD + H',
      scrollToStash: 'CTRL/CMD + S',
    },
    gitVersion: '',
    gitMajorMinor: [0, 0],
    rayCatEnabled: false,
    rayCatCount: 1,
    fetchAndPrune: false,
    fetchAndPruneTags: false,
  };
}

export function colourForLane(lane: number, colours: string[], theme: ViewConfig['theme']): string {
  if (theme === 'Ray Stream') return 'url(#ray-stream)';
  const palette = theme === 'classic' ? colours : RAY_COLOURS;
  if (palette.length === 0) return '#0085d9';
  return palette[((lane % palette.length) + palette.length) % palette.length] ?? palette[0]!;
}

export const RAY_STREAM_PERIOD = 336;

export function rayStreamGradient(height: number, animate: boolean): string {
  const p = RAY_STREAM_PERIOD;
  const h = Math.max(Math.round(height), 1);
  const stops = [
    ['0%', '#ff0044'],
    ['16%', '#ff8c00'],
    ['33%', '#ffe600'],
    ['50%', '#5cff47'],
    ['66%', '#00e5ff'],
    ['83%', '#6b5cff'],
    ['100%', '#ff0044'],
  ];
  const stopXml = stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  const anim = animate
    ? `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="0 ${-p}" dur="6s" repeatCount="indefinite"/>`
    : '';
  return `<defs><linearGradient id="ray-stream" gradientUnits="userSpaceOnUse" x1="0" y1="${h}" x2="0" y2="${h - p}" spreadMethod="repeat">${stopXml}${anim}</linearGradient></defs>`;
}

export function graphWidth(maxLanes: number): number {
  return PAD * 2 + Math.max(1, maxLanes) * LANE;
}

export function laneX(lane: number): number {
  return PAD + lane * LANE + LANE / 2;
}

export type EdgeCurveAt = 'start' | 'end';

/** Peel off from a merge commit; otherwise join a destination node, or open a lane. */
export function edgeCurveAt(toHasNode: boolean, fromIsMerge = false): EdgeCurveAt {
  if (fromIsMerge) return 'start';
  return toHasNode ? 'end' : 'start';
}

export function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: 'rounded' | 'angular',
  curveAt: EdgeCurveAt = 'end',
): string {
  const n = (v: number) => Math.round(v * 100) / 100;
  if (x1 === x2) return `M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`;
  const dy = y2 - y1;
  const dx = x2 - x1;
  if (dy === 0) return `M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`;
  const sign = dx > 0 ? 1 : -1;
  if (style === 'angular') {
    const span = Math.min(ROW / 2, Math.abs(dy) / 2);
    const joinY = curveAt === 'start' ? y1 + span : y2 - span;
    return `M ${n(x1)} ${n(y1)} L ${n(x1)} ${n(joinY)} L ${n(x2)} ${n(joinY)} L ${n(x2)} ${n(y2)}`;
  }
  const r = Math.min(LANE, Math.abs(dx), Math.abs(dy));
  // Forks (start) and merges (end) use opposite sweep so both round the inner corner.
  const sweep = (sign > 0) === (curveAt === 'start') ? 1 : 0;
  if (curveAt === 'start') {
    const hx = x2 - sign * r;
    const vy = y1 + r;
    const parts = [`M ${n(x1)} ${n(y1)}`];
    if (Math.abs(dx) > r) parts.push(`L ${n(hx)} ${n(y1)}`);
    parts.push(`A ${n(r)} ${n(r)} 0 0 ${sweep} ${n(x2)} ${n(vy)}`);
    if (vy !== y2) parts.push(`L ${n(x2)} ${n(y2)}`);
    return parts.join(' ');
  }
  const vy = y2 - r;
  const hx = x1 + sign * r;
  const parts = [`M ${n(x1)} ${n(y1)}`];
  if (vy !== y1) parts.push(`L ${n(x1)} ${n(vy)}`);
  parts.push(`A ${n(r)} ${n(r)} 0 0 ${sweep} ${n(hx)} ${n(y2)}`);
  if (Math.abs(dx) > r) parts.push(`L ${n(x2)} ${n(y2)}`);
  return parts.join(' ');
}

export function rowTop(index: number, gap?: { after: number; height: number } | null): number {
  const extra = gap && index > gap.after ? gap.height : 0;
  return index * ROW + extra;
}

export function rowY(row: number, gap?: { after: number; height: number } | null): number {
  return rowTop(row, gap) + ROW / 2;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function autoDetailsHeight(contentHeight: number, userHeight: number | null, maxHeight = DETAILS_MAX): number {
  if (userHeight != null) return Math.max(DETAILS_MIN, userHeight);
  return Math.min(maxHeight, Math.max(DETAILS_MIN, Math.round(contentHeight)));
}

export function estimateDetailsHeight(opts: {
  message: string;
  fileCount: number;
  metaRowCount: number;
  maxHeight: number;
}): number {
  const msgLines = Math.max(1, opts.message.split(/\r?\n/).length);
  const meta = 16 + opts.metaRowCount * 22 + 12 + msgLines * 17 + 12;
  const files = 36 + Math.max(opts.fileCount, 1) * 22;
  return autoDetailsHeight(Math.max(meta, files) + 6, null, opts.maxHeight);
}

export function scrollNeededToRevealDetails(opts: {
  rowIndex: number;
  rowHeight: number;
  detailsHeight: number;
  scrollTop: number;
  viewHeight: number;
  pad?: number;
}): number | null {
  const pad = opts.pad ?? 4;
  const panelBottom = (opts.rowIndex + 1) * opts.rowHeight + opts.detailsHeight;
  const viewBottom = opts.scrollTop + opts.viewHeight;
  if (panelBottom <= viewBottom - pad) return null;
  const rowTop = opts.rowIndex * opts.rowHeight;
  if (opts.detailsHeight + opts.rowHeight > opts.viewHeight) return rowTop;
  return Math.max(0, panelBottom - opts.viewHeight + pad);
}

export function ancestorHashes(commits: Array<{ hash: string; parents: string[] }>, head: string | null): Set<string> {
  const seen = new Set<string>();
  if (!head) return seen;
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const stack = [head];
  while (stack.length) {
    const h = stack.pop()!;
    if (seen.has(h)) continue;
    seen.add(h);
    const node = byHash.get(h);
    if (node) stack.push(...node.parents);
  }
  return seen;
}

export function shortcutMatches(setting: string, event: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  if (setting === 'UNASSIGNED') return false;
  const m = setting.match(/^CTRL\/CMD \+ ([A-Z])$/);
  if (!m) return false;
  const want = m[1]!.toLowerCase();
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === want;
}

export function gitAtLeast(version: [number, number], major: number, minor: number): boolean {
  if (version[0] > major) return true;
  if (version[0] < major) return false;
  return version[1] >= minor;
}

export function parseGitVersion(raw: string): [number, number] {
  const m = raw.match(/(\d+)\.(\d+)/);
  if (!m) return [0, 0];
  return [Number(m[1]), Number(m[2])];
}
