import { describe, expect, it } from 'vitest';
import { compareLanePriority, foldBridgeEdges, historyEdgeHot, historyLanes, lanePriorityToSetting, layoutCommits, parseLanePriority, removeLanePriority, upsertLanePriority } from './layout';
import type { GraphCommit, GraphRef, LanePriorityRule } from './types';

function ref(kind: GraphRef['kind'], name: string, hash = name): GraphRef {
  const remote = kind === 'remote' ? name.slice(0, name.indexOf('/')) : undefined;
  return { kind, name, hash, remote: remote || undefined };
}

function c(hash: string, parents: string[], refs: GraphRef[] = []): GraphCommit {
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
    refs,
  };
}

const lanesOf = (commits: GraphCommit[], rules?: LanePriorityRule[]) =>
  layoutCommits(commits, rules).vertices.map((vertex) => vertex.lane);

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
    const layout = layoutCommits(commits);
    const lanes = historyLanes(layout, commits, new Set(['feature', 'base']));
    expect(lanes[0]?.[0]).toBe(true);
    expect(lanes[1]?.[0]).toBe(true);
    expect(lanes[1]?.[1]).toBeUndefined();
    expect(lanes[2]?.[0]).toBe(true);
    const sideLane = layout.vertices[1]!.lane;
    const join = layout.edges.find((edge) => edge.fromRow === 1 && edge.fromLane === sideLane);
    expect(historyEdgeHot(lanes, join!.fromRow, join!.fromLane)).toBe(false);
    expect(lanes[join!.toRow]?.[join!.toLane]).toBe(true);
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

describe('parseLanePriority', () => {
  it('keeps finite numbers and drops everything else', () => {
    expect(parseLanePriority({ ' main ': 99, 'release*': 50, skip: '9', empty: Number.NaN, big: Number.POSITIVE_INFINITY })).toEqual([
      { pattern: 'main', priority: 99 },
      { pattern: 'release*', priority: 50 },
    ]);
    expect(parseLanePriority(null)).toEqual([]);
    expect(parseLanePriority(['main'])).toEqual([]);
  });

  it('edits one pattern and writes the settings object', () => {
    const rules = parseLanePriority({ main: 99, 'release*': 50 });
    expect(upsertLanePriority(rules, 'release*', 40, 'release*')).toEqual([
      { pattern: 'main', priority: 99 },
      { pattern: 'release*', priority: 40 },
    ]);
    expect(upsertLanePriority(rules, 'master', 99)).toEqual([
      { pattern: 'main', priority: 99 },
      { pattern: 'release*', priority: 50 },
      { pattern: 'master', priority: 99 },
    ]);
    expect(upsertLanePriority(rules, 'master', 90, 'main')).toEqual([
      { pattern: 'release*', priority: 50 },
      { pattern: 'master', priority: 90 },
    ]);
    expect(upsertLanePriority(rules, '  ', 1)).toBeUndefined();
    expect(removeLanePriority(rules, 'main')).toEqual([{ pattern: 'release*', priority: 50 }]);
    expect(lanePriorityToSetting(rules)).toEqual({ main: 99, 'release*': 50 });
  });
});

describe('compareLanePriority', () => {
  it('orders by priority, then how high the line sits, then name', () => {
    const main = { priority: 99, row: 4, name: 'main' };
    const release = { priority: 50, row: 0, name: 'release/1' };
    expect(compareLanePriority(main, release)).toBeLessThan(0);
    expect(compareLanePriority({ priority: 50, row: 2, name: 'release/9' }, { priority: 50, row: 1, name: 'release/1' })).toBeGreaterThan(0);
    expect(compareLanePriority({ priority: 50, row: 1, name: 'release/1' }, { priority: 50, row: 1, name: 'release/2' })).toBeLessThan(0);
  });
});

describe('lane priority', () => {
  const rules: LanePriorityRule[] = [
    { pattern: 'main', priority: 99 },
    { pattern: 'release*', priority: 50 },
  ];

  it('keeps today\'s lanes when nothing matches', () => {
    const commits = [c('feature', ['base'], [ref('head', 'feature')]), c('main', ['base'], [ref('head', 'main')]), c('base', [])];
    expect(lanesOf(commits)).toEqual([0, 1, 0]);
    expect(lanesOf(commits, [])).toEqual([0, 1, 0]);
    expect(lanesOf(commits, [{ pattern: 'main', priority: 0 }])).toEqual([0, 1, 0]);
    expect(lanesOf(commits, [{ pattern: 'v*', priority: 99 }])).toEqual([0, 1, 0]);
  });

  it('leaves the left lane empty until a priority line starts', () => {
    const commits = [c('feature', ['base'], [ref('head', 'feature')]), c('main', ['base'], [ref('head', 'main')]), c('base', [])];
    const layout = layoutCommits(commits, rules);
    expect(lanesOf(commits, rules)).toEqual([1, 0, 0]);
    expect(layout.maxLanes).toBeGreaterThanOrEqual(2);
    expect(layout.edges.some((edge) => edge.fromRow === 0 && edge.fromLane === 0)).toBe(false);
  });

  it('includes the straight commits above the branch label', () => {
    const commits = [
      c('tip', ['main']),
      c('feature', ['base'], [ref('head', 'feature')]),
      c('main', ['base'], [ref('head', 'main')]),
      c('base', []),
    ];
    expect(lanesOf(commits, rules)).toEqual([0, 1, 0, 0]);
  });

  it('treats release and main on one first-parent line as that line', () => {
    const commits = [
      c('side', ['base'], [ref('head', 'feature')]),
      c('rel', ['main'], [ref('head', 'release/1')]),
      c('main', ['base'], [ref('head', 'main')]),
      c('base', []),
    ];
    expect(lanesOf(commits, rules)).toEqual([1, 0, 0, 0]);
  });

  it('stops the line where first-parent children split', () => {
    const commits = [
      c('rel', ['main'], [ref('head', 'release/1')]),
      c('feature', ['main'], [ref('head', 'feature')]),
      c('main', ['base'], [ref('head', 'main')]),
      c('base', []),
    ];
    expect(lanesOf(commits, rules)).toEqual([1, 2, 0, 0]);
  });

  it('puts the higher line on the left when priorities match', () => {
    const same = [{ pattern: 'release*', priority: 50 }];
    const commits = [
      c('r2', ['base'], [ref('head', 'release/2')]),
      c('r1', ['base'], [ref('head', 'release/1')]),
      c('base', []),
    ];
    expect(lanesOf(commits, same)).toEqual([0, 1, 0]);
  });

  it('uses the highest matching priority', () => {
    const overlap: LanePriorityRule[] = [
      { pattern: '*', priority: 1 },
      { pattern: 'main', priority: 99 },
      { pattern: 'feature', priority: 10 },
    ];
    const commits = [c('feature', ['base'], [ref('head', 'feature')]), c('main', ['base'], [ref('head', 'main')]), c('base', [])];
    expect(lanesOf(commits, overlap)).toEqual([1, 0, 0]);
  });

  it('matches a remote branch with the same glob as a local one', () => {
    const commits = [
      c('feature', ['base'], [ref('head', 'feature')]),
      c('rel', ['base'], [ref('remote', 'origin/release/1', 'rel')]),
      c('base', []),
    ];
    expect(lanesOf(commits, rules)).toEqual([1, 0, 0]);
  });

  it('ignores tags and stashes', () => {
    const commits = [
      c('feature', ['base'], [ref('head', 'feature')]),
      c('tagged', ['base'], [ref('tag', 'v1', 'tagged'), ref('stash', 'main', 'tagged')]),
      c('base', []),
    ];
    expect(lanesOf(commits, [{ pattern: 'v*', priority: 80 }, { pattern: 'main', priority: 99 }])).toEqual([0, 1, 0]);
  });

  it('reuses a priority lane after that line ends', () => {
    const commits = [c('feature', ['fork'], [ref('head', 'feature')]), c('main', [], [ref('head', 'main')]), c('fork', []), c('orphan', [])];
    expect(lanesOf(commits, rules)).toEqual([1, 0, 1, 0]);
  });
});
