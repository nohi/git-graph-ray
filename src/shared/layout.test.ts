import { describe, expect, it } from 'vitest';
import { foldBridgeEdges, historyLanes, layoutCommits } from './layout';
import type { GraphCommit } from './types';

function c(hash: string, parents: string[]): GraphCommit {
  return {
    hash,
    parents,
    authorName: '',
    authorEmail: '',
    authorDate: 0,
    committerName: '',
    committerEmail: '',
    committerDate: 0,
    subject: '',
    refs: [],
  };
}

describe('layoutCommits', () => {
  it('places a linear history on one lane', () => {
    const layout = layoutCommits([c('a', ['b']), c('b', [])]);
    expect(layout.maxLanes).toBe(1);
    expect(layout.vertices.map((v) => v.lane)).toEqual([0, 0]);
  });

  it('opens a lane for a second parent', () => {
    const layout = layoutCommits([c('m', ['a', 'b']), c('a', []), c('b', [])]);
    expect(layout.maxLanes).toBeGreaterThanOrEqual(2);
  });

  it('keeps a selected branch lit across commits that are not on it', () => {
    const commits = [c('feature', ['base']), c('side', ['base']), c('base', [])];
    const lanes = historyLanes(layoutCommits(commits), commits, new Set(['feature', 'base']));
    expect(lanes[0]?.[0]).toBe(true);
    expect(lanes[1]?.[0]).toBe(true);
    expect(lanes[1]?.[1]).toBeUndefined();
    expect(lanes[2]?.[0]).toBe(true);
  });

  it('keeps a second-parent lane through intervening commits', () => {
    const layout = layoutCommits([c('m', ['a', 'b']), c('a', ['c']), c('b', ['c']), c('c', [])]);
    expect(layout.vertices.map((v) => v.lane)).toEqual([0, 0, 1, 0]);
    expect(layout.edges.some((e) => e.fromRow === 1 && e.fromLane === 1 && e.toLane === 1 && e.toRow === 2)).toBe(true);
  });

  it('draws a straight lane across a hidden commit and drops a branch that ends there', () => {
    const linear = layoutCommits([c('a', ['b']), c('b', ['c']), c('c', [])]);
    expect(foldBridgeEdges(linear, 0, 2)).toEqual([{ fromLane: 0, toLane: 0, lane: 0, committed: true }]);

    const ended = layoutCommits([c('m', ['a', 'b']), c('a', ['c']), c('b', []), c('c', [])]);
    expect(foldBridgeEdges(ended, 0, 3)).toEqual([{ fromLane: 0, toLane: 0, lane: 0, committed: true }]);

    const passing = layoutCommits([c('m', ['a', 'b']), c('a', ['c']), c('b', ['c']), c('c', [])]);
    const side = foldBridgeEdges(passing, 0, 2);
    expect(side).toEqual([
      { fromLane: 0, toLane: 0, lane: 0, committed: true },
      { fromLane: 0, toLane: 1, lane: 1, committed: true },
    ]);
  });

  it('merges extra lanes that were waiting for the same commit', () => {
    const layout = layoutCommits([c('p', ['z']), c('q', ['z']), c('z', [])]);
    expect(layout.vertices.map((v) => v.lane)).toEqual([0, 1, 0]);
    expect(layout.edges.some((e) => e.fromRow === 1 && e.toRow === 2 && e.fromLane === 1 && e.toLane === 0)).toBe(true);
    expect(layout.edges.some((e) => e.fromRow === e.toRow)).toBe(false);
  });
});
