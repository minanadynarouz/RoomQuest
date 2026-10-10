import {
  KIT_CATALOG,
  PAR_TIME_MIN_MS,
  type Beat,
  type LevelPlan,
  type Placement,
  type SurfaceGraph,
  type SurfaceLabel,
  type SurfaceNode,
  type Theme,
  type Tier,
} from '@roomquest/schema';
import { clampParTimeMs } from '../validate/clamp-par';
import { pickHutSurface } from '../validate/graph-capacity';
import {
  horizontalDistance,
  MAX_VIEW_ANGLE_DEG,
  MIN_PATH_DISTANCE_M,
} from '../validate/graph-utils';
import { repairPlan } from '../repair/repair-plan';
import { buildDialogue, pickTheme, pickTitle } from './dialogue';
import {
  linkBetween,
  possibleLinks,
  reachableFrom,
  shortestPath,
  type Link,
} from './links';
import { createRng, hashString, type Rng } from './prng';

export interface GeneratePlanOptions {
  /** Skip these themes when the seed would pick one (API `recentThemes`). */
  recentThemes?: readonly Theme[];
}

const LABEL_WORD: Record<SurfaceLabel, string> = {
  table: 'table',
  desk: 'desk',
  couch: 'couch',
  bed: 'bed',
  shelf: 'shelf',
  storage: 'cabinet',
  floor: 'floor',
  seat_like: 'seat',
  other: 'far surface',
};

const SLIME = KIT_CATALOG.slime;
const PLATFORM = KIT_CATALOG.moving_platform;

/**
 * Deterministic procedural generator (design doc §6 step 6).
 *
 * start = largest valid table/desk; goal = farthest reachable surface;
 * bridges along the shortest path; lever/gate on the last hop; gems on
 * path nodes; dialogue from the theme template bank.
 *
 * Uses only the 10 MVP pieces. Same `(graph, seed, tier)` → deep-equal
 * output. No `Math.random`, no `Date`. Fast enough for the browser
 * instant fallback (< 20 ms target).
 *
 * Tiny graphs (2 nodes) produce a hut, shrine, plank if the gap fits,
 * gems, and a gate/lever when a reachable lever surface exists.
 *
 * Minimum graph for a full-quality plan: ≥ 2 surfaces, ≥ 1 table/desk
 * that meets village_hut catalog constraints, and ≥ 1 pair of surfaces
 * 0.8 m apart. Below that (IWER `meeting_room` is 3 stacked surfaces
 * 0.17 m apart; several IWER rooms have no in-cone table) this still
 * returns a schema-valid degraded plan — never an invalid one.
 */
export function generatePlan(
  graph: SurfaceGraph,
  seed: string,
  tier: Tier,
  options?: GeneratePlanOptions
): LevelPlan {
  try {
    return generatePlanInner(graph, seed, tier, options);
  } catch {
    return stubPlan(seed);
  }
}

function generatePlanInner(
  graph: SurfaceGraph,
  seed: string,
  tier: Tier,
  options?: GeneratePlanOptions
): LevelPlan {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  if (nodes.length < 2) {
    return stubPlan(seed);
  }

  const rng = createRng(`${seed}|${tier}`);
  const theme = pickTheme(hashString(seed), options?.recentThemes);
  const title = pickTitle(theme, rng);

  const startNode = pickStart(nodes);
  const links = possibleLinks(graph);
  const reachable = reachableFrom(startNode.id, links);
  const goalNode = pickGoal(startNode, nodes, reachable);
  const path =
    shortestPath(startNode.id, goalNode.id, links) ??
    [startNode.id, goalNode.id];

  const placements: Placement[] = [];
  const id = makeIdFactory();

  placements.push(
    place('village_hut', startNode.id, id(), rng, { playerBuilt: false })
  );
  placements.push(
    place('crystal_shrine', goalNode.id, id(), rng, { playerBuilt: false })
  );

  const connectorIds: string[] = [];
  const pathLinks: Link[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) {
      continue;
    }
    const link = linkBetween(links, a, b);
    if (!link || link.kind === 'adjacent') {
      continue;
    }
    pathLinks.push(link);
    const piece =
      link.kind === 'ramp'
        ? 'ramp'
        : link.kind === 'portal'
          ? 'portal'
          : 'plank_bridge';
    const cid = id();
    connectorIds.push(cid);
    placements.push(
      place(piece, link.a, cid, rng, {
        to: link.b,
        playerBuilt: piece !== 'portal',
      })
    );
  }

  const pathSet = new Set(path);
  const onPath = nodes.filter((node) => pathSet.has(node.id));
  const gemTarget = tier === 'easy' ? 3 : 3 + rng.nextInt(3);
  addGems(placements, onPath, startNode.id, id, rng, gemTarget);

  const leverNode = pickLeverSurface(nodes, startNode, goalNode);
  let gateId: string | undefined;
  let leverId: string | undefined;
  if (leverNode && placements.length + 2 <= 14) {
    gateId = id();
    leverId = id();
    placements.push(
      place('gate', goalNode.id, gateId, rng, { playerBuilt: false })
    );
    placements.push(
      place('lever', leverNode.id, leverId, rng, {
        playerBuilt: false,
        links: [gateId],
      })
    );
  }

  if (tier === 'normal' && placements.length < 14) {
    const slimeNode = pickSlimeSurface(onPath, startNode.id);
    if (slimeNode) {
      placements.push(
        place('slime', slimeNode.id, id(), rng, { playerBuilt: false })
      );
    }
  }

  if (tier === 'normal' && placements.length < 14 && rng.next() > 0.45) {
    const platNode = pickPlatformSurface(onPath);
    if (platNode) {
      placements.push(
        place('moving_platform', platNode.id, id(), rng, {
          playerBuilt: false,
        })
      );
    }
  }

  trimToMax(placements, 14);

  const beats = buildBeats(
    placements,
    connectorIds,
    gateId,
    leverId,
    goalNode
  );
  const startWord = LABEL_WORD[startNode.label];
  const goalWord = LABEL_WORD[goalNode.label];
  const dialogue = buildDialogue(theme, rng, {
    startLabel: startWord,
    goalLabel: goalWord,
  });
  const parTimeMs = computeParTimeMs(path, links, beats.length, tier, nodes);

  const plan: LevelPlan = {
    seed,
    theme,
    title,
    start: startNode.id,
    goal: goalNode.id,
    placements,
    beats,
    dialogue,
    parTimeMs,
  };

  const repaired = repairPlan(plan, graph);
  return repaired.result.ok ? repaired.plan : plan;
}

function pickStart(nodes: readonly SurfaceNode[]): SurfaceNode {
  return pickHutSurface(nodes) ?? fallbackNode();
}

function fallbackNode(): SurfaceNode {
  return {
    id: 's1',
    label: 'table',
    kind: 'plane',
    topHeight: 0.75,
    centroid: [0, 0.75, 0],
    size: [1, 1],
    yaw: 0,
    area: 1,
    reach: 'hand',
    angleFromForward: 0,
  };
}

function pickGoal(
  start: SurfaceNode,
  nodes: readonly SurfaceNode[],
  reachable: ReadonlySet<string>
): SurfaceNode {
  const candidates = nodes.filter(
    (node) => node.id !== start.id && reachable.has(node.id)
  );
  const pool = candidates.length > 0 ? candidates : nodes.filter((n) => n.id !== start.id);
  const far = pool.filter(
    (node) => horizontalDistance(start, node) >= MIN_PATH_DISTANCE_M
  );
  const ranked = (far.length > 0 ? far : pool).slice();
  ranked.sort((a, b) => {
    const db = horizontalDistance(start, b);
    const da = horizontalDistance(start, a);
    return db - da || a.id.localeCompare(b.id);
  });
  return ranked[0] ?? start;
}

function pickLeverSurface(
  nodes: readonly SurfaceNode[],
  start: SurfaceNode,
  goal: SurfaceNode
): SurfaceNode | null {
  const usable = nodes.filter(
    (node) =>
      (node.reach === 'hand' || node.reach === 'ray') &&
      node.angleFromForward <= MAX_VIEW_ANGLE_DEG
  );
  if (usable.length === 0) {
    return null;
  }
  const preferStart = usable.find((node) => node.id === start.id);
  if (preferStart) {
    return preferStart;
  }
  const notGoal = usable.filter((node) => node.id !== goal.id);
  const pool = notGoal.length > 0 ? notGoal : usable;
  pool.sort((a, b) => a.angleFromForward - b.angleFromForward || a.id.localeCompare(b.id));
  return pool[0] ?? null;
}

function pickSlimeSurface(
  onPath: readonly SurfaceNode[],
  startId: string
): SurfaceNode | null {
  const allowed = SLIME.allowedSurfaces;
  const minArea = SLIME.minArea ?? 0;
  const fits = onPath.filter((node) => {
    if (allowed && !allowed.includes(node.label)) {
      return false;
    }
    return node.area >= minArea;
  });
  const notStart = fits.filter((node) => node.id !== startId);
  const pool = notStart.length > 0 ? notStart : fits;
  pool.sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
  return pool[0] ?? null;
}

function pickPlatformSurface(
  onPath: readonly SurfaceNode[]
): SurfaceNode | null {
  const allowed = PLATFORM.allowedSurfaces;
  const fits = onPath.filter(
    (node) => !allowed || allowed.includes(node.label)
  );
  fits.sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
  return fits[0] ?? null;
}

function addGems(
  placements: Placement[],
  onPath: readonly SurfaceNode[],
  startId: string,
  id: () => string,
  rng: Rng,
  target: number
): void {
  if (onPath.length === 0) {
    return;
  }
  const ordered = [...onPath].sort((a, b) => {
    if (a.id === startId) {
      return -1;
    }
    if (b.id === startId) {
      return 1;
    }
    return a.id.localeCompare(b.id);
  });
  let n = 0;
  let cursor = 0;
  while (n < target && placements.length < 14) {
    const node = ordered[cursor % ordered.length];
    cursor += 1;
    if (!node) {
      break;
    }
    placements.push(
      place('gem', node.id, id(), rng, { playerBuilt: false })
    );
    n += 1;
    if (cursor > target * ordered.length) {
      break;
    }
  }
}

function buildBeats(
  placements: readonly Placement[],
  connectorIds: readonly string[],
  gateId: string | undefined,
  leverId: string | undefined,
  goal: SurfaceNode
): Beat[] {
  const shrine = placements.find((p) => p.piece === 'crystal_shrine');
  const slime = placements.find((p) => p.piece === 'slime');
  const gem = placements.find((p) => p.piece === 'gem');
  const beats: Beat[] = [];
  const playerBuilt = connectorIds.filter((cid) => {
    const placement = placements.find((item) => item.id === cid);
    return placement?.playerBuilt === true;
  });
  if (playerBuilt.length > 0) {
    const word = LABEL_WORD[goal.label];
    beats.push({
      goal: clamp80(`Bridge the gap toward the ${word}`),
      uses: [...playerBuilt],
    });
  }
  if (gateId && leverId) {
    beats.push({
      goal: 'Open the gate',
      uses: [leverId, gateId],
    });
  }
  if (slime && beats.length < 3) {
    beats.push({
      goal: 'Stun the slime',
      uses: [slime.id],
    });
  }
  if (shrine) {
    beats.push({
      goal: 'Reach the crystal shrine',
      uses: [shrine.id],
    });
  }
  while (beats.length < 2) {
    if (gem) {
      beats.unshift({
        goal: 'Collect a spark along the path',
        uses: [gem.id],
      });
    } else {
      beats.push({
        goal: 'Help the explorer onward',
        uses: shrine ? [shrine.id] : [],
      });
    }
  }
  return beats.slice(0, 4);
}

function computeParTimeMs(
  path: readonly string[],
  links: readonly Link[],
  beatCount: number,
  tier: Tier,
  nodes: readonly SurfaceNode[]
): number {
  const hops = Math.max(1, path.length - 1);
  let metres = 0;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) {
      continue;
    }
    const na = byId.get(a);
    const nb = byId.get(b);
    if (na && nb) {
      metres += horizontalDistance(na, nb);
    } else {
      const link = linkBetween(links, a, b);
      metres += link?.cost ?? 1;
    }
  }
  let ms =
    90000 + hops * 25000 + beatCount * 20000 + Math.round(metres * 12000);
  if (tier === 'easy') {
    ms += 40000;
  }
  const clamped = clampParTimeMs(ms);
  return clamped < PAR_TIME_MIN_MS ? PAR_TIME_MIN_MS : clamped;
}

function place(
  piece: Placement['piece'],
  surface: string,
  id: string,
  rng: Rng,
  extra: { to?: string; playerBuilt: boolean; links?: string[] }
): Placement {
  const uv = slot(rng);
  const placement: Placement = {
    id,
    piece,
    surface,
    u: uv.u,
    v: uv.v,
    playerBuilt: extra.playerBuilt,
    links: extra.links ? [...extra.links] : [],
  };
  if (extra.to !== undefined) {
    placement.to = extra.to;
  }
  return placement;
}

function slot(rng: Rng): { u: number; v: number } {
  return {
    u: round3(0.2 + rng.next() * 0.6),
    v: round3(0.2 + rng.next() * 0.6),
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function makeIdFactory(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `p${String(n)}`;
  };
}

function trimToMax(placements: Placement[], max: number): void {
  while (placements.length > max) {
    let idx = -1;
    for (let i = placements.length - 1; i >= 0; i -= 1) {
      const item = placements[i];
      if (
        item &&
        (item.piece === 'moving_platform' ||
          item.piece === 'slime' ||
          item.piece === 'gem')
      ) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      placements.pop();
      continue;
    }
    placements.splice(idx, 1);
  }
}

function clamp80(text: string): string {
  if (text.length <= 80) {
    return text;
  }
  return text.slice(0, 80);
}

function stubPlan(seed: string): LevelPlan {
  return {
    seed,
    theme: 'forest',
    title: 'Tiny Room Quest',
    start: 's1',
    goal: 's2',
    placements: [
      {
        id: 'p1',
        piece: 'village_hut',
        surface: 's1',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p2',
        piece: 'crystal_shrine',
        surface: 's2',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p3',
        piece: 'gem',
        surface: 's1',
        u: 0.2,
        v: 0.2,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p4',
        piece: 'gem',
        surface: 's2',
        u: 0.8,
        v: 0.8,
        playerBuilt: false,
        links: [],
      },
    ],
    beats: [
      { goal: 'Collect a spark along the path', uses: ['p3'] },
      { goal: 'Reach the crystal shrine', uses: ['p2'] },
    ],
    dialogue: [
      { trigger: 'intro', line: 'A tiny room, a tiny quest. Help me across!' },
      { trigger: 'win', line: 'We made it!' },
    ],
    parTimeMs: PAR_TIME_MIN_MS,
  };
}
