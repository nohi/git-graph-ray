import type { RefColourRule } from './refColours';
import type { CommitSignature, SignatureKind } from './signature';

export const UNCOMMITTED = '*';

export type RefKind = 'head' | 'remote' | 'tag' | 'stash' | 'worktree';

/** One `graph.lanePriority` entry. A larger priority is placed further left. */
export type LanePriorityRule = {
  pattern: string;
  priority: number;
};

export type RefSort = 'version:refname' | '-version:refname' | 'refname' | '-refname';

export type GraphRef = {
  kind: RefKind;
  name: string;
  hash: string;
  remote?: string;
  worktreePath?: string;
  /** Drawn dashed in an undo preview when this ref is absent on that side. */
  ghost?: boolean;
};

export type GraphCommit = {
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: number;
  committerName: string;
  committerEmail: string;
  committerDate: number;
  subject: string;
  refs: GraphRef[];
  /** Null when the commit object was scanned and has no signature. */
  signatureKind?: SignatureKind | null;
  /** Drawn dashed in an undo preview when this commit is absent on that side. */
  ghost?: boolean;
};

export type GraphWorktree = {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
};

export type RepoInfo = {
  path: string;
  name: string;
  workspaceIndex: number;
};

export type RepoOperationKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'am';

export type RepoOperation = {
  kind: RepoOperationKind;
  files: string[];
};

export type UpstreamDivergence = {
  ahead: number;
  behind: number;
};

export type ColumnVisibility = {
  Author: boolean;
  AuthorDate: boolean;
  Commit: boolean;
  Committer: boolean;
  CommitterDate: boolean;
  Signature: boolean;
};

export type GraphTheme = 'classic' | 'Ray' | 'Ray Wave' | 'Ray Cycle' | 'Ray Stream';

export type DateFormat = 'datetime' | 'date' | 'iso' | 'isoDate' | 'relative';

export type CommitOrder = 'date' | 'author' | 'topo';

export type SquashMessage = 'subject' | 'file';

export type SpaceMode = 'keep' | 'hyphen' | 'underscore';

export type ResetMode = 'soft' | 'mixed' | 'hard';

export type FileChange = {
  path: string;
  oldPath?: string;
  status: 'A' | 'M' | 'D' | 'R' | 'U' | 'C' | 'T';
  additions?: number;
  deletions?: number;
};

/** How the two tips sit relative to their merge base. */
export type CompareRelation = 'diverged' | 'same' | 'left-contains-right' | 'right-contains-left';

/** One path at the common parent, changed on both tips. */
export type CompareOverlap = {
  key: string;
  left: FileChange;
  right: FileChange;
};

/** File changes from the merge base to each tip. `files` on the details stays the direct two-dot diff. */
export type CompareSplit = {
  base: string;
  /** Every merge base when there is more than one. `base` is the one Git would use for `A...B`. */
  bases?: string[];
  relation: CompareRelation;
  leftOnly: FileChange[];
  rightOnly: FileChange[];
  both: CompareOverlap[];
};

export type CommitDetails = {
  hash: string;
  compare?: string;
  /** Set when the two revisions have a common parent. */
  compareSplit?: CompareSplit;
  /** Why Since diverge is unavailable. Set when `compareSplit` is absent. */
  compareNote?: string;
  authorName: string;
  authorEmail: string;
  authorDate: number;
  committerName: string;
  committerEmail: string;
  committerDate: number;
  subject: string;
  body: string;
  parents: string[];
  files: FileChange[];
  signature?: CommitSignature;
};

export type DialogDefaults = {
  addTagPushToRemote: boolean;
  addTagType: 'Annotated' | 'Lightweight';
  applyStashReinstateIndex: boolean;
  cherryPickNoCommit: boolean;
  cherryPickRecordOrigin: boolean;
  createBranchCheckOut: boolean;
  deleteBranchForce: boolean;
  fetchIntoLocalForce: boolean;
  spaceSubstitution: SpaceMode;
  mergeNoCommit: boolean;
  mergeNoFastForward: boolean;
  mergeSquash: boolean;
  mergeSquashMessageFormat: SquashMessage;
  popStashReinstateIndex: boolean;
  pullNoFastForward: boolean;
  pullRebase: boolean;
  pullSquash: boolean;
  pullSquashMessageFormat: SquashMessage;
  rebaseIgnoreDate: boolean;
  rebaseInteractive: boolean;
  resetBranchMode: ResetMode;
  resetUncommittedMode: 'mixed' | 'hard';
  stashIncludeUntracked: boolean;
};

export type ViewConfig = {
  graphColours: string[];
  graphStyle: 'rounded' | 'angular';
  uncommittedChanges: 'changes' | 'head';
  theme: GraphTheme;
  dateFormat: DateFormat;
  columnVisibility: ColumnVisibility;
  muteMergeCommits: boolean;
  muteNonAncestorsOfHead: boolean;
  showRemoteBranches: boolean;
  showStashes: boolean;
  showTags: boolean;
  showWorktrees: boolean;
  includeCommitsMentionedByReflogs: boolean;
  onlyFollowFirstParent: boolean;
  showRemoteHeads: boolean;
  showUncommittedChanges: boolean;
  showUntrackedFiles: boolean;
  showCommitsOnlyReferencedByTags: boolean;
  combineLocalAndRemote: boolean;
  referenceLabelAlignment: 'together' | 'split';
  /** `labels.remote`. icon draws a cloud instead of the `remotes/` word. */
  remoteBranchPrefix: 'icon' | 'text';
  /** `labels.colors`. Glob to hex, first match wins. */
  referenceLabelColours: RefColourRule[];
  /** `graph.lanePriority`. Glob to priority. A larger number is further left. The highest match wins. */
  lanePriority: LanePriorityRule[];
  markdown: boolean;
  detailsMaxHeight: number;
  detailsLocation: 'inline' | 'bottom';
  fileViewType: 'tree' | 'list';
  compactFolders: boolean;
  fetchAvatars: boolean;
  loadMoreAutomatically: boolean;
  /** `history.order`. */
  commitOrder: CommitOrder;
  branchSort: RefSort;
  tagSort: RefSort;
  refsListLimit: number;
  dialogs: DialogDefaults;
  keyboard: {
    find: string;
    refresh: string;
    scrollToHead: string;
    scrollToStash: string;
  };
  gitVersion: string;
  gitMajorMinor: [number, number];
  rayCatEnabled: boolean;
  rayCatCount: number;
  fetchAndPrune: boolean;
  fetchAndPruneTags: boolean;
  /** Fetch remotes on a timer while the graph is open. Off unless the user enables it. */
  autoFetch: boolean;
  /** Seconds between automatic fetches. Ignored while auto fetch is off. */
  autoFetchInterval: number;
  /** Show the before/after graph before Undo or Redo. */
  undoPreview: boolean;
};

export const RAY_COLOURS = ['#5cff47', '#00f6ff', '#ff3cf0', '#ffe600', '#8b6bff', '#ff7a18'];
