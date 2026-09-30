import { describe, expect, it } from 'vitest';
import { GRAPH_VIEW_TYPE, isGraphWebviewTab, isGraphWebviewViewType } from './graphTab';

class TabInputWebview {
  constructor(readonly viewType: string) {}
}

describe('isGraphWebviewViewType', () => {
  it('matches the registered id and the editor-tab id', () => {
    expect(isGraphWebviewViewType(GRAPH_VIEW_TYPE)).toBe(true);
    expect(isGraphWebviewViewType(`mainThreadWebview-${GRAPH_VIEW_TYPE}`)).toBe(true);
  });

  it('ignores other webviews', () => {
    expect(isGraphWebviewViewType('mainThreadWebview-markdown.preview')).toBe(false);
    expect(isGraphWebviewViewType('markdown.preview')).toBe(false);
    expect(isGraphWebviewViewType('')).toBe(false);
  });
});

describe('isGraphWebviewTab', () => {
  it('recognises a restored graph webview tab', () => {
    expect(isGraphWebviewTab({ viewType: `mainThreadWebview-${GRAPH_VIEW_TYPE}` })).toBe(true);
    expect(isGraphWebviewTab({ viewType: GRAPH_VIEW_TYPE })).toBe(true);
    expect(isGraphWebviewTab(new TabInputWebview(`mainThreadWebview-${GRAPH_VIEW_TYPE}`))).toBe(true);
  });

  it('ignores custom editors and other webviews', () => {
    expect(isGraphWebviewTab({ viewType: GRAPH_VIEW_TYPE, uri: { fsPath: 'C:/repo' } })).toBe(false);
    expect(isGraphWebviewTab({ viewType: 'mainThreadWebview-markdown.preview' })).toBe(false);
    expect(isGraphWebviewTab({ notebookType: 'jupyter', uri: {} })).toBe(false);
    expect(isGraphWebviewTab(undefined)).toBe(false);
  });
});
