import { refColourGlob, refColourTargets } from './refColours';
import { UNCOMMITTED, type GraphCommit, type GraphRef, type LanePriorityRule } from './types';

export type Vertex = { hash: string; lane: number; row: number };
export type Edge = { fromRow: number; fromLane: number; toRow: number; toLane: number; lane: number; committed: boolean };

export type Layout = {
  vertices: Vertex[];
  edges: Edge[];
  maxLanes: number;
};

/** Settings object `{ "main": 99, "release*": 50 }`. Non-numbers are dropped. */
export function lanePriorityToSetting(rules: readonly LanePriorityRule[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rule of rules) out[rule.pattern] = rule.priority;
  return out;
}

/** Replace `previous`, or append. Returns undefined when the pattern or priority cannot be stored. */
export function upsertLanePriority(
  rules: readonly LanePriorityRule[],
  pattern: string,
  priority: number,
  previous?: string,
): LanePriorityRule[] | undefined {
  const key = pattern.trim();
  if (!key || !Number.isFinite(priority)) return undefined;
  const prev = previous?.trim();
  const base = prev && prev !== key ? rules.filter((rule) => rule.pattern !== prev) : [...rules];
  const index = base.findIndex((rule) => rule.pattern === key);
  if (index >= 0) {
    const next = base.slice();
    next[index] = { pattern: key, priority };
    return next;
  }
  return [...base, { pattern: key, priority }];
}

export function removeLanePriority(rules: readonly LanePriorityRule[], pattern: string): LanePriorityRule[] {
  const key = pattern.trim();
  return rules.filter((rule) => rule.pattern !== key);
}

export function parseLanePriority(value: unknown): LanePriorityRule[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const rules: LanePriorityRule[] = [];
  for (const [key, raw] of Object.entries(value)) {
    const pattern = key.trim();
    if (!pattern || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    rules.push({ pattern, priority: raw });
  }
  return rules;
}

/** Higher priority first, then the line nearer the top of the graph, then branch name. */
export function compareLanePriority(
  a: { priority: number; row: number; name: string },
  b: { priority: number; row: number; name: string },
): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.row !== b.row) return a.row - b.row;
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

function branchLanePriority(ref: GraphRef, rules: readonly LanePriorityRule[]): number {
  if (ref.kind !== 'head' && ref.kind !== 'remote') return 0;
  const names = refColourTargets(ref);
  if (!names.length) return 0;
  let best = 0;
  for (const rule of rules) {
    if (rule.priority <= best) continue;
    const re = refColourGlob(rule.pattern);
    if (names.some((name) => re.test(name))) best = rule.priority;
  }
  return best;
}

type LaneHold = {
  byHash: Map<string, number>;
  /** Row at which reserved lane `index` starts. Until then the lane stays empty. */
  heldRows: number[];
};

/**
 * One lane per priority line. The line head is the newest commit reached by walking
 * upward while a commit has exactly one child that lists it as the first parent.
 */
function reservePriorityLanes(commits: readonly GraphCommit[], rules: readonly LanePriorityRule[]): LaneHold {
  const rowOf = new Map<string, number>();
  commits.forEach((commit, row) => rowOf.set(commit.hash, row));

  const children = new Map<string, string[]>();
  for (const commit of commits) {
    const parent = commit.parents[0];
    if (!parent || !rowOf.has(parent)) continue;
    const kids = children.get(parent);
    if (kids) kids.push(commit.hash);
    else children.set(parent, [commit.hash]);
  }

  const heads = new Map<string, string>();
  const lineHead = (start: string): string => {
    const cached = heads.get(start);
    if (cached) return cached;
    const chain: string[] = [];
    const seen = new Set<string>();
    let current = start;
    while (!heads.has(current) && !seen.has(current)) {
      seen.add(current);
      chain.push(current);
      const kids = children.get(current);
      if (!kids || kids.length !== 1) break;
      current = kids[0]!;
    }
    const head = heads.get(current) ?? current;
    for (const step of chain) heads.set(step, head);
    return head;
  };

  const lines = new Map<string, { hash: string; row: number; priority: number; name: string }>();
  for (const commit of commits) {
    for (const ref of commit.refs) {
      const priority = branchLanePriority(ref, rules);
      if (priority <= 0) continue;
      const hash = lineHead(commit.hash);
      const row = rowOf.get(hash);
      if (row === undefined) continue;
      const existing = lines.get(hash);
      if (!existing) {
        lines.set(hash, { hash, row, priority, name: ref.name });
        continue;
      }
      if (priority > existing.priority) {
        existing.priority = priority;
        existing.name = ref.name;
      } else if (priority === existing.priority && ref.name < existing.name) {
        existing.name = ref.name;
      }
    }
  }

  const ordered = [...lines.values()].sort(compareLanePriority);
  const byHash = new Map<string, number>();
  const heldRows: number[] = [];
  ordered.forEach((line, lane) => {
    byHash.set(line.hash, lane);
    heldRows[lane] = line.row;
  });
  return { byHash, heldRows };
}

export function layoutCommits(commits: GraphCommit[], rules?: readonly LanePriorityRule[]): Layout {
  const vertices: Vertex[] = [];
  const edges: Edge[] = [];
  const occupants: Array<string | undefined> = [];
  const hold = rules?.length ? reservePriorityLanes(commits, rules) : undefined;

  const laneHeld = (lane: number, row: number): boolean => {
    const start = hold?.heldRows[lane];
    return start !== undefined && row < start;
  };

  const takeLane = (row: number): number => {
    let i = 0;
    while (true) {
      if (laneHeld(i, row)) {
        i++;
        continue;
      }
      if (i >= occupants.length || occupants[i] === undefined) {
        while (occupants.length <= i) occupants.push(undefined);
        return i;
      }
      i++;
    }
  };

  const addEdge = (fromRow: number, fromLane: number, toRow: number, toLane: number, committed: boolean): void => {
    if (toRow >= commits.length) return;
    edges.push({
      fromRow,
      fromLane,
      toRow,
      toLane,
      lane: fromRow === toRow ? fromLane : toLane,
      committed,
    });
  };

  for (let row = 0; row < commits.length; row++) {
    const c = commits[row]!;
    const reserved = hold?.byHash.get(c.hash);
    let lane: number;
    if (reserved !== undefined) {
      while (occupants.length <= reserved) occupants.push(undefined);
      lane = reserved;
    } else {
      lane = occupants.findIndex((h) => h === c.hash);
      if (lane < 0) lane = takeLane(row);
    }

    for (let i = 0; i < occupants.length; i++) {
      if (i !== lane && occupants[i] === c.hash) {
        occupants[i] = undefined;
        let retargeted = false;
        for (let e = edges.length - 1; e >= 0; e--) {
          const edge = edges[e]!;
          if (edge.toRow === row && edge.toLane === i) {
            edge.toLane = lane;
            edge.lane = i;
            retargeted = true;
            break;
          }
        }
        if (!retargeted && row > 0) addEdge(row - 1, i, row, lane, c.hash !== UNCOMMITTED);
      }
    }
    occupants[lane] = undefined;
    vertices.push({ hash: c.hash, lane, row });

    const continuing: number[] = [];
    for (let i = 0; i < occupants.length; i++) {
      if (occupants[i] !== undefined) continuing.push(i);
    }

    c.parents.forEach((parent, i) => {
      let parentLane: number;
      if (i === 0) {
        parentLane = occupants[lane] === undefined ? lane : takeLane(row);
      } else {
        const existing = occupants.findIndex((h) => h === parent);
        parentLane = existing >= 0 ? existing : takeLane(row);
      }
      occupants[parentLane] = parent;
      addEdge(row, lane, row + 1, parentLane, c.hash !== UNCOMMITTED);
    });

    for (const i of continuing) {
      addEdge(row, i, row + 1, i, occupants[i] !== UNCOMMITTED);
    }
  }

  return { vertices, edges, maxLanes: Math.max(1, occupants.length) };
}

/**
 * Lanes that carry a commit in `history`, including the segments that pass other commits
 * on the way to an ancestor.
 */
export function historyLanes(layout: Layout, commits: ReadonlyArray<{ hash: string }>, history: Set<string>): boolean[][] {
  const hot: boolean[][] = commits.map(() => []);
  const mark = (row: number, lane: number) => {
    const lanes = hot[row];
    if (lanes) lanes[lane] = true;
  };
  for (let row = 0; row < commits.length; row++) {
    if (!history.has(commits[row]!.hash)) continue;
    const lane = layout.vertices[row]?.lane;
    if (lane != null) mark(row, lane);
  }
  for (const edge of layout.edges) {
    if (hot[edge.fromRow]?.[edge.fromLane]) mark(edge.toRow, edge.toLane);
  }
  return hot;
}

/** Bright only when the selected history already occupies the edge's source lane. */
export function historyEdgeHot(lanes: boolean[][] | null, fromRow: number, fromLane: number): boolean {
  if (!lanes) return true;
  return Boolean(lanes[fromRow]?.[fromLane]);
}

export type BridgeEdge = Pick<Edge, 'fromLane' | 'toLane' | 'lane' | 'committed'>;

/**
 * Lanes that cross a hidden commit span, drawn as one row from `above` to `below`.
 * A branch that merges away inside the span is omitted. A lane that continues past it is kept.
 */
export function foldBridgeEdges(layout: Layout, above: number, below: number): BridgeEdge[] {
  if (above < 0 || below <= above + 1 || below > layout.vertices.length) return [];
  const vertex = layout.vertices[above]?.lane;
  const leaving = layout.edges.filter((edge) => edge.fromRow === above);
  const bridges: BridgeEdge[] = [];
  let firstParent = true;
  for (const edge of leaving) {
    const fromVertex = vertex != null && edge.fromLane === vertex;
    const through = fromVertex ? firstParent : true;
    if (fromVertex) firstParent = false;
    const end = walkFoldLane(layout, edge.toLane, edge.toRow, below, through);
    if (!end) continue;
    bridges.push({
      fromLane: edge.fromLane,
      toLane: end.lane,
      lane: end.lane,
      committed: edge.committed && end.committed,
    });
  }
  return bridges;
}

function walkFoldLane(
  layout: Layout,
  lane: number,
  row: number,
  below: number,
  through: boolean,
): { lane: number; committed: boolean } | null {
  let committed = true;
  while (row < below) {
    const vertex = layout.vertices[row];
    if (!vertex) return null;
    if (vertex.lane === lane) {
      if (!through) return null;
      const first = layout.edges.find((edge) => edge.fromRow === row && edge.fromLane === lane);
      if (!first) return null;
      committed = committed && first.committed;
      lane = first.toLane;
      row = first.toRow;
      continue;
    }
    const cont = layout.edges.find((edge) => edge.fromRow === row && edge.fromLane === lane);
    if (!cont) return null;
    committed = committed && cont.committed;
    lane = cont.toLane;
    row = cont.toRow;
  }
  return row === below ? { lane, committed } : null;
}
