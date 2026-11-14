import { describe, expect, it } from 'vitest';
import {
  LEGACY_ACTION_RULES,
  LEGACY_SETTING_RULES,
  legacyShortcut,
  planLegacyMigration,
  runLegacyMigration,
  type LayerValues,
  type SettingLayer,
  type SettingWrite,
} from './legacySettings';

function reader(values: Record<string, LayerValues>): (key: string) => LayerValues {
  return (key) => values[key] ?? {};
}

describe('planLegacyMigration', () => {
  it('copies old values to the new keys with renamed enum values', () => {
    const read = reader({
      'repository.commits.initialLoad': { global: 500 },
      'graph.style': { global: 'angular' },
      'date.format': { global: 'ISO Date Only' },
      'repository.commits.order': { global: 'author-date' },
      'referenceLabels.alignment': { global: 'Branches (aligned to the graph) & Tags (on the right)' },
      'keyboardShortcut.find': { global: 'CTRL/CMD + G' },
      'keyboardShortcut.refresh': { global: 'UNASSIGNED' },
    });
    expect(planLegacyMigration(read, 'global')).toEqual([
      { key: 'when.format', value: 'isoDate', layer: 'global' },
      { key: 'graph.bend', value: 'corner', layer: 'global' },
      { key: 'keys.find', value: 'mod+g', layer: 'global' },
      { key: 'keys.refresh', value: '', layer: 'global' },
      { key: 'labels.layout', value: 'split', layer: 'global' },
      { key: 'history.pageSize', value: 500, layer: 'global' },
      { key: 'history.order', value: 'author', layer: 'global' },
    ]);
  });

  it('renames fields inside list settings', () => {
    const read = reader({
      customPullRequestProviders: { global: [{ name: 'Forge', templateUrl: 'https://forge/$1' }] },
      customBranchGlobPatterns: { global: [{ name: 'Features', glob: 'feature/*' }, { name: 'broken' }] },
      customEmojiShortcodeMappings: { global: [{ shortcode: ':ok:', emoji: '👍' }] },
    });
    expect(planLegacyMigration(read, 'global')).toEqual([
      { key: 'branches.globs', value: [{ name: 'Features', pattern: 'feature/*' }], layer: 'global' },
      { key: 'emoji', value: [{ code: ':ok:', emoji: '👍' }], layer: 'global' },
      { key: 'pullRequests', value: [{ name: 'Forge', url: 'https://forge/$1' }], layer: 'global' },
    ]);
  });

  it('gathers dialog defaults into one actions object', () => {
    const read = reader({
      'dialog.addTag.type': { workspace: 'Lightweight' },
      'dialog.merge.squashMessageFormat': { workspace: 'Git SQUASH_MSG' },
      'dialog.resetCurrentBranchToCommit.mode': { workspace: 'Hard' },
      'dialog.general.referenceInputSpaceSubstitution': { workspace: 'Hyphen' },
      'dialog.merge.noFastForward': { global: false },
    });
    expect(planLegacyMigration(read, 'workspace')).toEqual([
      {
        key: 'actions',
        value: { tagAnnotated: false, nameSpaces: 'hyphen', mergeSquashMessage: 'file', resetMode: 'hard' },
        layer: 'workspace',
      },
    ]);
  });

  it('keeps a new key that already has a value in the same layer', () => {
    const read = reader({
      'repository.showTags': { global: false, workspace: false },
      'history.tags': { global: true },
      'dialog.rebase.ignoreDate': { global: true },
      actions: { global: { rebaseIgnoreDate: false } },
    });
    expect(planLegacyMigration(read, 'global')).toEqual([]);
    expect(planLegacyMigration(read, 'workspace')).toEqual([{ key: 'history.tags', value: false, layer: 'workspace' }]);
  });

  it('falls back to the dialog fetch defaults when the repository keys are unset', () => {
    const read = reader({
      'dialog.fetchRemote.prune': { global: true },
      'dialog.fetchRemote.pruneTags': { global: true },
    });
    expect(planLegacyMigration(read, 'global')).toEqual([
      { key: 'fetch.prune', value: true, layer: 'global' },
      { key: 'fetch.pruneTags', value: true, layer: 'global' },
    ]);
  });

  it('prefers the repository fetch keys over the dialog fetch defaults', () => {
    const read = reader({
      'repository.fetchAndPrune': { global: false },
      'dialog.fetchRemote.prune': { global: true },
      'repository.fetchAndPruneTags': { workspace: true },
      'dialog.fetchRemote.pruneTags': { workspace: false },
    });
    expect(planLegacyMigration(read, 'global')).toEqual([{ key: 'fetch.prune', value: false, layer: 'global' }]);
    expect(planLegacyMigration(read, 'workspace')).toEqual([{ key: 'fetch.pruneTags', value: true, layer: 'workspace' }]);
  });

  it('fills missing actions fields without touching fields that already have a value', () => {
    const read = reader({
      actions: { global: { rebaseIgnoreDate: true } },
      'dialog.rebase.ignoreDate': { global: false },
      'dialog.merge.noFastForward': { global: false },
    });
    expect(planLegacyMigration(read, 'global')).toEqual([
      { key: 'actions', value: { rebaseIgnoreDate: true, mergeNoFastForward: false }, layer: 'global' },
    ]);
  });

  it('skips values that do not fit the new setting', () => {
    const read = reader({
      'graph.style': { global: 'wavy' },
      'repository.commits.initialLoad': { global: '300' },
      'keyboardShortcut.find': { global: 'ALT + F' },
      'repository.onLoad.showSpecificBranches': { global: ['main', 42] },
    });
    expect(planLegacyMigration(read, 'global')).toEqual([]);
  });
});

describe('legacyShortcut', () => {
  it('maps the old dropdown values', () => {
    expect(legacyShortcut('CTRL/CMD + F')).toBe('mod+f');
    expect(legacyShortcut('UNASSIGNED')).toBe('');
    expect(legacyShortcut('mod+f')).toBeUndefined();
  });
});

describe('legacy rules', () => {
  it('point at distinct old keys', () => {
    const from = [...LEGACY_SETTING_RULES, ...LEGACY_ACTION_RULES].map(([key]) => key);
    expect(new Set(from).size).toBe(from.length);
  });
});

function fakeHost(values: Record<string, LayerValues>, opts: { done?: SettingLayer[]; fail?: string } = {}) {
  const done = new Set<SettingLayer>(opts.done ?? []);
  const writes: SettingWrite[] = [];
  return {
    writes,
    done,
    host: {
      read: reader(values),
      write: async (change: SettingWrite) => {
        if (change.key === opts.fail) throw new Error('not a registered configuration');
        writes.push(change);
      },
      done: (layer: SettingLayer) => done.has(layer),
      markDone: async (layer: SettingLayer) => {
        done.add(layer);
      },
      layers: ['global', 'workspace'] as SettingLayer[],
    },
  };
}

describe('runLegacyMigration', () => {
  it('migrates each layer once', async () => {
    const values = { 'repository.showStashes': { global: false, workspace: true } };
    const run = fakeHost(values);
    await runLegacyMigration(run.host);
    expect(run.writes).toEqual([
      { key: 'history.stashes', value: false, layer: 'global' },
      { key: 'history.stashes', value: true, layer: 'workspace' },
    ]);
    expect([...run.done]).toEqual(['global', 'workspace']);

    run.writes.length = 0;
    await runLegacyMigration(run.host);
    expect(run.writes).toEqual([]);
  });

  it('skips a layer that was already migrated', async () => {
    const run = fakeHost({ 'repository.showStashes': { global: false, workspace: true } }, { done: ['global'] });
    await runLegacyMigration(run.host);
    expect(run.writes).toEqual([{ key: 'history.stashes', value: true, layer: 'workspace' }]);
  });

  it('leaves a layer unmarked when a write fails so it is retried', async () => {
    const run = fakeHost(
      { 'repository.showStashes': { global: false }, 'repository.showTags': { global: false } },
      { fail: 'history.stashes' },
    );
    await runLegacyMigration(run.host);
    expect(run.writes).toEqual([{ key: 'history.tags', value: false, layer: 'global' }]);
    expect(run.done.has('global')).toBe(false);
    expect(run.done.has('workspace')).toBe(true);
  });
});
