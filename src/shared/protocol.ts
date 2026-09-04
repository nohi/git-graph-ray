import type { ColumnVisibility, CommitDetails, GraphCommit, GraphRef, RepoInfo, ViewConfig } from './types';
import type { RemoteInfo, RepoSettings } from './dialogs';

export type HostToView =
  | { type: 'snapshot'; payload: GraphSnapshot }
  | { type: 'patch'; payload: Partial<GraphSnapshot> }
  | { type: 'more'; commits: GraphCommit[]; hasMore: boolean }
  | { type: 'info'; payload: CommitDetails | null }
  | { type: 'fail'; message: string }
  | { type: 'busy'; on: boolean; fetch?: boolean }
  | { type: 'notice'; message: string }
  | { type: 'picked'; requestId: string; path: string | null }
  | { type: 'face'; email: string; dataUri: string }
  | { type: 'facesReset' }
  | { type: 'findDiffs'; hashes: string[]; error?: string }
  | { type: 'jump'; selected: string; compare?: string };

export type GraphSnapshot = {
  repos: RepoInfo[];
  repoPath: string;
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
};

export type ViewToHost =
  | { type: 'ready' }
  | { type: 'reload' }
  | { type: 'more' }
  | { type: 'fetchAll' }
  | { type: 'pickRepo'; path: string }
  | { type: 'setBranches'; branches: string[] | 'all' }
  | { type: 'setFilter'; branches: string[] | 'all'; showRemotes: boolean }
  | { type: 'findInDiffs'; pattern: string; ignoreCase: boolean; regex: boolean }
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
  | { type: 'showBlob'; hash: string; path: string }
  | { type: 'setFileView'; value: 'File Tree' | 'File List' }
  | { type: 'copy'; text: string }
  | { type: 'git'; action: GitAction }
  | { type: 'saveRepoSettings'; settings: RepoSettings }
  | { type: 'addRemote'; name: string; fetchUrl: string; pushUrl?: string }
  | { type: 'editRemote'; name: string; newName: string; fetchUrl: string; pushUrl?: string }
  | { type: 'deleteRemote'; name: string }
  | { type: 'openUrl'; url: string }
  | { type: 'pickFolder'; requestId: string }
  | { type: 'faces'; emails: string[] };

export type SquashMessageFormat = 'Default' | 'Git SQUASH_MSG';

export type PushMode = 'normal' | 'force-with-lease' | 'force';

export type PullAfterwards = {
  remote: string;
  branch: string;
  noFastForward: boolean;
  squash: boolean;
  squashMessageFormat: SquashMessageFormat;
};

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
  | { kind: 'cherryPick'; hash: string; noCommit: boolean; recordOrigin: boolean; parent?: number }
  | { kind: 'revert'; hash: string; noCommit?: boolean; parent?: number }
  | { kind: 'reset'; hash: string; mode: 'soft' | 'mixed' | 'hard' }
  | { kind: 'dropCommit'; hash: string }
  | { kind: 'reword'; hash: string; message: string }
  | { kind: 'addTag'; hash: string; name: string; annotated: boolean; message?: string; pushTo?: string }
  | { kind: 'deleteTag'; name: string; deleteOnRemote?: string }
  | { kind: 'pushTag'; name: string; remote: string }
  | { kind: 'stash'; includeUntracked: boolean; message?: string }
  | { kind: 'stashApply'; name: string; pop: boolean; reinstateIndex: boolean }
  | { kind: 'stashDrop'; name: string }
  | { kind: 'stashCreateBranch'; name: string; stash: string }
  | { kind: 'cleanUntracked'; directories: boolean }
  | { kind: 'pushBranch'; name: string; remotes: string[]; setUpstream: boolean; mode: PushMode }
  | {
      kind: 'pullBranch';
      remote: string;
      branch: string;
      noFastForward: boolean;
      squash: boolean;
      squashMessageFormat: SquashMessageFormat;
    }
  | { kind: 'fetchRemote'; remote?: string; prune: boolean; pruneTags: boolean }
  | { kind: 'fetchIntoLocal'; local: string; remoteRef: string; force: boolean }
  | { kind: 'worktreeAdd'; hash: string; path: string; branch?: string }
  | { kind: 'worktreeOpen'; path: string; newWindow: boolean }
  | { kind: 'worktreeRemove'; path: string; force: boolean }
  | { kind: 'openScm' };
