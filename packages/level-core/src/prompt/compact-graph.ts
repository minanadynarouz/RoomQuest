import type {
  EdgeKind,
  SurfaceGraph,
  SurfaceLabel,
  SurfaceReach,
} from '@roomquest/schema';

/**
 * Prompt-only surface node. Scan metadata (`kind`, `yaw`) is omitted;
 * metres are quantized to centimetres so JSON stays short.
 */
export interface CompactPromptNode {
  id: string;
  label: SurfaceLabel;
  topHeight: number;
  centroid: [number, number, number];
  size: [number, number];
  area: number;
  reach: SurfaceReach;
  angleFromForward: number;
}

/**
 * Prompt-only edge. Same connectivity the director needs for planks,
 * ramps and portals, with centimetre gaps and Δh.
 */
export interface CompactPromptEdge {
  a: string;
  b: string;
  gap: number;
  dh: number;
  kind: EdgeKind;
}

/**
 * Compact SurfaceGraph for the director user message.
 * `version`, `roomHash` and `floorY` are dropped — seed already carries
 * the hash, and validation still runs against the full request graph.
 */
export interface CompactPromptGraph {
  mode: SurfaceGraph['mode'];
  nodes: CompactPromptNode[];
  edges: CompactPromptEdge[];
}

/** Centimetre quantization — matches the surface pipeline. */
const CM_DECIMALS = 2;

function quantize(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  if (rounded === 0) {
    return 0;
  }
  return Number(rounded.toFixed(decimals));
}

function cm(value: number): number {
  return quantize(value, CM_DECIMALS);
}

function deg(value: number): number {
  return quantize(value, 0);
}

/**
 * Shrink a {@link SurfaceGraph} for the LLM user message.
 *
 * Drops scan-only fields and quantizes lengths so provider tokens stay
 * near the ~2k-in budget (PRD NFR-8). Does not mutate `graph`. The
 * director still validates and repairs against the original graph.
 */
export function compactGraphForPrompt(graph: SurfaceGraph): CompactPromptGraph {
  return {
    mode: graph.mode,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      topHeight: cm(node.topHeight),
      centroid: [
        cm(node.centroid[0]),
        cm(node.centroid[1]),
        cm(node.centroid[2]),
      ],
      size: [cm(node.size[0]), cm(node.size[1])],
      area: cm(node.area),
      reach: node.reach,
      angleFromForward: deg(node.angleFromForward),
    })),
    edges: graph.edges.map((edge) => ({
      a: edge.a,
      b: edge.b,
      gap: cm(edge.gap),
      dh: cm(edge.dh),
      kind: edge.kind,
    })),
  };
}

/**
 * UTF-8 byte length of `JSON.stringify(value)`. Browser-safe (no `node:*`).
 */
export function promptGraphJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
