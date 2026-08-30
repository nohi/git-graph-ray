import { describe, expect, it } from 'vitest';
import { layoutCommits } from './layout';
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

  it('keeps a second-parent lane through intervening commits', () => {
    const layout = layoutCommits([c('m', ['a', 'b']), c('a', ['c']), c('b', ['c']), c('c', [])]);
    expect(layout.vertices.map((v) => v.lane)).toEqual([0, 0, 1, 0]);
    expect(layout.edges.some((e) => e.fromRow === 1 && e.fromLane === 1 && e.toLane === 1 && e.toRow === 2)).toBe(true);
  });

  it('merges extra lanes that were waiting for the same commit', () => {
    const layout = layoutCommits([c('p', ['z']), c('q', ['z']), c('z', [])]);
    expect(layout.vertices.map((v) => v.lane)).toEqual([0, 1, 0]);
    expect(layout.edges.some((e) => e.fromRow === 1 && e.toRow === 2 && e.fromLane === 1 && e.toLane === 0)).toBe(true);
    expect(layout.edges.some((e) => e.fromRow === e.toRow)).toBe(false);
  });
});
