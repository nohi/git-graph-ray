import { describe, expect, it } from 'vitest';
import type { ViewConfig } from './types';
import { atLeastOne, graphSettingReloads, graphSettingRepaints } from './graphRefresh';
import { applyRepoVisibility, dropDefaultVisibility, visibilityChanged } from './repoVisibility';
import { settingWriteScope } from './settingScope';
import { defaultRepoSettings } from './dialogs';

function base(over: Partial<ViewConfig> = {}): ViewConfig {
  return {
    showRemoteBranches: true,
    showStashes: true,
    showTags: true,
    showWorktrees: true,
    includeCommitsMentionedByReflogs: false,
    onlyFollowFirstParent: false,
    ...over,
  } as ViewConfig;
}

describe('settingWriteScope', () => {
  it('writes the workspace when that layer is set', () => {
    expect(settingWriteScope(true)).toBe('workspace');
    expect(settingWriteScope(false)).toBe('workspace');
    expect(settingWriteScope(undefined)).toBe('user');
  });
});

describe('repo visibility', () => {
  it('drops a repository value that matches history', () => {
    const config = base();
    const stored = { ...defaultRepoSettings(), showRemotes: true, showTags: false, hideRemotes: ['origin'] };
    const cleaned = dropDefaultVisibility(stored, config);
    expect(cleaned.showRemotes).toBeUndefined();
    expect(cleaned.showTags).toBe(false);
    expect(cleaned.hideRemotes).toEqual(['origin']);
    expect(visibilityChanged(stored, cleaned)).toBe(true);
  });

  it('overlays only a boolean that differs', () => {
    const config = base();
    applyRepoVisibility(config, { ...defaultRepoSettings(), showStashes: false, showReflogs: true });
    expect(config.showStashes).toBe(false);
    expect(config.includeCommitsMentionedByReflogs).toBe(true);
    expect(config.showTags).toBe(true);
  });
});

describe('graph setting refresh', () => {
  it('reloads load settings and repaints appearance', () => {
    const changed = new Set(['git-graph-ray.history.pageSize', 'git-graph-ray.when.format']);
    const affects = (key: string) => changed.has(key);
    expect(graphSettingReloads(affects)).toBe(true);
    expect(graphSettingRepaints(affects)).toBe(true);
    expect(graphSettingReloads(() => false)).toBe(false);
    expect(graphSettingRepaints((key) => key === 'git-graph-ray.startup.statusBar')).toBe(false);
    expect(graphSettingReloads((key) => key === 'git-graph-ray.startup.keepWebview')).toBe(false);
  });
});

describe('atLeastOne', () => {
  it('raises zero and unusable numbers to 1, and keeps the fallback otherwise', () => {
    expect(atLeastOne(0, 300)).toBe(1);
    expect(atLeastOne(-4, 300)).toBe(1);
    expect(atLeastOne(1.2, 300)).toBe(1);
    expect(atLeastOne(100.6, 300)).toBe(101);
    expect(atLeastOne(Number.NaN, 300)).toBe(300);
    expect(atLeastOne('0', 100)).toBe(100);
  });
});
