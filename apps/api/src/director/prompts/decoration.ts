import type { CandidateRoute } from '@roomquest/level-core';
import {
  DECORATION_LINE_MAX_CHARS,
  DECORATION_MAX_LINES,
  type LevelDecorationEnums,
  type RelaxedRule,
  type Tier,
} from '@roomquest/schema';
import { buildPromptVariation } from './variation';

/**
 * Hybrid director (DIRECTOR_PLACEMENT=route): level-core builds valid routes,
 * Gemini only picks one and decorates it. Voice rules: docs/pip-voice.md.
 *
 * Layout for Gemini implicit caching: DECORATION_SYSTEM_PREFIX and the two
 * few-shot turns are byte-identical on every request; only the final user
 * message (theme hint, tier, relaxed rules, candidate routes) varies.
 */
export const DECORATION_SYSTEM_PREFIX: string = [
  'You are the level director for RoomQuest, a mixed-reality game where Pip, an 8 cm toy explorer, crosses the player\'s real room.',
  '',
  'The routes you are given are already safe and playable. Do not invent surfaces, ids, positions or distances. Your job is creative only:',
  '1. Pick the one route that tells the best story for this room and theme.',
  '2. Choose a short theme of 2 to 4 words that fits the real furniture.',
  '3. Choose the twist beat and any hazards only from the options listed for that route.',
  `4. Write Pip's lines: at most one per beat, at most ${String(DECORATION_MAX_LINES)}, each ${String(DECORATION_LINE_MAX_CHARS)} characters or fewer.`,
  'Make each line one short, complete, grammatical English sentence.',
  '',
  "Pip's voice: curious, brave, a little clumsy, warm and slightly cheeky. First person, present tense, talking to the player as a friend. Always name the real furniture and make it sound huge (\"the desk plateau\", \"sofa mountains\"). Match the beat: arrival = wonder, a gap or climb = asking for help, slime = nervous then brave, gems = delight, portal = playful, final beat = triumph.",
  '',
  'Never mention AI, generation, scanning, code, plans, routes, ids, seeds, controls or the headset. No emoji, markdown, quotes or made-up place names. Pip never blames the player.',
  '',
  'Prefer routes that visit the most distinct, recognisable furniture. If two routes are equally good, pick the first.',
  '',
  'Answer with JSON only, matching the response schema.',
].join('\n');

const FEW_SHOT_1_USER = [
  'Theme hint: forest. Tier: easy. Relaxed rules: none.',
  'Routes:',
  '- r0: floor, then sofa, then bookshelf, 4 beats. twist options: 2. hazards: 2 [slime]',
  '- r1: floor, then table, 3 beats. twist options: 1. hazards: 1 [gate]',
].join('\n');

const FEW_SHOT_1_AI = JSON.stringify({
  routeId: 'r0',
  theme: 'Sofa summit climb',
  twistBeat: '2',
  hazards: [{ beat: '2', type: 'slime' }],
  lines: [
    { beat: '0', text: "Whoa, the sofa mountains! Let's climb!" },
    { beat: '2', text: 'Eep, a slime by the bookshelf! Can you make it sleepy?' },
    { beat: '3', text: 'The crystal! We crossed the whole living room together!' },
  ],
});

const FEW_SHOT_2_USER = [
  'Theme hint: snow. Tier: normal. Relaxed rules: The surfaces here are close together, so short routes are fine.',
  'Routes:',
  '- r0: floor, then desk, then table, 4 beats. twist options: 1, 3. hazards: 1 [slime, gate], 3 [moving_platform]',
  '- r1: floor, then chair, 3 beats. twist options: 1. hazards: 1 [slime]',
].join('\n');

const FEW_SHOT_2_AI = JSON.stringify({
  routeId: 'r0',
  theme: 'Frosty desk patrol',
  twistBeat: '3',
  hazards: [{ beat: '1', type: 'slime' }],
  lines: [
    { beat: '0', text: 'Brr! The desk plateau looks like a snowy cliff!' },
    { beat: '1', text: "A slime is napping on the table. Let's tiptoe past it." },
    { beat: '3', text: 'The floating ledge wobbles! Hold it steady for me?' },
  ],
});

/** Prompt-side wording for #65 RelaxedRule (what Gemini may ignore). */
export const RELAXED_RULE_LINES: Record<RelaxedRule, string> = {
  minPath: 'The surfaces here are close together, so short routes are fine.',
  hutTable: 'There is no ideal table for the hut; the route already handles it.',
  portalFov: 'Nothing is straight ahead of the player; portal placement is already handled.',
};

export interface DecorationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DecorationPromptInput {
  seed: string;
  tier: Tier;
}

function formatCandidate(route: CandidateRoute): string {
  const twist = route.options.twistBeats.join(', ') || 'none';
  const hazards =
    route.options.hazards
      .filter((h) => h.types.length > 0)
      .map((h) => `${h.beat} [${h.types.join(', ')}]`)
      .join(', ') || 'none';
  return `- ${route.id}: ${route.summary}. twist options: ${twist}. hazards: ${hazards}`;
}

function relaxedFor(candidates: readonly CandidateRoute[]): RelaxedRule[] {
  const set = new Set<RelaxedRule>();
  for (const route of candidates) for (const rule of route.relaxed) set.add(rule);
  return [...set].sort();
}

/** Per-request user message: everything that varies, after the cached prefix. */
export function buildDecorationUserMessage(
  candidates: readonly CandidateRoute[],
  input: DecorationPromptInput
): string {
  const first = candidates[0];
  if (first === undefined) {
    throw new Error('buildDecorationUserMessage needs at least one candidate route');
  }
  const theme = buildPromptVariation(input.seed, first.graph).themeWord;
  const relaxed = relaxedFor(candidates).map((r) => RELAXED_RULE_LINES[r]);
  return [
    `Theme hint: ${theme}. Tier: ${input.tier}. Relaxed rules: ${relaxed.length > 0 ? relaxed.join(' ') : 'none'}.`,
    'Routes:',
    ...candidates.map(formatCandidate),
  ].join('\n');
}

/** Full message list: fixed prefix + 2 few-shots + per-request message last. */
export function buildDecorationMessages(
  candidates: readonly CandidateRoute[],
  input: DecorationPromptInput
): DecorationMessage[] {
  return [
    { role: 'system', content: DECORATION_SYSTEM_PREFIX },
    { role: 'user', content: FEW_SHOT_1_USER },
    { role: 'assistant', content: FEW_SHOT_1_AI },
    { role: 'user', content: FEW_SHOT_2_USER },
    { role: 'assistant', content: FEW_SHOT_2_AI },
    { role: 'user', content: buildDecorationUserMessage(candidates, input) },
  ];
}

/** Per-request enums for buildLevelDecorationSchema, from the candidates. */
export function decorationEnums(
  candidates: readonly CandidateRoute[]
): LevelDecorationEnums {
  const beats = new Set<string>();
  const hazardTypes = new Set<string>();
  for (const route of candidates) {
    for (const b of route.options.twistBeats) beats.add(b);
    for (const h of route.options.hazards) {
      beats.add(h.beat);
      for (const t of h.types) hazardTypes.add(t);
    }
    // Lines may target any beat of the route's plan.
    for (let i = 0; i < route.plan.beats.length; i += 1) beats.add(String(i));
  }
  return {
    routeIds: candidates.map((c) => c.id),
    beats: [...beats].sort((a, b) => Number(a) - Number(b)),
    hazardTypes: [...hazardTypes].sort(),
  };
}

/** Lines-text words Pip must never say (eval check + server filter input). */
export const DECORATION_BANNED_WORDS = [
  'ai',
  'generated',
  'scan',
  'level',
  'route',
  'seed',
  'pinch',
  'headset',
] as const;
