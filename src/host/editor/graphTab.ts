export const GRAPH_VIEW_TYPE = 'git-graph-ray.graph';

/**
 * Editor tabs report webview panels as `mainThreadWebview-<viewType>`.
 * {@link vscode.WebviewPanel.viewType} stays the unprefixed id.
 */
export function isGraphWebviewViewType(viewType: string): boolean {
  return viewType === GRAPH_VIEW_TYPE || viewType === `mainThreadWebview-${GRAPH_VIEW_TYPE}`;
}

export function isGraphWebviewTab(input: unknown): boolean {
  const viewType = webviewTabViewType(input);
  return viewType != null && isGraphWebviewViewType(viewType);
}

function webviewTabViewType(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  if ('uri' in input || 'notebookType' in input || 'original' in input) return undefined;
  if (!('viewType' in input)) return undefined;
  const viewType = (input as { viewType: unknown }).viewType;
  return typeof viewType === 'string' ? viewType : undefined;
}
