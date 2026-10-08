import { UNCOMMITTED, type GraphCommit } from './types';

export type Vertex = { hash: string; lane: number; row: number };
export type Edge = { fromRow: number; fromLane: number; toRow: number; toLane: number; lane: number; committed: boolean };

export type Layout = {
  vertices: Vertex[];
  edges: Edge[];
  maxLanes: number;
};

export function layoutCommits(commits: GraphCommit[]): Layout {
  const vertices: Vertex[] = [];
  const edges: Edge[] = [];
  const occupants: Array<string | undefined> = [];

  const takeLane = (): number => {
    const i = occupants.findIndex((x) => x === undefined);
    if (i >= 0) return i;
    occupants.push(undefined);
    return occupants.length - 1;
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
    let lane = occupants.findIndex((h) => h === c.hash);
    if (lane < 0) lane = takeLane();

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
        parentLane = occupants[lane] === undefined ? lane : takeLane();
      } else {
        const existing = occupants.findIndex((h) => h === parent);
        parentLane = existing >= 0 ? existing : takeLane();
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
