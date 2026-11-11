import type { ViewToHost } from '../shared/protocol';

export const vscode = acquireVsCodeApi();

export const post = (m: ViewToHost) => vscode.postMessage(m);

export type WebviewState = {
  repo?: string;
  signatureOpen?: boolean;
  columns?: Record<string, number>;
  dateAuthor?: string[];
  dateCommitter?: string[];
  authorNames?: string[];
  committerNames?: string[];
  selected?: string;
  refsPopoverWidth?: number;
  refsPopoverHeight?: number;
};

export function webviewState(): WebviewState {
  const raw = vscode.getState();
  if (!raw || typeof raw !== 'object') return {};
  return raw as WebviewState;
}
