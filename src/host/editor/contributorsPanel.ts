import * as path from 'node:path';
import * as vscode from 'vscode';
import { activityRange, normalizeActivityPeriod, type ActivityPeriod, type ContributorsToHost, type HostToContributors } from '../../shared/contributors';
import { cfg, viewColumn } from '../config';
import { loadContributors } from '../git/contributors';
import { gitOk } from '../git/runner';
import { norm } from '../repos/discover';
import { contributorsHtml } from './contributorsHtml';
import { nonce } from './html';

const NO_REPO = 'Open a folder with a Git repository to view contributors.';

export class ContributorsPanel implements vscode.WebviewPanelSerializer {
  static readonly viewType = 'git-graph-ray.contributors';
  private panel: vscode.WebviewPanel | undefined;
  private repoPath = '';
  private period: ActivityPeriod = { kind: 'all' };
  private loadGen = 0;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly git: () => string,
  ) {}

  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
    const fromState =
      typeof state === 'object' && state && 'repo' in state && typeof (state as { repo: unknown }).repo === 'string'
        ? (state as { repo: string }).repo
        : '';
    const repo = fromState ? norm(fromState) : await resolveOpenRepo(this.git());
    if (!repo) {
      panel.dispose();
      void vscode.window.showInformationMessage(NO_REPO);
      return;
    }
    this.bind(panel, repo);
  }

  async open(explicit?: string): Promise<void> {
    const repo = explicit ? norm(explicit) : await resolveOpenRepo(this.git());
    if (!repo) {
      void vscode.window.showInformationMessage(NO_REPO);
      return;
    }
    if (this.panel) {
      this.repoPath = repo;
      this.panel.reveal(this.panel.viewColumn);
      await this.load();
      return;
    }
    const panel = vscode.window.createWebviewPanel(ContributorsPanel.viewType, 'Contributors', viewColumn(), {
      enableScripts: true,
      retainContextWhenHidden: cfg('retainContextWhenHidden', true),
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'dist'), vscode.Uri.joinPath(this.ctx.extensionUri, 'resources')],
    });
    this.bind(panel, repo);
  }

  private bind(panel: vscode.WebviewPanel, repo: string): void {
    if (this.panel && this.panel !== panel) this.panel.dispose();
    this.panel = panel;
    this.repoPath = repo;
    panel.title = 'Contributors';
    panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'resources/icon.png');
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'dist'), vscode.Uri.joinPath(this.ctx.extensionUri, 'resources')],
    };
    const n = nonce();
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'dist/webview/webview.js'));
    const css = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'dist/webview/style.css'));
    panel.webview.html = contributorsHtml(panel.webview.cspSource, String(script), String(css), n, repo);
    panel.webview.onDidReceiveMessage((message: ContributorsToHost) => void this.onMessage(message));
    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = undefined;
    });
  }

  private async onMessage(message: ContributorsToHost): Promise<void> {
    if (message.type === 'ready') {
      if (message.period) this.period = normalizeActivityPeriod(message.period);
      await this.load();
      return;
    }
    if (message.type === 'setPeriod') this.period = normalizeActivityPeriod(message.period);
    if (message.type === 'reload' || message.type === 'setPeriod') await this.load();
  }

  private async load(): Promise<void> {
    const panel = this.panel;
    const repo = this.repoPath;
    if (!panel || !repo) return;
    const gen = ++this.loadGen;
    this.post({ type: 'busy', on: true, repoPath: repo, repoName: path.basename(repo) });
    try {
      const stats = await loadContributors(this.git(), repo, cfg('repository.useMailmap', false), activityRange(this.period));
      if (gen !== this.loadGen || this.panel !== panel || this.repoPath !== repo) return;
      this.post({
        type: 'report',
        payload: { repoPath: repo, repoName: path.basename(repo), authors: stats.authors, committers: stats.committers },
      });
    } catch (error) {
      if (gen !== this.loadGen || this.panel !== panel) return;
      this.post({ type: 'fail', message: error instanceof Error ? error.message : String(error) });
    }
  }

  private post(message: HostToContributors): void {
    void this.panel?.webview.postMessage(message);
  }
}

async function resolveOpenRepo(git: string): Promise<string> {
  let repo = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  if (cfg('openToTheRepoOfTheActiveTextEditorDocument', false)) {
    const doc = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (doc) {
      try {
        repo = (await gitOk(git, path.dirname(doc), ['rev-parse', '--show-toplevel'])).trim();
      } catch {
        /* keep the workspace folder */
      }
    }
  }
  return repo ? norm(repo) : '';
}
