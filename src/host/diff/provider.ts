import * as vscode from 'vscode';
import { diffDocumentPath } from '../../shared/diffSides';
import { showFile } from '../git/details';

export class DiffFiles implements vscode.TextDocumentContentProvider {
  constructor(
    private readonly git: () => string,
    private readonly encoding: (uri: vscode.Uri) => string,
  ) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const q = new URLSearchParams(uri.query);
    const root = q.get('root') ?? '';
    const spec = q.get('spec') ?? '';
    return showFile(this.git(), root, spec, this.encoding(uri));
  }
}

export function diffUri(root: string, spec: string, filePath: string, revLabel: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: 'git-graph-ray-file',
    path: diffDocumentPath(revLabel, filePath),
    query: `root=${encodeURIComponent(root)}&spec=${encodeURIComponent(spec)}`,
  });
}
