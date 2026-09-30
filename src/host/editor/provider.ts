import * as path from 'node:path';
import * as vscode from 'vscode';
import { UNCOMMITTED } from '../../shared/types';
import type { GitAction, GraphSnapshot, HostToView, ViewToHost } from '../../shared/protocol';
import { fillPrUrl } from '../../shared/issueLinks';
import { cfg, getCustomPrProviders, getEmojiMaps, getGlobPatterns, getMenuVisibility, getViewConfig, updateSetting, viewColumn } from '../config';
import { AvatarStore } from '../avatars';
import { runGitAction } from '../git/actions';
import { loadDetails } from '../git/details';
import { loadCommits, withUncommitted, workingTreeDirty, findDiffHashes } from '../git/log';
import { addRemote, deleteRemote, editRemote, listRemotes } from '../git/remotes';
import { loadRefs } from '../git/refs';
import { listWorktrees } from '../git/worktree';
import { discoverRepos, norm } from '../repos/discover';
import { loadRepoSettings, saveRepoSettings } from '../repoSettings';
import { gitOk, gitMaybe } from '../git/runner';
import { diffUri } from '../diff/provider';
import { diffEditorSides } from '../../shared/diffSides';
import { graphHtml, nonce } from './html';
import { isNoisyGitWatchPath, snapshotFingerprint } from './gitWatch';
import { graphDocumentLabel } from '../../shared/graphUri';
import { isGraphWebviewTab } from './graphTab';
import { GRAPH_VIEW_TYPE, loadPinned, savePinned } from './uri';

const RESTORE_SETTLE_MS = 600;
const HOLDER_WAIT_MS = 1000;

const GROUP_FOCUS = [
  'workbench.action.focusFirstEditorGroup',
  'workbench.action.focusSecondEditorGroup',
  'workbench.action.focusThirdEditorGroup',
  'workbench.action.focusFourthEditorGroup',
  'workbench.action.focusFifthEditorGroup',
  'workbench.action.focusSixthEditorGroup',
  'workbench.action.focusSeventhEditorGroup',
  'workbench.action.focusEighthEditorGroup',
];

export class GraphEditorProvider implements vscode.WebviewPanelSerializer {
  static readonly viewType = GRAPH_VIEW_TYPE;
  private gitBin = 'git';
  private gitVer = '';
  private sessions = new Set<GraphSession>();
  /** The one open graph panel. Side-by-side comparison can allow more later. */
  private holder: GraphSession | undefined;
  private taken = false;
  private disposed = false;
  private openGate: Promise<void> | undefined;
  private holderWaiters: Array<(session: GraphSession | undefined) => void> = [];
  private restoreTimer: ReturnType<typeof setTimeout> | undefined;
  private restoreSub: vscode.Disposable | undefined;
  private restoreDone: (() => void) | undefined;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly avatars: AvatarStore,
  ) {}

  setGit(bin: string, version: string): void {
    this.gitBin = bin;
    this.gitVer = version;
  }

  git(): string {
    return this.gitBin;
  }

  dispose(): void {
    this.disposed = true;
    this.finishRestoreWait();
  }

  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
    const repo =
      typeof state === 'object' && state && 'repo' in state && typeof (state as { repo: unknown }).repo === 'string'
        ? (state as { repo: string }).repo
        : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '');
    this.claimPanel(panel, repo, false);
  }

  private webviewOpts(): vscode.WebviewOptions & vscode.WebviewPanelOptions {
    return {
      enableScripts: true,
      retainContextWhenHidden: cfg('retainContextWhenHidden', true),
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'dist'), vscode.Uri.joinPath(this.ctx.extensionUri, 'resources')],
    };
  }

  private claimPanel(panel: vscode.WebviewPanel, repo: string, fetchOnOpen: boolean): void {
    const current = this.holder;
    if (current?.owns(panel)) return;
    const adopt = !current || (panel.active && !current.isActive());
    if (!adopt) {
      this.dropExtraPanel(panel);
      return;
    }
    if (current) {
      this.holder = undefined;
      this.sessions.delete(current);
    }
    this.taken = true;
    try {
      this.mount(panel, repo, fetchOnOpen);
    } catch (error) {
      if (!this.holder && current) {
        this.sessions.add(current);
        this.holder = current;
        this.taken = true;
      } else if (!this.holder) {
        this.taken = false;
      }
      throw error;
    }
    current?.dismiss();
  }

  private dropExtraPanel(panel: vscode.WebviewPanel): void {
    setTimeout(() => {
      void Promise.resolve(panel.dispose()).catch(() => undefined);
    }, 0);
  }

  private mount(panel: vscode.WebviewPanel, repoPath: string, fetchOnOpen: boolean): void {
    if (this.holder) {
      this.dropExtraPanel(panel);
      return;
    }
    const root = repoPath ? norm(repoPath) : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '');
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'dist'), vscode.Uri.joinPath(this.ctx.extensionUri, 'resources')],
    };
    const colour = cfg<string>('tabIconColourTheme', 'colour');
    panel.iconPath =
      colour === 'grey'
        ? vscode.Uri.joinPath(this.ctx.extensionUri, 'resources/icon-grey.svg')
        : vscode.Uri.joinPath(this.ctx.extensionUri, 'resources/icon.svg');
    panel.title = graphDocumentLabel(root);
    const session = new GraphSession(this.ctx, root, panel, () => this.gitBin, this.gitVer, this.avatars, () => this.persistPins(), fetchOnOpen);
    this.sessions.add(session);
    this.holder = session;
    this.taken = true;
    panel.onDidDispose(() => {
      this.sessions.delete(session);
      if (this.holder !== session) return;
      this.holder = undefined;
      this.taken = false;
      this.notifyHolder();
      this.persistPins();
    });
    this.persistPins();
    session.start();
    const htmlN = nonce();
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'dist/webview/webview.js'));
    const css = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'dist/webview/style.css'));
    panel.webview.html = graphHtml(panel.webview.cspSource, String(script), String(css), htmlN);
    this.notifyHolder();
  }

  private persistPins(): void {
    const pins = [...new Set([...this.sessions].map((s) => norm(s.repoRoot)).filter(Boolean))];
    void savePinned(this.ctx, pins);
  }

  async restorePins(): Promise<void> {
    await this.waitForRestoredTabs();
    if (this.disposed || this.hasOpenGraph()) return;
    for (const repoPath of loadPinned(this.ctx)) {
      if (this.hasOpenGraph()) return;
      try {
        await this.openRepo({ repoPath, focus: false });
      } catch {
        continue;
      }
      if (this.hasOpenGraph()) return;
    }
  }

  private waitForRestoredTabs(): Promise<void> {
    if (this.disposed || this.hasOpenGraph()) return Promise.resolve();
    return new Promise((resolve) => {
      this.restoreDone = resolve;
      this.restoreSub = vscode.window.tabGroups.onDidChangeTabs(() => {
        if (this.graphTabs().length > 0) this.finishRestoreWait();
      });
      this.restoreTimer = setTimeout(() => this.finishRestoreWait(), RESTORE_SETTLE_MS);
    });
  }

  private finishRestoreWait(): void {
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = undefined;
    this.restoreSub?.dispose();
    this.restoreSub = undefined;
    const done = this.restoreDone;
    this.restoreDone = undefined;
    done?.();
  }

  private hasOpenGraph(): boolean {
    return this.holder != null || this.taken || this.graphTabs().length > 0;
  }

  private graphTabs(): vscode.Tab[] {
    const tabs: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (isGraphWebviewTab(tab.input)) tabs.push(tab);
      }
    }
    return tabs;
  }

  private preferredGraphTab(): vscode.Tab | undefined {
    const tabs = this.graphTabs();
    return tabs.find((tab) => tab.isActive) ?? tabs[0];
  }

  private notifyHolder(): void {
    const session = this.holder;
    const waiters = this.holderWaiters.splice(0);
    for (const waiter of waiters) waiter(session);
  }

  private waitForHolder(ms: number): Promise<GraphSession | undefined> {
    if (this.holder) return Promise.resolve(this.holder);
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const done = (session: GraphSession | undefined) => {
        clearTimeout(timer);
        this.holderWaiters = this.holderWaiters.filter((waiter) => waiter !== done);
        resolve(session);
      };
      timer = setTimeout(() => done(this.holder), ms);
      this.holderWaiters.push(done);
    });
  }

  private async reuseOpenPanel(focus: boolean, fetch?: boolean): Promise<boolean> {
    if (!this.hasOpenGraph()) return false;
    const session = this.holder ?? (await this.waitForHolder(HOLDER_WAIT_MS));
    if (session) {
      if (focus) session.reveal();
      if (fetch) await session.fetchRemotes();
      return true;
    }
    const tab = this.preferredGraphTab();
    if (tab) {
      if (focus) await this.focusGraphTab(tab);
      return true;
    }
    return this.taken;
  }

  private async focusGraphTab(tab: vscode.Tab): Promise<void> {
    const groupIndex = vscode.window.tabGroups.all.indexOf(tab.group);
    const tabIndex = tab.group.tabs.indexOf(tab);
    if (groupIndex < 0 || tabIndex < 0) return;
    if (!tab.group.isActive) {
      const focusGroup = GROUP_FOCUS[groupIndex];
      if (!focusGroup) return;
      await vscode.commands.executeCommand(focusGroup);
    }
    await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', tabIndex);
  }

  async openRepo(opts?: { repoPath?: string; fetch?: boolean; focus?: boolean }): Promise<void> {
    while (this.openGate) await this.openGate;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.openGate = gate;
    try {
      await this.openRepoLocked(opts);
    } finally {
      release();
      if (this.openGate === gate) this.openGate = undefined;
    }
  }

  private async openRepoLocked(opts?: { repoPath?: string; fetch?: boolean; focus?: boolean }): Promise<void> {
    const focus = opts?.focus !== false;
    if (await this.reuseOpenPanel(focus, opts?.fetch)) return;

    let repo = opts?.repoPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    if (!opts?.repoPath && cfg('openToTheRepoOfTheActiveTextEditorDocument', false)) {
      const doc = vscode.window.activeTextEditor?.document.uri.fsPath;
      if (doc) {
        try {
          repo = (await gitOk(this.git(), path.dirname(doc), ['rev-parse', '--show-toplevel'])).trim();
        } catch {
          /* keep */
        }
      }
    }
    if (await this.reuseOpenPanel(focus, opts?.fetch)) return;
    if (!repo) return;
    repo = norm(repo);
    if (await this.reuseOpenPanel(focus, opts?.fetch)) return;

    this.taken = true;
    try {
      const panel = vscode.window.createWebviewPanel(
        GraphEditorProvider.viewType,
        graphDocumentLabel(repo),
        { viewColumn: viewColumn(), preserveFocus: !focus },
        this.webviewOpts(),
      );
      this.mount(panel, repo, Boolean(opts?.fetch));
    } catch (error) {
      if (!this.holder) this.taken = false;
      throw error;
    }
  }

  broadcastFacesCleared(): void {
    for (const s of this.sessions) s.post({ type: 'facesReset' });
  }
}

class GraphSession {
  private repoPath: string;
  private selected: string[] | 'all' = 'all';
  private showRemotes = true;
  private includeHead = false;
  private commits: GraphSnapshot['commits'] = [];
  private hasMore = false;
  private skip = 0;
  private debounce: NodeJS.Timeout | undefined;
  private quietUntil = 0;
  private watcher: vscode.Disposable | undefined;
  private disposed = false;
  private reloadGen = 0;
  private lastFingerprint = '';
  private scrollHeadOnLoad = true;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    repoPath: string,
    private readonly panel: vscode.WebviewPanel,
    private readonly git: () => string,
    private gitVer: string,
    private readonly avatars: AvatarStore,
    private readonly onRepoChange: () => void,
    private readonly fetchOnOpen = false,
  ) {
    this.repoPath = repoPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  start(): void {
    this.panel.webview.onDidReceiveMessage((m: ViewToHost) => void this.onMessage(m));
    this.panel.onDidDispose(() => this.dispose());
    this.watch();
  }

  get repoRoot(): string {
    return this.repoPath;
  }

  owns(panel: vscode.WebviewPanel): boolean {
    return this.panel === panel;
  }

  isActive(): boolean {
    return this.panel.active;
  }

  dismiss(): void {
    if (this.disposed) return;
    this.panel.dispose();
  }

  reveal(): void {
    if (this.disposed) return;
    const column = this.panel.viewColumn;
    if (column == null) this.panel.reveal(vscode.ViewColumn.Active);
    else this.panel.reveal(column);
  }

  post(msg: HostToView): void {
    if (this.disposed) return;
    try {
      const sent = this.panel.webview.postMessage(msg);
      void Promise.resolve(sent).catch(() => {
        this.disposed = true;
      });
    } catch {
      this.disposed = true;
    }
  }

  async fetchRemotes(): Promise<void> {
    await this.run({
      kind: 'fetchRemote',
      prune: cfg('repository.fetchAndPrune', false),
      pruneTags: cfg('repository.fetchAndPruneTags', false),
    });
  }

  private async onMessage(msg: ViewToHost): Promise<void> {
    if (this.disposed) return;
    try {
      switch (msg.type) {
        case 'ready':
          await this.reload();
          if (this.fetchOnOpen) {
            await this.run({
              kind: 'fetchRemote',
              prune: cfg('repository.fetchAndPrune', false),
              pruneTags: cfg('repository.fetchAndPruneTags', false),
            });
          }
          return;
        case 'reload':
          await this.reload();
          return;
        case 'more':
          await this.loadMore();
          return;
        case 'fetchAll':
          await this.run({
            kind: 'fetchRemote',
            prune: cfg('repository.fetchAndPrune', false),
            pruneTags: cfg('repository.fetchAndPruneTags', false),
          });
          return;
        case 'pickRepo':
          this.repoPath = msg.path;
          this.selected = this.initialBranches();
          this.scrollHeadOnLoad = true;
          this.lastFingerprint = '';
          this.panel.title = graphDocumentLabel(this.repoPath);
          this.onRepoChange();
          this.watch();
          await this.reload();
          return;
        case 'setBranches':
          this.selected = msg.branches;
          await this.reload();
          return;
        case 'setFilter': {
          this.selected = msg.branches;
          this.showRemotes = msg.showRemotes;
          const settings = loadRepoSettings(this.ctx, this.repoPath);
          await saveRepoSettings(this.ctx, this.repoPath, { ...settings, showRemotes: msg.showRemotes });
          await updateSetting('repository.showRemoteBranches', msg.showRemotes);
          await this.reload();
          return;
        }
        case 'findInDiffs': {
          try {
            const hashes = await this.searchDiffs(msg.pattern, msg.ignoreCase, msg.regex);
            this.post({ type: 'findDiffs', hashes });
          } catch (e) {
            this.post({
              type: 'findDiffs',
              hashes: [],
              error: e instanceof Error ? e.message : String(e),
            });
          }
          return;
        }
        case 'setShowRemotes': {
          this.showRemotes = msg.value;
          const settings = loadRepoSettings(this.ctx, this.repoPath);
          await saveRepoSettings(this.ctx, this.repoPath, { ...settings, showRemotes: msg.value });
          await updateSetting('repository.showRemoteBranches', msg.value);
          await this.reload();
          return;
        }
        case 'setShowTags': {
          const settings = loadRepoSettings(this.ctx, this.repoPath);
          await saveRepoSettings(this.ctx, this.repoPath, { ...settings, showTags: msg.value });
          await updateSetting('repository.showTags', msg.value);
          await this.reload();
          return;
        }
        case 'setTheme':
          await updateSetting('graph.theme', msg.value);
          this.post({ type: 'patch', payload: { config: getViewConfig(this.gitVer) } });
          return;
        case 'setRayCat':
          await updateSetting('rayCat.enabled', msg.enabled);
          await updateSetting('rayCat.count', Math.max(1, Math.min(10, Math.round(msg.count))));
          this.post({ type: 'patch', payload: { config: getViewConfig(this.gitVer) } });
          return;
        case 'setFetchPrune':
          await updateSetting('repository.fetchAndPrune', msg.prune);
          await updateSetting('repository.fetchAndPruneTags', msg.pruneTags);
          this.post({ type: 'patch', payload: { config: getViewConfig(this.gitVer) } });
          return;
        case 'openSettings':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'git-graph-ray');
          return;
        case 'setColumns':
          await updateSetting('defaultColumnVisibility', msg.value);
          this.post({ type: 'patch', payload: { config: getViewConfig(this.gitVer) } });
          return;
        case 'openRow':
          if (!msg.hash) {
            this.post({ type: 'info', payload: null });
            return;
          }
          await this.sendDetails(msg.hash);
          return;
        case 'compare':
          await this.sendDetails(msg.a, msg.b);
          return;
        case 'diff':
          await this.openDiff(msg.hash, msg.path, msg.oldPath, msg.parent, msg.compare);
          return;
        case 'openWorkFile':
          await vscode.window.showTextDocument(vscode.Uri.file(path.join(this.repoPath, msg.path)), { viewColumn: viewColumn() });
          return;
        case 'showBlob':
          await this.openBlob(msg.hash, msg.path);
          return;
        case 'setFileView':
          await updateSetting('commitDetailsView.fileView.type', msg.value);
          return;
        case 'copy':
          await vscode.env.clipboard.writeText(msg.text);
          return;
        case 'git':
          await this.run(msg.action);
          return;
        case 'saveRepoSettings':
          await saveRepoSettings(this.ctx, this.repoPath, msg.settings);
          await this.reload();
          return;
        case 'addRemote':
          this.post({ type: 'busy', on: true });
          await addRemote(this.git(), this.repoPath, msg.name, msg.fetchUrl, msg.pushUrl);
          await this.reload();
          return;
        case 'editRemote':
          this.post({ type: 'busy', on: true });
          await editRemote(this.git(), this.repoPath, msg.name, msg.newName, msg.fetchUrl, msg.pushUrl);
          await this.reload();
          return;
        case 'deleteRemote':
          this.post({ type: 'busy', on: true });
          await deleteRemote(this.git(), this.repoPath, msg.name);
          await this.reload();
          return;
        case 'openUrl':
          await vscode.env.openExternal(vscode.Uri.parse(msg.url));
          return;
        case 'pickFolder': {
          const pick = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false });
          this.post({ type: 'picked', requestId: msg.requestId, path: pick?.[0]?.fsPath ?? null });
          return;
        }
        case 'faces':
          await this.sendFaces(msg.emails);
          return;
      }
    } catch (e) {
      this.post({ type: 'busy', on: false });
      this.post({ type: 'fail', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private initialBranches(): string[] | 'all' {
    const specific = cfg<string[]>('repository.onLoad.showSpecificBranches', []);
    if (specific.length) return specific;
    if (cfg('repository.onLoad.showCheckedOutBranch', false)) return [];
    return 'all';
  }

  private async snapshot(): Promise<GraphSnapshot> {
    const extra = this.ctx.workspaceState.get<string[]>('ggr.extraRepos', []);
    const hidden = this.ctx.workspaceState.get<string[]>('ggr.hiddenRepos', []);
    const repos = await discoverRepos(this.git(), extra, hidden, cfg('maxDepthOfRepoSearch', 0));
    this.sortRepos(repos);
    if (!this.repoPath || !repos.some((r) => r.path === this.repoPath)) this.repoPath = repos[0]?.path ?? this.repoPath;
    const settings = loadRepoSettings(this.ctx, this.repoPath);
    const config = getViewConfig(this.gitVer);
    if (settings.showRemotes != null) config.showRemoteBranches = settings.showRemotes;
    if (settings.showStashes != null) config.showStashes = settings.showStashes;
    if (settings.showTags != null) config.showTags = settings.showTags;
    if (settings.showWorktrees != null) config.showWorktrees = settings.showWorktrees;
    if (settings.showReflogs != null) config.includeCommitsMentionedByReflogs = settings.showReflogs;
    if (settings.firstParent != null) config.onlyFollowFirstParent = settings.firstParent;
    this.showRemotes = config.showRemoteBranches;

    const { refs, branches, head, currentBranch } = await loadRefs(this.git(), this.repoPath, config.showRemoteHeads).catch(() => ({
      refs: [] as import('../../shared/types').GraphRef[],
      branches: [] as string[],
      head: null as string | null,
      currentBranch: null as string | null,
    }));
    const trees = await listWorktrees(this.git(), this.repoPath).catch(() => []);
    for (const t of trees) {
      refs.push({ kind: 'worktree', name: path.basename(t.path), hash: t.head, worktreePath: t.path });
    }
    const remotes = (await listRemotes(this.git(), this.repoPath).catch(() => [])).filter((r) => !settings.hideRemotes.includes(r.name));
    this.includeHead = !currentBranch;
    const filterRefs = refs.filter((r) => {
      if (r.kind === 'stash') return false;
      if (r.kind === 'remote' && r.remote && settings.hideRemotes.includes(r.remote)) return false;
      return true;
    });
    const visibleRefs = refs.filter((r) => {
      if (r.kind === 'stash' && !config.showStashes) return false;
      if (r.kind === 'tag' && !config.showTags) return false;
      if (r.kind === 'worktree' && !config.showWorktrees) return false;
      if (r.kind === 'remote' && !this.showRemotes) return false;
      if (r.kind === 'remote' && r.remote && settings.hideRemotes.includes(r.remote)) return false;
      return true;
    });

    this.skip = 0;
    const page = cfg('repository.commits.initialLoad', 300);
    const loaded = await loadCommits({
      git: this.git(),
      cwd: this.repoPath,
      maxCount: page,
      skip: 0,
      order: cfg('repository.commits.order', 'date'),
      showRemote: this.showRemotes,
      showStashes: config.showStashes,
      showTags: config.showTags,
      firstParent: config.onlyFollowFirstParent,
      reflog: config.includeCommitsMentionedByReflogs,
      mailmap: cfg('repository.useMailmap', false),
      branches: this.selected === 'all' ? 'all' : this.selected,
      includeTagOnly: config.showCommitsOnlyReferencedByTags,
      includeHead: this.includeHead,
      refs: visibleRefs,
    }).catch(() => ({ commits: [], hasMore: false }));
    const untracked = config.showUntrackedFiles ? '-unormal' : '-uno';
    const porcelain = this.repoPath
      ? await gitMaybe(this.git(), this.repoPath, ['status', '--porcelain=v1', untracked]).catch(() => '')
      : '';
    const dirty = config.showUncommittedChanges && workingTreeDirty(porcelain, config.showUntrackedFiles);
    this.commits = withUncommitted(loaded.commits, head, dirty);
    this.hasMore = loaded.hasMore;

    if (!this.disposed) this.panel.title = graphDocumentLabel(this.repoPath);

    return {
      repos,
      repoPath: this.repoPath,
      head,
      currentBranch,
      branches,
      remotes,
      repoSettings: settings,
      customPrProviders: getCustomPrProviders(),
      globPatterns: getGlobPatterns(),
      filterRefs,
      selectedBranches: this.selected,
      commits: this.commits,
      hasMore: this.hasMore,
      config,
      loading: false,
      menuVisibility: getMenuVisibility(),
      emoji: getEmojiMaps(),
    };
  }

  private sortRepos(repos: GraphSnapshot['repos']): void {
    const order = cfg<string>('repositoryDropdownOrder', 'Workspace Full Path');
    repos.sort((a, b) => {
      if (order === 'Name') return a.name.localeCompare(b.name);
      if (order === 'Workspace Full Path') {
        if (a.workspaceIndex !== b.workspaceIndex) return a.workspaceIndex - b.workspaceIndex;
      }
      return a.path.localeCompare(b.path);
    });
  }

  private async reload(opts?: { fromWatch?: boolean }): Promise<void> {
    if (this.disposed) return;
    const gen = ++this.reloadGen;
    this.quietUntil = Date.now() + 1500;
    if (!opts?.fromWatch) this.post({ type: 'patch', payload: { loading: true } });
    try {
      const payload = await this.snapshot();
      if (this.disposed || gen !== this.reloadGen) return;
      const fp = snapshotFingerprint(payload);
      if (opts?.fromWatch && fp === this.lastFingerprint) return;
      this.lastFingerprint = fp;
      this.post({ type: 'snapshot', payload });
      if (this.scrollHeadOnLoad) {
        this.scrollHeadOnLoad = false;
        if (cfg('repository.onLoad.scrollToHead', false) && payload.head) {
          this.post({ type: 'jump', selected: payload.head });
        }
      }
    } finally {
      this.quietUntil = Math.max(this.quietUntil, Date.now() + 800);
    }
  }

  private async loadMore(): Promise<void> {
    const n = cfg('repository.commits.loadMore', 100);
    this.skip += cfg('repository.commits.initialLoad', 300);
    const extra = await loadCommits({
      git: this.git(),
      cwd: this.repoPath,
      maxCount: n,
      skip: this.commits.filter((c) => c.hash !== UNCOMMITTED).length,
      order: cfg('repository.commits.order', 'date'),
      showRemote: this.showRemotes,
      showStashes: getViewConfig(this.gitVer).showStashes,
      showTags: getViewConfig(this.gitVer).showTags,
      firstParent: cfg('repository.onlyFollowFirstParent', false),
      reflog: cfg('repository.includeCommitsMentionedByReflogs', false),
      mailmap: cfg('repository.useMailmap', false),
      branches: this.selected === 'all' ? 'all' : this.selected,
      includeTagOnly: cfg('repository.showCommitsOnlyReferencedByTags', true),
      includeHead: this.includeHead,
    });
    this.commits = [...this.commits, ...extra.commits];
    this.hasMore = extra.hasMore;
    this.post({ type: 'more', commits: extra.commits, hasMore: extra.hasMore });
  }

  private async searchDiffs(pattern: string, ignoreCase: boolean, regex: boolean): Promise<string[]> {
    const config = getViewConfig(this.gitVer);
    const settings = loadRepoSettings(this.ctx, this.repoPath);
    if (settings.showStashes != null) config.showStashes = settings.showStashes;
    if (settings.showTags != null) config.showTags = settings.showTags;
    return findDiffHashes(
      this.git(),
      this.repoPath,
      pattern,
      { ignoreCase, regex, maxCount: 5000 },
      {
        branches: this.selected === 'all' ? 'all' : this.selected,
        showRemote: this.showRemotes,
        showStashes: config.showStashes,
        showTags: config.showTags,
        includeTagOnly: config.showCommitsOnlyReferencedByTags,
        reflog: config.includeCommitsMentionedByReflogs,
        includeHead: this.includeHead,
      },
    );
  }

  private async sendDetails(hash: string, compare?: string): Promise<void> {
    const encoding = vscode.workspace.getConfiguration('git-graph-ray', vscode.Uri.file(this.repoPath)).get('fileEncoding', 'utf8');
    const details = await loadDetails(this.git(), this.repoPath, hash, compare, encoding, cfg('repository.commits.showSignatureStatus', false));
    this.post({ type: 'info', payload: details });
  }

  private async openDiff(hash: string, filePath: string, oldPath?: string, parent?: string, compare?: string): Promise<void> {
    const sides = diffEditorSides({ hash, compare, path: filePath, oldPath, parent });
    const left = diffUri(this.repoPath, sides.leftSpec, sides.leftPath, sides.leftLabel);
    const right = diffUri(this.repoPath, sides.rightSpec, sides.rightPath, sides.rightLabel);
    await vscode.commands.executeCommand('vscode.diff', left, right, sides.title, {
      viewColumn: viewColumn(),
    });
  }

  private async openBlob(hash: string, filePath: string): Promise<void> {
    const rev = hash === UNCOMMITTED ? 'HEAD' : hash;
    const uri = diffUri(this.repoPath, `${rev}:${filePath}`, filePath, hash === UNCOMMITTED ? 'HEAD' : hash.slice(0, 7));
    await vscode.window.showTextDocument(uri, { viewColumn: viewColumn(), preview: true });
  }

  private async run(action: GitAction): Promise<void> {
    this.quietUntil = Date.now() + 60_000;
    this.post({ type: 'busy', on: true, fetch: action.kind === 'fetchRemote' });
    try {
      if (action.kind === 'worktreeOpen') {
        this.quietUntil = Date.now() + 800;
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(action.path), action.newWindow);
        return;
      }
      if (action.kind === 'openScm') {
        this.quietUntil = Date.now() + 800;
        await vscode.commands.executeCommand('workbench.view.scm');
        return;
      }
      if (action.kind === 'checkoutBranch' && action.pullAfterwards === undefined) {
        /* ok */
      }
      await runGitAction(this.git(), this.repoPath, action, {
        signCommits: cfg('repository.sign.commits', false),
        signTags: cfg('repository.sign.tags', false),
        shellPath: cfg('integratedTerminalShell', '') || undefined,
      });
      await this.reload();
    } finally {
      this.post({ type: 'busy', on: false });
    }
  }

  private async sendFaces(emails: string[]): Promise<void> {
    if (!cfg('repository.commits.fetchAvatars', false)) return;
    for (const email of emails) {
      const uri = await this.avatars.resolve(this.git(), this.repoPath, email);
      if (uri) this.post({ type: 'face', email, dataUri: uri });
    }
  }

  private watch(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    if (this.disposed || !this.repoPath) return;
    const gitDir = path.join(this.repoPath, '.git');
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(gitDir, '**'));
    const bump = (uri: vscode.Uri) => {
      if (this.disposed) return;
      if (Date.now() < this.quietUntil) return;
      if (isNoisyGitWatchPath(uri.fsPath)) return;
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => void this.reload({ fromWatch: true }), 400);
    };
    w.onDidChange(bump);
    w.onDidCreate(bump);
    w.onDidDelete(bump);
    this.watcher = w;
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.debounce);
    this.debounce = undefined;
    this.watcher?.dispose();
    this.watcher = undefined;
  }
}

export function prUrl(
  template: string,
  repo: string,
  source: string,
  dest: string,
): string {
  return fillPrUrl(template, { repo, source, dest });
}
