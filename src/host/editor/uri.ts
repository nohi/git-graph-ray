import * as vscode from 'vscode';
export { GRAPH_VIEW_TYPE } from './graphTab';

const KEY = 'ggr.pinned';

export function loadPinned(ctx: vscode.ExtensionContext): string[] {
  return ctx.workspaceState.get<string[]>(KEY, []);
}

export async function savePinned(ctx: vscode.ExtensionContext, paths: string[]): Promise<void> {
  await ctx.workspaceState.update(KEY, paths);
}
