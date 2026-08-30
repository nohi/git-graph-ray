import * as vscode from 'vscode';

const KEY = 'ggr.pinned';
export const GRAPH_VIEW_TYPE = 'git-graph-ray.graph';

export function loadPinned(ctx: vscode.ExtensionContext): string[] {
  return ctx.workspaceState.get<string[]>(KEY, []);
}

export async function savePinned(ctx: vscode.ExtensionContext, paths: string[]): Promise<void> {
  await ctx.workspaceState.update(KEY, paths);
}
