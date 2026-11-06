import * as vscode from 'vscode';
import { bindScmCommits, type ScmCommitApi, type ScmCommitRepo } from './scmRefresh';

type GitRepo = {
  readonly rootUri: vscode.Uri;
  readonly onDidCommit: vscode.Event<void>;
};

type GitApi = {
  readonly state: 'uninitialized' | 'initialized';
  readonly onDidChangeState: vscode.Event<'uninitialized' | 'initialized'>;
  readonly repositories: readonly GitRepo[];
  readonly onDidOpenRepository: vscode.Event<GitRepo>;
  readonly onDidCloseRepository: vscode.Event<GitRepo>;
};

type GitExtension = {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: vscode.Event<boolean>;
  getAPI(version: 1): GitApi;
};

function adapt(repo: GitRepo): ScmCommitRepo {
  return {
    root: repo.rootUri.fsPath,
    onDidCommit(listener) {
      return repo.onDidCommit(listener);
    },
  };
}

/** Source Control commits. The `.git` watcher misses some of them. */
export function listenForScmCommits(onCommit: (root: string) => void): vscode.Disposable {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) return new vscode.Disposable(() => undefined);

  let disposed = false;
  let apiBinding: { dispose(): void } | undefined;
  let enablement: vscode.Disposable | undefined;

  const bind = (git: GitExtension) => {
    apiBinding?.dispose();
    apiBinding = undefined;
    if (disposed || !git.enabled) return;
    let api: GitApi;
    try {
      api = git.getAPI(1);
    } catch {
      return;
    }
    const adapted: ScmCommitApi = {
      get state() {
        return api.state;
      },
      onDidChangeState(listener) {
        return api.onDidChangeState(listener);
      },
      get repositories() {
        return api.repositories.map(adapt);
      },
      onDidOpenRepository(listener) {
        return api.onDidOpenRepository((repo) => listener(adapt(repo)));
      },
      onDidCloseRepository(listener) {
        return api.onDidCloseRepository((repo) => listener(adapt(repo)));
      },
    };
    apiBinding = bindScmCommits(adapted, onCommit);
  };

  const start = (git: GitExtension) => {
    if (disposed) return;
    enablement?.dispose();
    enablement = git.onDidChangeEnablement(() => bind(git));
    bind(git);
  };

  if (ext.isActive) start(ext.exports);
  else void ext.activate().then(start, () => undefined);

  return new vscode.Disposable(() => {
    disposed = true;
    enablement?.dispose();
    enablement = undefined;
    apiBinding?.dispose();
    apiBinding = undefined;
  });
}
