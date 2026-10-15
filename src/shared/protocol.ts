import type {
  ColumnVisibility,
  CommitDetails,
  GraphCommit,
  GraphRef,
  RepoInfo,
  RepoOperation,
  RepoOperationKind,
  UpstreamDivergence,
  ViewConfig,
} from './types';
import type { RemoteInfo, RepoSettings } from './dialogs';
import type { RemoteTagError, RemoteTagTip } from './remoteTags';

export type HostToView =
  | { type: 'snapshot'; payload: GraphSnapshot }
  | { type: 'patch'; payload: Partial<GraphSnapshot> }
  | { type: 'more'; commits: GraphCommit[]; hasMore: boolean }
  | { type: 'info'; payload: CommitDetails | null }
  | { type: 'fail'; message: string }
  | { type: 'busy'; on: boolean; fetch?: boolean; quiet?: boolean }
  | { type: 'notice'; message: string }
  | { type: 'rebaseReport'; html: string }
  | { type: 'picked'; requestId: string; path: string | null; patchKind?: 'am' | 'apply' }
  | { type: 'branchMerged'; requestId: string; merged: boolean | null }
  | { type: 'remoteTags'; requestId: string; tags: RemoteTagTip[]; errors: RemoteTagError[] }
  | { type: 'face'; email: string; dataUri: string }
  | { type: 'facesReset' }
  | { type: 'findHits'; requestId: string; hashes: string[]; indexes: number[]; truncated: boolean; error?: string }
  | { type: 'jump'; selected: string; compare?: string }
  | {
      type: 'undoState';
      canUndo: boolean;
      canRedo: boolean;
      undoLabel: string | null;
      redoLabel: string | null;
      /** Newest first. */
      undoLabels: string[];
      redoLabels: string[];
    }
  | {
      type: 'undoPreview';
      direction: 'undo' | 'redo';
      label: string;
      warning: string | null;
      showGraphs: boolean;
      before: GraphCommit[];
      after: GraphCommit[];
      beforeHead: string | null;
      afterHead: string | null;
      /** Checked-out branch at the start of this undo or redo. Null when detached. */
      headBranch: string | null;
      steps: number;
      changes: Array<{ kind: 'branch' | 'tag' | 'head' | 'stash'; name: string; from: string | null; to: string | null }>;
      commands: string[];
    };

export type GraphSnapshot = {
  repos: RepoInfo[];
  repoPath: string;
  /** Primary worktree. New worktrees default to a sibling of this path. */
  mainWorktreePath: string;
  head: string | null;
  currentBranch: string | null;
  branches: string[];
  remotes: RemoteInfo[];
  repoSettings: RepoSettings;
  customPrProviders: Array<{ name: string; templateUrl: string }>;
  globPatterns: Array<{ name: string; glob: string }>;
  filterRefs: GraphRef[];
  selectedBranches: string[] | 'all';
  commits: GraphCommit[];
  hasMore: boolean;
  config: ViewConfig;
  loading: boolean;
  menuVisibility: Record<string, Record<string, boolean>>;
  emoji: Array<{ shortcode: string; emoji: string }>;
  /** Path limit for the graph log. Null shows the whole history. */
  historyPath: string | null;
  operation: RepoOperation | null;
  divergence: UpstreamDivergence | null;
};

export type ViewToHost =
  | { type: 'ready' }
  | { type: 'reload' }
  | { type: 'more' }
  | { type: 'fetchAll' }
  | { type: 'pickRepo'; path: string }
  | { type: 'setBranches'; branches: string[] | 'all' }
  | { type: 'setFilter'; branches: string[] | 'all'; showRemotes: boolean }
  | { type: 'findCommits'; requestId: string; pattern: string; ignoreCase: boolean; regex: boolean; diff: boolean }
  | { type: 'loadUntil'; hash: string; index: number }
  | { type: 'setHistoryPath'; path: string | null }
  | { type: 'blame'; path: string }
  | { type: 'setShowRemotes'; value: boolean }
  | { type: 'setShowTags'; value: boolean }
  | { type: 'setTheme'; value: ViewConfig['theme'] }
  | { type: 'setRayCat'; enabled: boolean; count: number }
  | { type: 'setFetchPrune'; prune: boolean; pruneTags: boolean }
  | { type: 'openSettings' }
  | { type: 'setColumns'; value: ColumnVisibility }
  | { type: 'openRow'; hash: string | null }
  | { type: 'compare'; a: string; b: string }
  | { type: 'diff'; hash: string; path: string; oldPath?: string; parent?: string; compare?: string }
  | { type: 'openWorkFile'; path: string }
  | { type: 'openFolder'; path: string }
  | { type: 'showBlob'; hash: string; path: string }
  | { type: 'setFileView'; value: 'File Tree' | 'File List' }
  | { type: 'copy'; text: string }
  | { type: 'git'; action: GitAction }
  | { type: 'undo'; steps?: number }
  | { type: 'redo'; steps?: number }
  | { type: 'undoApply'; direction: 'undo' | 'redo'; steps?: number }
  | { type: 'setUndoPreview'; value: boolean }
  | { type: 'saveRepoSettings'; settings: RepoSettings }
  | { type: 'addRemote'; name: string; fetchUrl: string; pushUrl?: string }
  | { type: 'editRemote'; name: string; newName: string; fetchUrl: string; pushUrl?: string }
  | { type: 'deleteRemote'; name: string }
  | { type: 'openUrl'; url: string }
  | { type: 'pickFolder'; requestId: string; defaultPath?: string }
  | { type: 'pickSaveFile'; requestId: string; title: string; defaultName: string }
  | { type: 'pickOpenFile'; requestId: string; title: string }
  | { type: 'openMerge'; path: string }
  | { type: 'setAutoFetch'; enabled: boolean; interval: number }
  | { type: 'branchMerged'; requestId: string; name: string }
  | { type: 'remoteTags'; requestId: string; remotes: string[] }
  | { type: 'faces'; emails: string[] }
  | { type: 'openContributors' };

export type SquashMessageFormat = 'Default' | 'Git SQUASH_MSG';

export type PushMode = 'normal' | 'force-with-lease' | 'force';

export type PullAfterwards = {
  remote: string;
  branch: string;
  rebase: boolean;
  noFastForward: boolean;
  squash: boolean;
  squashMessageFormat: SquashMessageFormat;
};

export type PatchCommit = { hash: string; parents: string[] };

export type PatchFile = { path: string; untracked: boolean };

export type GitAction =
  | { kind: 'checkoutCommit'; hash: string }
  | { kind: 'checkoutBranch'; name: string; pullAfterwards?: PullAfterwards }
  | { kind: 'checkoutRemote'; remoteBranch: string; localName: string }
  | { kind: 'createBranch'; hash: string; name: string; checkout: boolean }
  | { kind: 'renameBranch'; oldName: string; newName: string }
  | { kind: 'deleteBranch'; name: string; force: boolean; deleteOnRemote?: string }
  | { kind: 'deleteRemoteBranch'; remote: string; name: string }
  | {
      kind: 'merge';
      ref: string;
      noCommit: boolean;
      noFastForward: boolean;
      squash: boolean;
      squashMessageFormat: SquashMessageFormat;
    }
  | { kind: 'rebase'; ref: string; ignoreDate: boolean; interactive: boolean }
  | {
      kind: 'rebaseBranches';
      onto: string;
      branches: string[];
      ignoreDate: boolean;
      /** Where HEAD should be after the batch, including when it stops early. */
      checkout: 'restore' | 'stay';
      /** Applies to conflicts and to every other per-branch failure. */
      onFailure: 'skip' | 'stop';
    }
  | { kind: 'cherryPick'; hashes: string[]; noCommit: boolean; recordOrigin: boolean; parent?: number }
  | { kind: 'revert'; hash: string; noCommit?: boolean; parent?: number }
  | { kind: 'reset'; hash: string; mode: 'soft' | 'mixed' | 'hard' }
  | { kind: 'dropCommit'; hash: string }
  | { kind: 'reword'; hash: string; message: string }
  | { kind: 'addTag'; hash: string; name: string; annotated: boolean; message?: string; pushTo?: string[] }
  | { kind: 'deleteTag'; name: string; deleteOnRemote?: string }
  | { kind: 'pushTag'; name: string; remotes: string[] }
  | { kind: 'stash'; includeUntracked: boolean; message?: string; paths?: string[] }
  | { kind: 'createCommitPatch'; destination: string; commits: PatchCommit[] }
  | { kind: 'createFilePatch'; destination: string; hash: string; parent?: string; paths: string[] }
  | { kind: 'createWorktreePatch'; destination: string; files?: PatchFile[] }
  | { kind: 'applyPatch'; file: string; commits: boolean }
  | { kind: 'stashApply'; name: string; pop: boolean; reinstateIndex: boolean }
  | { kind: 'stashDrop'; name: string }
  | { kind: 'stashCreateBranch'; name: string; stash: string }
  | { kind: 'cleanUntracked'; directories: boolean }
  | { kind: 'pushBranch'; name: string; remotes: string[]; setUpstream: boolean; mode: PushMode }
  | {
      kind: 'pullBranch';
      remote: string;
      branch: string;
      rebase: boolean;
      noFastForward: boolean;
      squash: boolean;
      squashMessageFormat: SquashMessageFormat;
    }
  | { kind: 'fetchRemote'; remote?: string; prune: boolean; pruneTags: boolean }
  | { kind: 'fetchIntoLocal'; local: string; remoteRef: string; force: boolean }
  | { kind: 'worktreeAdd'; hash: string; path: string; branch?: string }
  | { kind: 'worktreeOpen'; path: string; newWindow: boolean }
  | { kind: 'worktreeRemove'; path: string; force: boolean }
  | { kind: 'continueOperation'; operation: RepoOperationKind }
  | { kind: 'abortOperation'; operation: RepoOperationKind }
  | { kind: 'openScm' };
