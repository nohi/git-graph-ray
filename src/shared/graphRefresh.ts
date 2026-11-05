/** Changes that alter which commits or repositories are loaded. */
export const GRAPH_RELOAD_KEYS = [
  'history.pageSize',
  'history.pageMore',
  'history.order',
  'history.mailmap',
  'history.remotes',
  'history.stashes',
  'history.tags',
  'history.worktrees',
  'history.reflog',
  'history.firstParent',
  'history.remoteHeads',
  'history.uncommitted',
  'history.untracked',
  'history.tagOnlyCommits',
  'startup.searchDepth',
  'startup.repoOrder',
] as const;

/** Changes the open graph can draw without reading Git again. */
export const GRAPH_REPAINT_KEYS = [
  'graph.palette',
  'graph.bend',
  'graph.theme',
  'graph.lanePriority',
  'when.format',
  'columns',
  'labels.layout',
  'labels.combine',
  'labels.remote',
  'labels.colors',
  'details.markdown',
  'details.maxHeight',
  'details.place',
  'details.files',
  'details.foldSingleFolders',
  'keys.find',
  'keys.refresh',
  'keys.head',
  'keys.stash',
  'actions',
  'rayCat.enabled',
  'rayCat.count',
  'fetch.prune',
  'fetch.pruneTags',
  'fetch.auto',
  'fetch.everySeconds',
  'undo.preview',
  'history.muteMerges',
  'history.dimNotOnHead',
  'history.avatars',
  'history.openCircle',
  'history.autoPage',
  'refs.branchSort',
  'refs.tagSort',
  'refs.listLimit',
  'menus',
  'pullRequests',
  'branches.globs',
  'emoji',
] as const;

export function graphSettingReloads(affects: (key: string) => boolean): boolean {
  return GRAPH_RELOAD_KEYS.some((key) => affects(`git-graph-ray.${key}`));
}

export function graphSettingRepaints(affects: (key: string) => boolean): boolean {
  return GRAPH_REPAINT_KEYS.some((key) => affects(`git-graph-ray.${key}`));
}

/** Whole counts used as Git limits. Zero and negatives become 1. */
export function atLeastOne(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}
