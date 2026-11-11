import { emptyDateFilter } from '../shared/dateFilter';
import { emptyPersonFilter } from '../shared/personFilter';
import { REFS_POPOVER_DEFAULT_WIDTH, REFS_POPOVER_MIN_HEIGHT, REFS_POPOVER_MIN_WIDTH } from '../shared/popover';
import type { CompareCandidate } from '../shared/comparePick';
import type { CompareView } from '../shared/compareSplit';
import type { DateField, DateFilter } from '../shared/dateFilter';
import type { BranchMergeState } from '../shared/deleteBranch';
import type { Edge, Layout } from '../shared/layout';
import type { PersonField, PersonFilter } from '../shared/personFilter';
import type { GraphSnapshot, HostToView } from '../shared/protocol';
import type { FilterTab } from '../shared/refsList';
import type { CommitDetails, GraphCommit, GraphRef } from '../shared/types';
import { vscode, webviewState } from './host';

export const REFS_POPOVER_MAX_SPAN = 4000;

export const state = {
  signatureOpen: webviewState().signatureOpen === true,
  columnWidths: ({ ...(webviewState().columns ?? {}) }) as Record<string, number>,
  refsPopoverWidth: storedRefsPopoverWidth(),
  refsPopoverHeight: (storedRefsPopoverHeight()) as number | null,
  refsPopoverCustomPlace: false,
  refsPopoverDragging: false,
  viewRestored: false,
  restoring: false,
  restoredScroll: (null) as string | null,
  snap: (null) as GraphSnapshot | null,
  selected: (null) as string | null,
  compare: undefined as string | undefined,
  compareAnchor: undefined as string | undefined,
  details: (null) as CommitDetails | null,
  detailsH: (null) as number | null,
  autoDetailsH: 180,
  fitGen: 0,
  userG: (null) as number | null,
  dialogOk: (null) as (() => void) | null,
  deleteBranchReq: '',
  deleteBranchSeq: 0,
  deleteBranchMerge: ('unknown') as BranchMergeState,
  remoteTagReq: '',
  remoteTagSeq: 0,
  remoteTagLoading: false,
  remoteTagCommits: new Map<string, string>(),
  tagMark: (null) as { commit: string; name: string | null } | null,
  confirmOk: (null) as (() => void) | null,
  compareBase: (null) as string | null,
  compareBaseName: undefined as string | undefined,
  compareLeftName: undefined as string | undefined,
  compareRightName: undefined as string | undefined,
  compareActive: 0,
  compareRows: ([]) as CompareCandidate[],
  compareView: ('diverge') as CompareView,
  faces: new Map<string, string>(),
  findHits: ([]) as string[],
  findIndexes: ([]) as number[],
  findI: 0,
  findTruncated: false,
  findSeq: 0,
  findRequest: '',
  findDiffTimer: (null) as ReturnType<typeof setTimeout> | null,
  findPendingDir: 0,
  findPendingHash: (null) as string | null,
  detailsStamp: 0,
  graphCommits: (null) as GraphCommit[] | null,
  graphKey: '',
  graphStart: -1,
  graphEnd: -1,
  rowsDirty: true,
  viewportRows: (null) as number[] | null,
  viewportStart: -1,
  viewportEnd: -1,
  viewportGapAfter: -2,
  viewportGapH: -1,
  viewportChrome: '',
  viewportFrame: 0,
  shownCache: (null) as { commits: GraphCommit[]; key: string; rows: number[] } | null,
  displayCache: (null) as { rows: readonly number[]; map: Map<number, number> } | null,
  ancestorCache: (null) as { commits: readonly GraphCommit[]; head: string | null; set: Set<string> } | null,
  historyCache: (null) as { commits: readonly GraphCommit[]; key: string; set: Set<string> | null; lanes: boolean[][] | null } | null,
  detailsKey: '',
  filterDraft: (null) as {
  showAll: boolean;
  showRemotes: boolean;
  showSameCommitBranches: boolean;
  tab: FilterTab;
  picked: Set<string>;
  shown: number;
} | null,
  stashI: 0,
  ctxRef: (null) as GraphRef | null,
  pickedBranches: ([]) as string[],
  remoteLabelsExpandedAt: 0,
  commitRange: ([]) as string[],
  rangeAnchor: (null) as string | null,
  pickedFiles: ([]) as string[],
  ctxFiles: ([]) as { path: string; untracked: boolean }[],
  pickSeq: 0,
  ctxCommit: (null) as GraphCommit | null,
  ctxFile: (null) as { path: string; oldPath?: string; rev?: string } | null,
  ctxFolder: (null) as HTMLDetailsElement | null,
  ctxCopyText: '',
  summaryPointer: (null) as { folder: HTMLDetailsElement; open: boolean } | null,
  pendingDateJump: (null) as { day: string; field: 'author' | 'committer' } | null,
  pendingRefJump: (null) as string | null,
  pendingAmend: (null) as string | null,
  dateFilter: (emptyDateFilter()) as DateFilter,
  personFilter: (emptyPersonFilter()) as PersonFilter,
  undoPending: (null) as 'undo' | 'redo' | null,
  undoPreviewMsg: (null) as Extract<HostToView, { type: 'undoPreview' }> | null,
  undoSideBySide: false,
  undoShowUnrelated: false,
  undoShowHead: false,
  undoSteps: 1,
  undoButtons: {
  canUndo: false,
  canRedo: false,
  undoLabel: null as string | null,
  redoLabel: null as string | null,
  undoLabels: [] as string[],
  redoLabels: [] as string[],
},
  dateDraft: (null) as DateFilter | null,
  dateTab: ('author') as DateField,
  personDraft: (null) as PersonFilter | null,
  personTab: ('author') as PersonField,
  lastPointer: { x: 24, y: 24 },
  pendingPatch: (null) as Partial<GraphSnapshot> | null,
  repoSync: 0,
  layoutCache: (null) as { commits: GraphCommit[]; priority: string; layout: Layout; byFrom: Edge[][] } | null,
  gitDialogAt: (null) as { x: number; y: number } | null,
};

export function storedRefsPopoverWidth(): number {
  const width = webviewState().refsPopoverWidth;
  if (typeof width !== 'number' || !Number.isFinite(width)) return REFS_POPOVER_DEFAULT_WIDTH;
  return Math.min(REFS_POPOVER_MAX_SPAN, Math.max(REFS_POPOVER_MIN_WIDTH, width));
}

export function storedRefsPopoverHeight(): number | null {
  const height = webviewState().refsPopoverHeight;
  if (typeof height !== 'number' || !Number.isFinite(height)) return null;
  return Math.min(REFS_POPOVER_MAX_SPAN, Math.max(REFS_POPOVER_MIN_HEIGHT, height));
}

export function persistView(): void {
  if (state.restoring) return;
  vscode.setState({
    repo: state.snap?.repoPath,
    signatureOpen: state.signatureOpen,
    columns: { ...state.columnWidths },
    dateAuthor: [...state.dateFilter.author],
    dateCommitter: [...state.dateFilter.committer],
    authorNames: [...state.personFilter.author],
    committerNames: [...state.personFilter.committer],
    selected: state.selected ?? undefined,
    refsPopoverWidth: state.refsPopoverWidth,
    ...(state.refsPopoverHeight != null ? { refsPopoverHeight: state.refsPopoverHeight } : {}),
  });
}
