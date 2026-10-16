import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { UNCOMMITTED, type GraphRef } from '../../shared/types';
import type { GitAction, GraphSnapshot, HostToView, ViewToHost } from '../../shared/protocol';
import {
  checkpointsEqual,
  externalCommitChange,
  historyRange,
  moveUndoSteps,
  needsUndoDialog,
  planRestore,
  previewWindow,
  pushUndo,
  rangeLabel,
  rangeTipReset,
  rangeWarning,
  undoLabel,
  undoPolicy,
  type LocalCheckpoint,
  type UndoEntry,
  type UndoStack,
} from '../../shared/undo';
import { fillPrUrl } from '../../shared/issueLinks';
import { cfg, autoFetchIntervalSeconds, getCustomPrProviders, getEmojiMaps, getGlobPatterns, getMenuVisibility, getViewConfig, LABEL_COLOUR_STATE_KEY, saveLabelColours, updateSetting, viewColumn } from '../config';
import { parseRefColours, refColoursToSetting } from '../../shared/refColours';
import { AvatarStore } from '../avatars';
import { runGitAction } from '../git/actions';
import { PartialRemotePushError, TagPushError } from '../git/tagPush';
import { loadDetails, resolveRepoRelative } from '../git/details';
import { loadCommits, withUncommitted, workingTreeDirty, findDiffHashes, findCommitHashes, hashIndex, parseUpstreamDivergence } from '../git/log';
import { readRepoOperation } from '../git/repoState';
import { compileFindRegex, indexFindHashes } from '../../shared/commitFind';
import { addRemote, deleteRemote, editRemote, listRemotes } from '../git/remotes';
import { branchFullyMerged } from '../git/branchMerged';
import { invalidateRemoteTagCache, loadRemoteTagTips } from '../git/remoteTags';
import { loadRefs } from '../git/refs';
import { listWorktrees } from '../git/worktree';
import { discoverRepos, norm } from '../repos/discover';
import { loadRepoSettings, saveRepoSettings } from '../repoSettings';
import { gitOk, gitMaybe } from '../git/runner';
import { applyRestorePlan, captureCheckpoint, captureRemoteTips, loadCheckpointCommits, workingTreeHasTrackedChanges } from '../git/undo';
import { diffUri } from '../diff/provider';
import { diffEditorSides } from '../../shared/diffSides';
import { detectPatchKind } from '../../shared/historyActions';
import { branchLabelsForFilter } from '../../shared/refsList';
import { primaryWorktreePath } from '../../shared/worktreeDialog';
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
  private contributorsOpener: (repoPath: string) => Promise<void> = async () => {};
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

  setContributorsOpener(open: (repoPath: string) => Promise<void>): void {
    this.contributorsOpener = open;
    for (const session of this.sessions) session.setContributorsOpener(open);
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
    panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'resources/icon.png');
    panel.title = graphDocumentLabel(root);
    const session = new GraphSession(this.ctx, root, panel, () => this.gitBin, this.gitVer, this.avatars, () => this.persistPins(), fetchOnOpen);
    session.setContributorsOpener((repoPath) => this.contributorsOpener(repoPath));
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
  /** Branch, tag, and other labels from the last full load. Later pages must reuse them. */
  private visibleRefs: GraphRef[] = [];
  private debounce: NodeJS.Timeout | undefined;
  private quietUntil = 0;
  private watcher: vscode.Disposable | undefined;
  private disposed = false;
  private reloadGen = 0;
  private lastFingerprint = '';
  private scrollHeadOnLoad = true;
  private historyPath: string | null = null;
  private loadGen = 0;
  private loadChain: Promise<void> = Promise.resolve();
  private findGen = 0;
  private opChain: Promise<void> = Promise.resolve();
  private acting = 0;
  private autoFetchTimer: ReturnType<typeof setInterval> | undefined;
  private configSub: vscode.Disposable | undefined;
  private undoStacks = new Map<string, UndoStack>();
  private lastCheckpoints = new Map<string, LocalCheckpoint>();
  private openContributorsPage: (repoPath: string) => Promise<void> = async () => {};

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

  setContributorsOpener(open: (repoPath: string) => Promise<void>): void {
    this.openContributorsPage = open;
  }

  start(): void {
    this.panel.webview.onDidReceiveMessage((m: ViewToHost) => void this.onMessage(m));
    this.panel.onDidDispose(() => this.dispose());
    this.configSub = vscode.workspace.onDidChangeConfiguration((event) => {
      if (this.disposed) return;
      const autoFetch = event.affectsConfiguration('git-graph-ray.repository.autoFetch') || event.affectsConfiguration('git-graph-ray.repository.autoFetchInterval');
      const labels = event.affectsConfiguration('git-graph-ray.referenceLabels');
      if (!autoFetch && !labels) return;
      if (autoFetch) this.armAutoFetch();
      this.post({ type: 'patch', payload: { config: this.viewConfig() } });
    });
    this.armAutoFetch();
    this.watch();
  }

  get repoRoot(): string {
    return this.repoPath;
  }

  private viewConfig() {
    return getViewConfig(this.gitVer, this.ctx.globalState.get(LABEL_COLOUR_STATE_KEY));
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
    await this.enqueue(() =>
      this.run({
        kind: 'fetchRemote',
        prune: cfg('repository.fetchAndPrune', false),
        pruneTags: cfg('repository.fetchAndPruneTags', false),
      }),
    );
  }

  private async onMessage(msg: ViewToHost): Promise<void> {
    if (this.disposed) return;
    try {
      switch (msg.type) {
        case 'ready':
          await this.reload();
          if (this.fetchOnOpen) {
            await this.enqueue(() =>
              this.run({
                kind: 'fetchRemote',
                prune: cfg('repository.fetchAndPrune', false),
                pruneTags: cfg('repository.fetchAndPruneTags', false),
              }),
            );
            return;
          }
          this.postUndoState();
          return;
        case 'reload':
          await this.reload();
          return;
        case 'more':
          await this.enqueueLoad(() => this.loadMore());
          return;
        case 'loadUntil':
          await this.enqueueLoad(() => this.loadUntil(msg.hash, msg.index));
          return;
        case 'setHistoryPath':
          this.historyPath = msg.path;
          await this.reload();
          return;
        case 'blame':
          await this.openBlame(msg.path);
          return;
        case 'fetchAll':
          await this.enqueue(() =>
            this.run({
              kind: 'fetchRemote',
              prune: cfg('repository.fetchAndPrune', false),
              pruneTags: cfg('repository.fetchAndPruneTags', false),
            }),
          );
          return;
        case 'pickRepo':
          this.repoPath = msg.path;
          this.historyPath = null;
          this.selected = this.initialBranches();
          this.scrollHeadOnLoad = true;
          this.lastFingerprint = '';
          this.panel.title = graphDocumentLabel(this.repoPath);
          this.onRepoChange();
          this.watch();
          await this.reload();
          this.postUndoState();
          return;
        case 'setBranches':
          this.selected = msg.branches;
          await this.reload();
          return;
        case 'setFilter': {
          this.selected = msg.branches;
          this.showRemotes = msg.showRemotes;
          const settings = loadRepoSettings(this.ctx, this.repoPath);
          await saveRepoSettings(this.ctx, this.repoPath, {
            ...settings,
            showRemotes: msg.showRemotes,
            showSameCommitBranches: msg.showSameCommitBranches,
          });
          await updateSetting('repository.showRemoteBranches', msg.showRemotes);
          await this.reload();
          return;
        }
        case 'findCommits':
          await this.answerFind(msg);
          return;
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
          this.post({ type: 'patch', payload: { config: this.viewConfig() } });
          return;
        case 'setRayCat':
          await updateSetting('rayCat.enabled', msg.enabled);
          await updateSetting('rayCat.count', Math.max(1, Math.min(10, Math.round(msg.count))));
          this.post({ type: 'patch', payload: { config: this.viewConfig() } });
          return;
        case 'setFetchPrune':
          await updateSetting('repository.fetchAndPrune', msg.prune);
          await updateSetting('repository.fetchAndPruneTags', msg.pruneTags);
          this.post({ type: 'patch', payload: { config: this.viewConfig() } });
          return;
        case 'setUndoPreview':
          await updateSetting('undo.preview', msg.value);
          this.post({ type: 'patch', payload: { config: this.viewConfig() } });
          return;
        case 'openSettings':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'git-graph-ray');
          return;
        case 'setLabelColours':
          await saveLabelColours(this.ctx, refColoursToSetting(parseRefColours(msg.colours)));
          this.post({ type: 'patch', payload: { config: this.viewConfig() } });
          return;
        case 'setLanePriority':
          await updateSetting('graph.lanePriority', msg.priorities);
          this.post({ type: 'patch', payload: { config: this.viewConfig() } });
          return;
        case 'setColumns':
          await updateSetting('defaultColumnVisibility', msg.value);
          this.post({ type: 'patch', payload: { config: this.viewConfig() } });
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
        case 'openFolder': {
          const full = resolveRepoRelative(this.repoPath, msg.path);
          if (!full || !fs.existsSync(full)) throw new Error(`Folder not found: ${msg.path}`);
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(full));
          return;
        }
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
          await this.enqueue(() => this.run(msg.action));
          return;
        case 'undo':
          await this.enqueue(() => this.presentUndo('undo', msg.steps ?? 1));
          return;
        case 'redo':
          await this.enqueue(() => this.presentUndo('redo', msg.steps ?? 1));
          return;
        case 'undoApply':
          await this.enqueue(() => this.applyUndo(msg.direction, msg.steps ?? 1));
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
        case 'branchMerged': {
          const merged = await branchFullyMerged(this.git(), this.repoPath, msg.name).catch(() => null);
          this.post({ type: 'branchMerged', requestId: msg.requestId, merged });
          return;
        }
        case 'remoteTags': {
          const lookup = await loadRemoteTagTips(this.git(), this.repoPath, msg.remotes, remoteTagCacheMs()).catch((error: unknown) => ({
            tags: [],
            errors: [{ remote: '', message: error instanceof Error ? error.message : String(error) }],
          }));
          this.post({ type: 'remoteTags', requestId: msg.requestId, tags: lookup.tags, errors: lookup.errors });
          return;
        }
        case 'pickFolder': {
          const pick = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            title: 'Worktree location',
            openLabel: 'Select location',
            defaultUri: msg.defaultPath ? vscode.Uri.file(msg.defaultPath) : undefined,
          });
          this.post({ type: 'picked', requestId: msg.requestId, path: pick?.[0]?.fsPath ?? null });
          return;
        }
        case 'pickSaveFile': {
          const pick = await vscode.window.showSaveDialog({
            title: msg.title,
            defaultUri: vscode.Uri.file(path.join(this.repoPath, msg.defaultName)),
            filters: { Patch: ['patch', 'diff'] },
          });
          this.post({ type: 'picked', requestId: msg.requestId, path: pick?.fsPath ?? null });
          return;
        }
        case 'pickOpenFile': {
          const pick = await vscode.window.showOpenDialog({
            title: msg.title,
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select patch',
            filters: { Patch: ['patch', 'diff'] },
          });
          const file = pick?.[0]?.fsPath ?? null;
          let patchKind: 'am' | 'apply' | undefined;
          if (file) {
            const handle = await fs.promises.open(file, 'r');
            try {
              const buf = Buffer.alloc(4096);
              const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
              patchKind = detectPatchKind(buf.subarray(0, bytesRead).toString('utf8'));
            } finally {
              await handle.close();
            }
          }
          this.post({ type: 'picked', requestId: msg.requestId, path: file, patchKind });
          return;
        }
        case 'openMerge': {
          const full = resolveRepoRelative(this.repoPath, msg.path);
          if (!full) throw new Error(`File not found: ${msg.path}`);
          const uri = vscode.Uri.file(full);
          try {
            await vscode.commands.executeCommand('git.openMergeEditor', uri);
          } catch {
            try {
              await vscode.commands.executeCommand('vscode.openWith', uri, 'merge-editor');
            } catch {
              await vscode.window.showTextDocument(uri, { viewColumn: viewColumn() });
            }
          }
          return;
        }
        case 'setAutoFetch':
          await updateSetting('repository.autoFetch', msg.enabled);
          await updateSetting('repository.autoFetchInterval', autoFetchIntervalSeconds(msg.interval));
          return;
        case 'faces':
          await this.sendFaces(msg.emails);
          return;
        case 'openContributors':
          await this.openContributorsPage(this.repoPath);
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
    const config = this.viewConfig();
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
    const mainWorktreePath = primaryWorktreePath(trees, this.repoPath);
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
    this.visibleRefs = visibleRefs;

    this.skip = 0;
    const page = cfg('repository.commits.initialLoad', 300);
    const loaded = await loadCommits(this.commitLoad(page, 0)).catch(() => ({ commits: [], hasMore: false }));
    const untracked = config.showUntrackedFiles ? '-unormal' : '-uno';
    const porcelain = this.repoPath
      ? await gitMaybe(this.git(), this.repoPath, ['status', '--porcelain=v1', '-b', untracked]).catch(() => '')
      : '';
    const dirty = config.showUncommittedChanges && workingTreeDirty(porcelain, config.showUntrackedFiles);
    const divergence = parseUpstreamDivergence(porcelain);
    const operation = this.repoPath ? await readRepoOperation(this.git(), this.repoPath).catch(() => null) : null;
    this.commits = withUncommitted(loaded.commits, head, dirty);
    this.hasMore = loaded.hasMore;

    if (!this.disposed) this.panel.title = graphDocumentLabel(this.repoPath);

    return {
      repos,
      repoPath: this.repoPath,
      mainWorktreePath,
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
      historyPath: this.historyPath,
      operation,
      divergence,
    };
  }

  private commitLoad(maxCount: number, skip: number) {
    const config = this.viewConfig();
    const settings = loadRepoSettings(this.ctx, this.repoPath);
    if (settings.showStashes != null) config.showStashes = settings.showStashes;
    if (settings.showTags != null) config.showTags = settings.showTags;
    if (settings.firstParent != null) config.onlyFollowFirstParent = settings.firstParent;
    if (settings.showReflogs != null) config.includeCommitsMentionedByReflogs = settings.showReflogs;
    return {
      git: this.git(),
      cwd: this.repoPath,
      maxCount,
      skip,
      order: cfg('repository.commits.order', 'date') as 'date' | 'author-date' | 'topo',
      showRemote: this.showRemotes,
      showStashes: config.showStashes,
      showTags: config.showTags,
      firstParent: config.onlyFollowFirstParent,
      reflog: config.includeCommitsMentionedByReflogs,
      mailmap: cfg('repository.useMailmap', false),
      branches: this.selected === 'all' ? ('all' as const) : this.selected,
      includeTagOnly: config.showCommitsOnlyReferencedByTags,
      includeHead: this.includeHead,
      refs: branchLabelsForFilter(this.visibleRefs, this.selected, settings.showSameCommitBranches !== false),
      path: this.historyPath ?? undefined,
      follow: Boolean(this.historyPath),
    };
  }

  private revisionOptions() {
    const load = this.commitLoad(1, 0);
    return {
      branches: load.branches,
      showRemote: load.showRemote,
      showStashes: load.showStashes,
      showTags: load.showTags,
      includeTagOnly: load.includeTagOnly,
      reflog: load.reflog,
      includeHead: load.includeHead,
      path: load.path,
      follow: load.follow,
      order: load.order,
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

  private async reload(opts?: { fromWatch?: boolean; recordExternal?: boolean }): Promise<void> {
    if (this.disposed) return;
    const gen = ++this.reloadGen;
    this.loadGen++;
    this.quietUntil = Date.now() + 1500;
    if (!opts?.fromWatch) this.post({ type: 'patch', payload: { loading: true } });
    try {
      const payload = await this.snapshot();
      if (this.disposed || gen !== this.reloadGen) return;
      const fp = snapshotFingerprint(payload);
      if (opts?.fromWatch && fp === this.lastFingerprint) return;
      this.lastFingerprint = fp;
      this.post({ type: 'snapshot', payload });
      if (opts?.recordExternal === false) await this.rememberCheckpoint();
      else await this.noteExternalCommit();
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

  private enqueueLoad(task: () => Promise<void>): Promise<void> {
    this.loadChain = this.loadChain.then(task, task);
    return this.loadChain;
  }

  private async loadMore(): Promise<void> {
    const gen = this.loadGen;
    const n = cfg('repository.commits.loadMore', 100);
    this.skip += cfg('repository.commits.initialLoad', 300);
    const skip = this.commits.filter((c) => c.hash !== UNCOMMITTED).length;
    const extra = await loadCommits(this.commitLoad(n, skip));
    if (this.disposed || gen !== this.loadGen) return;
    this.commits = [...this.commits, ...extra.commits];
    this.hasMore = extra.hasMore;
    this.post({ type: 'more', commits: extra.commits, hasMore: extra.hasMore });
  }

  private async loadUntil(hash: string, index: number): Promise<void> {
    if (this.commits.some((commit) => commit.hash === hash)) return;
    const gen = this.loadGen;
    const before = this.commits.length;
    const loaded = () => this.commits.filter((commit) => commit.hash !== UNCOMMITTED).length;
    const cap = 50_000;
    if (index >= 0) {
      const need = index + 1 - loaded();
      if (need <= 0) return;
      const extra = await loadCommits(this.commitLoad(need, loaded()));
      if (this.disposed || gen !== this.loadGen) return;
      this.commits = [...this.commits, ...extra.commits];
      this.hasMore = extra.hasMore;
    } else {
      while (loaded() < cap && !this.commits.some((commit) => commit.hash === hash)) {
        const extra = await loadCommits(this.commitLoad(500, loaded()));
        if (this.disposed || gen !== this.loadGen) return;
        if (!extra.commits.length) {
          this.hasMore = false;
          break;
        }
        this.commits = [...this.commits, ...extra.commits];
        this.hasMore = extra.hasMore;
        if (!extra.hasMore) break;
      }
    }
    if (this.disposed || gen !== this.loadGen) return;
    const added = this.commits.slice(before);
    if (added.length) this.post({ type: 'more', commits: added, hasMore: this.hasMore });
  }

  private async answerFind(msg: Extract<ViewToHost, { type: 'findCommits' }>): Promise<void> {
    const requestId = msg.requestId;
    const gen = ++this.findGen;
    try {
      if (msg.regex && msg.pattern && !compileFindRegex(msg.pattern, msg.ignoreCase)) {
        this.post({ type: 'findHits', requestId, hashes: [], indexes: [], truncated: false, error: 'Invalid regular expression' });
        return;
      }
      const revisions = this.revisionOptions();
      const found = msg.diff
        ? indexFindHashes(
            await hashIndex(this.git(), this.repoPath, revisions),
            await findDiffHashes(this.git(), this.repoPath, msg.pattern, { ignoreCase: msg.ignoreCase, regex: msg.regex, maxCount: 5000 }, revisions),
          )
        : await findCommitHashes(this.git(), this.repoPath, msg.pattern, { ignoreCase: msg.ignoreCase, regex: msg.regex }, revisions, this.visibleRefs);
      if (this.disposed || gen !== this.findGen) return;
      this.post({ type: 'findHits', requestId, ...found });
    } catch (e) {
      if (this.disposed || gen !== this.findGen) return;
      this.post({
        type: 'findHits',
        requestId,
        hashes: [],
        indexes: [],
        truncated: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async openBlame(filePath: string): Promise<void> {
    const text = await gitOk(this.git(), this.repoPath, ['blame', '-w', '--', filePath]);
    const doc = await vscode.workspace.openTextDocument({ content: text, language: 'plaintext' });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: viewColumn() });
  }

  private async sendDetails(hash: string, compare?: string): Promise<void> {
    const encoding = vscode.workspace.getConfiguration('git-graph-ray', vscode.Uri.file(this.repoPath)).get('fileEncoding', 'utf8');
    const details = await loadDetails(this.git(), this.repoPath, hash, compare, encoding);
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

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.opChain.then(task, task);
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private forgetRemoteTags(action: GitAction, remotes = remoteTagTargets(action)): void {
    if (!this.repoPath || !remotes.length) return;
    invalidateRemoteTagCache(this.repoPath, remotes);
  }

  private async run(action: GitAction, opts?: { quiet?: boolean }): Promise<void> {
    this.acting++;
    const quiet = opts?.quiet === true;
    const policy = undoPolicy(action);
    this.quietUntil = Date.now() + (quiet ? 1_500 : 60_000);
    this.post(quiet ? { type: 'busy', on: true, fetch: true, quiet: true } : { type: 'busy', on: true, fetch: action.kind === 'fetchRemote' });
    let report: string | undefined;
    let before: LocalCheckpoint | null = null;
    try {
      if (policy.record && this.repoPath) {
        try {
          before = await captureCheckpoint(this.git(), this.repoPath);
        } catch {
          before = null;
        }
      }
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
      const result = await runGitAction(this.git(), this.repoPath, action, {
        signCommits: cfg('repository.sign.commits', false),
        signTags: cfg('repository.sign.tags', false),
        shellPath: cfg('integratedTerminalShell', '') || undefined,
      });
      if (result) report = result;
      this.forgetRemoteTags(action);
      await this.reload({ recordExternal: false });
      if (before) {
        try {
          await this.recordUndo(action, before, policy.warning);
        } catch {
          /* the git action succeeded; skip history if the after-snapshot fails */
        }
      }
    } catch (error) {
      if (error instanceof TagPushError) {
        this.forgetRemoteTags(action, error.pushedRemotes);
        try {
          await this.reload({ recordExternal: false });
          if (before) await this.recordUndo(action, before, error.pushed ? policy.warning : null);
        } catch {
          /* the local tag exists; still surface the push error */
        }
      } else if (error instanceof PartialRemotePushError) {
        this.forgetRemoteTags(action, error.pushedRemotes);
        try {
          await this.reload({ recordExternal: false });
        } catch {
          /* still surface the push error */
        }
      } else {
        try {
          await this.reload({ recordExternal: false });
        } catch {
          /* keep the original git error */
        }
      }
      throw error;
    } finally {
      this.acting = Math.max(0, this.acting - 1);
      this.post(quiet ? { type: 'busy', on: false, quiet: true } : { type: 'busy', on: false });
      this.postUndoState();
      if (report) this.post({ type: 'rebaseReport', html: report });
    }
  }

  private stack(): UndoStack {
    let stack = this.undoStacks.get(this.repoPath);
    if (!stack) {
      stack = { undo: [], redo: [] };
      this.undoStacks.set(this.repoPath, stack);
    }
    return stack;
  }

  private postUndoState(): void {
    const stack = this.stack();
    const undoLabels = stack.undo.map((entry) => entry.label).reverse();
    const redoLabels = stack.redo.map((entry) => entry.label).reverse();
    this.post({
      type: 'undoState',
      canUndo: undoLabels.length > 0,
      canRedo: redoLabels.length > 0,
      undoLabel: undoLabels[0] ?? null,
      redoLabel: redoLabels[0] ?? null,
      undoLabels,
      redoLabels,
    });
  }

  private clearUndo(): void {
    const stack = this.stack();
    stack.undo = [];
    stack.redo = [];
    this.postUndoState();
  }

  private async recordUndo(action: GitAction, before: LocalCheckpoint, actionWarning: string | null): Promise<void> {
    const after = await captureCheckpoint(this.git(), this.repoPath);
    if (checkpointsEqual(before, after)) return;
    pushUndo(this.stack(), { label: undoLabel(action), actionWarning, before, after });
  }

  private async presentUndo(direction: 'undo' | 'redo', steps: number): Promise<void> {
    this.post({ type: 'busy', on: true });
    try {
      const prepared = await this.prepareUndo(direction, steps);
      if (!prepared) return;
      const preview = this.viewConfig().undoPreview;
      if (!needsUndoDialog(prepared.plan, preview)) {
        await this.restorePrepared(direction, prepared.entries, prepared.plan.args);
        return;
      }
      let before: GraphSnapshot['commits'] = [];
      let after: GraphSnapshot['commits'] = [];
      if (preview) {
        [before, after] = await Promise.all([
          this.previewGraph(prepared.from).catch(() => []),
          this.previewGraph(prepared.to).catch(() => []),
        ]);
        const slice = previewWindow(before, after, { branch: prepared.from.branch, hash: prepared.from.headHash });
        before = slice.before;
        after = slice.after;
      }
      this.post({
        type: 'undoPreview',
        direction,
        label: rangeLabel(prepared.entries),
        warning: prepared.plan.warning,
        showGraphs: preview,
        before,
        after,
        beforeHead: prepared.from.headHash,
        afterHead: prepared.to.headHash,
        headBranch: prepared.from.branch,
        steps: prepared.entries.length,
        changes: prepared.plan.changes,
        commands: prepared.plan.commands,
      });
    } finally {
      this.post({ type: 'busy', on: false });
    }
  }

  private async applyUndo(direction: 'undo' | 'redo', steps: number): Promise<void> {
    this.post({ type: 'busy', on: true });
    try {
      const prepared = await this.prepareUndo(direction, steps);
      if (!prepared) return;
      await this.restorePrepared(direction, prepared.entries, prepared.plan.args);
    } finally {
      this.post({ type: 'busy', on: false });
      this.postUndoState();
    }
  }

  private async prepareUndo(
    direction: 'undo' | 'redo',
    steps: number,
  ): Promise<{ entries: UndoEntry[]; from: LocalCheckpoint; to: LocalCheckpoint; plan: ReturnType<typeof planRestore> } | null> {
    const list = direction === 'undo' ? this.stack().undo : this.stack().redo;
    if (!Number.isInteger(steps) || steps < 1 || steps > list.length) {
      this.postUndoState();
      return null;
    }
    const range = historyRange(list, direction, steps);
    if (!range) {
      this.clearUndo();
      throw new Error('The repository changed since this operation, so the undo history was discarded.');
    }
    const live = await captureCheckpoint(this.git(), this.repoPath);
    if (!checkpointsEqual(live, range.from)) {
      this.clearUndo();
      throw new Error('The repository changed since this operation, so the undo history was discarded.');
    }
    const [dirty, remotes] = await Promise.all([
      workingTreeHasTrackedChanges(this.git(), this.repoPath),
      captureRemoteTips(this.git(), this.repoPath),
    ]);
    return {
      entries: range.entries,
      from: range.from,
      to: range.to,
      plan: planRestore({
        current: live,
        target: range.to,
        remotes,
        dirty,
        actionWarning: rangeWarning(range.entries),
        tipReset: rangeTipReset(range.entries),
      }),
    };
  }

  private async restorePrepared(direction: 'undo' | 'redo', entries: UndoEntry[], args: string[][]): Promise<void> {
    if (!args.length) return;
    this.quietUntil = Date.now() + 60_000;
    try {
      await applyRestorePlan(this.git(), this.repoPath, args);
      const list = direction === 'undo' ? this.stack().undo : this.stack().redo;
      const top = list.slice(-entries.length);
      if (top.length === entries.length && top.every((entry, index) => entry === entries[index])) {
        moveUndoSteps(this.stack(), direction, entries.length);
      }
      await this.reload({ recordExternal: false });
    } finally {
      this.postUndoState();
    }
  }

  private async previewGraph(checkpoint: LocalCheckpoint): Promise<GraphSnapshot['commits']> {
    const config = this.viewConfig();
    const loaded = await loadRefs(this.git(), this.repoPath, true).catch(() => ({ refs: [] as GraphRef[] }));
    return loadCheckpointCommits(
      this.git(),
      this.repoPath,
      checkpoint,
      loaded.refs.filter((ref) => ref.kind === 'remote'),
      {
        maxCount: cfg('repository.commits.initialLoad', 300),
        order: config.commitOrder,
        mailmap: cfg('repository.useMailmap', false),
        firstParent: false,
      },
    );
  }

  private async rememberCheckpoint(): Promise<void> {
    if (!this.repoPath) return;
    try {
      this.lastCheckpoints.set(this.repoPath, await captureCheckpoint(this.git(), this.repoPath));
    } catch {
      this.lastCheckpoints.delete(this.repoPath);
    }
  }

  private async noteExternalCommit(): Promise<void> {
    if (!this.repoPath) return;
    const prev = this.lastCheckpoints.get(this.repoPath) ?? null;
    let next: LocalCheckpoint;
    try {
      next = await captureCheckpoint(this.git(), this.repoPath);
    } catch {
      return;
    }
    this.lastCheckpoints.set(this.repoPath, next);
    if (!prev || checkpointsEqual(prev, next)) return;
    const detected = externalCommitChange({
      prev,
      next,
      parentOfNext: await this.commitParent(next.headHash),
      parentOfPrev: await this.commitParent(prev.headHash),
      subject: await this.commitSubject(next.headHash),
    });
    if (!detected) return;
    pushUndo(this.stack(), {
      label: detected.label,
      actionWarning: null,
      before: prev,
      after: next,
      tipReset: detected.tipReset,
    });
    this.postUndoState();
  }

  private async commitParent(hash: string | null): Promise<string | null> {
    if (!hash) return null;
    try {
      const parent = (await gitOk(this.git(), this.repoPath, ['rev-parse', '--verify', `${hash}^`])).trim();
      return parent || null;
    } catch {
      return null;
    }
  }

  private async commitSubject(hash: string | null): Promise<string> {
    if (!hash) return '';
    try {
      return (await gitOk(this.git(), this.repoPath, ['log', '-1', '--format=%s', hash])).trim();
    } catch {
      return '';
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
    clearInterval(this.autoFetchTimer);
    this.autoFetchTimer = undefined;
    this.configSub?.dispose();
    this.configSub = undefined;
    this.watcher?.dispose();
    this.watcher = undefined;
  }

  private armAutoFetch(): void {
    clearInterval(this.autoFetchTimer);
    this.autoFetchTimer = undefined;
    if (this.disposed || !cfg('repository.autoFetch', false)) return;
    const seconds = autoFetchIntervalSeconds();
    this.autoFetchTimer = setInterval(() => {
      if (this.disposed || this.acting) return;
      void this.enqueue(() =>
        this.run(
          {
            kind: 'fetchRemote',
            prune: cfg('repository.fetchAndPrune', false),
            pruneTags: cfg('repository.fetchAndPruneTags', false),
          },
          { quiet: true },
        ),
      );
    }, seconds * 1000);
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

function remoteTagCacheMs(): number {
  const seconds = cfg<number>('repository.remoteTags.cacheSeconds', 300);
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds * 1000;
}

function remoteTagTargets(action: GitAction): string[] {
  if (action.kind === 'addTag') return action.pushTo?.filter(Boolean) ?? [];
  if (action.kind === 'pushTag') return action.remotes.filter(Boolean);
  if (action.kind === 'deleteTag' && action.deleteOnRemote) return [action.deleteOnRemote];
  return [];
}
