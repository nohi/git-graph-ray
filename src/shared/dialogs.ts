export type RemoteInfo = { name: string; fetchUrl: string; pushUrl: string };

export type IssueLink = { regex: string; url: string; global?: boolean };

export type PullRequestConfig = {
  provider: string;
  hostRoot?: string;
  sourceRemote?: string;
  destRemote?: string;
  destBranch?: string;
};

export type RepoSettings = {
  hideRemotes: string[];
  issueLinking: IssueLink | null;
  pullRequest: PullRequestConfig | null;
  showRemotes?: boolean;
  showStashes?: boolean;
  showTags?: boolean;
  showWorktrees?: boolean;
  showReflogs?: boolean;
  firstParent?: boolean;
};

export function defaultRepoSettings(): RepoSettings {
  return { hideRemotes: [], issueLinking: null, pullRequest: null };
}

export function applySpaceSubstitution(value: string, mode: 'None' | 'Hyphen' | 'Underscore'): string {
  if (mode === 'Hyphen') return value.replaceAll(' ', '-');
  if (mode === 'Underscore') return value.replaceAll(' ', '_');
  return value;
}

export function defaultDialogs() {
  return {
    addTagPushToRemote: false,
    addTagType: 'Annotated' as const,
    applyStashReinstateIndex: false,
    cherryPickNoCommit: false,
    cherryPickRecordOrigin: false,
    createBranchCheckOut: false,
    deleteBranchForce: false,
    fetchIntoLocalForce: false,
    fetchRemotePrune: false,
    fetchRemotePruneTags: false,
    spaceSubstitution: 'None' as const,
    mergeNoCommit: false,
    mergeNoFastForward: true,
    mergeSquash: false,
    mergeSquashMessageFormat: 'Default' as const,
    popStashReinstateIndex: false,
    pullNoFastForward: false,
    pullSquash: false,
    pullSquashMessageFormat: 'Default' as const,
    rebaseIgnoreDate: true,
    rebaseInteractive: false,
    resetBranchMode: 'Mixed' as const,
    resetUncommittedMode: 'Mixed' as const,
    stashIncludeUntracked: true,
  };
}
