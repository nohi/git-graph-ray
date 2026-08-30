export const UNCOMMITTED = '*';

export type RefKind = 'head' | 'remote' | 'tag' | 'stash' | 'worktree';

export type RefSort = 'version:refname' | '-version:refname' | 'refname' | '-refname';

export type GraphRef = {
  kind: RefKind;
  name: string;
  hash: string;
  remote?: string;
  worktreePath?: string;
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

export type ColumnVisibility = {
  Author: boolean;
  AuthorDate: boolean;
  Commit: boolean;
  Committer: boolean;
  CommitterDate: boolean;
};

export type GraphTheme = 'classic' | 'Ray' | 'Ray Wave' | 'Ray Cycle' | 'Ray Stream';

export type DateFormat = 'Date & Time' | 'Date Only' | 'ISO Date & Time' | 'ISO Date Only' | 'Relative';

export type FileChange = {
  path: string;
  oldPath?: string;
  status: 'A' | 'M' | 'D' | 'R' | 'U' | 'C' | 'T';
};

export type CommitDetails = {
  hash: string;
  compare?: string;
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
  signature?: string;
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
  fetchRemotePrune: boolean;
  fetchRemotePruneTags: boolean;
  spaceSubstitution: 'None' | 'Hyphen' | 'Underscore';
  mergeNoCommit: boolean;
  mergeNoFastForward: boolean;
  mergeSquash: boolean;
  mergeSquashMessageFormat: 'Default' | 'Git SQUASH_MSG';
  popStashReinstateIndex: boolean;
  pullNoFastForward: boolean;
  pullSquash: boolean;
  pullSquashMessageFormat: 'Default' | 'Git SQUASH_MSG';
  rebaseIgnoreDate: boolean;
  rebaseInteractive: boolean;
  resetBranchMode: 'Soft' | 'Mixed' | 'Hard';
  resetUncommittedMode: 'Mixed' | 'Hard';
  stashIncludeUntracked: boolean;
};

export type ViewConfig = {
  graphColours: string[];
  graphStyle: 'rounded' | 'angular';
  uncommittedChanges: string;
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
  referenceLabelAlignment: string;
  markdown: boolean;
  enhancedAccessibility: boolean;
  autoCenter: boolean;
  detailsMaxHeight: number;
  detailsLocation: 'Inline' | 'Docked to Bottom';
  fileViewType: 'File Tree' | 'File List';
  compactFolders: boolean;
  fetchAvatars: boolean;
  loadMoreAutomatically: boolean;
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
};

export const RAY_COLOURS = ['#5cff47', '#00f6ff', '#ff3cf0', '#ffe600', '#8b6bff', '#ff7a18'];
