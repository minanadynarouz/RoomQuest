import type { Dialogue, Theme } from '@roomquest/schema';
import type { Rng } from './prng';

export const THEMES = ['forest', 'desert', 'snow', 'sky'] as const;

export interface DialogueContext {
  goalLabel: string;
  startLabel: string;
}

interface ThemeBank {
  titles: readonly string[];
  intro: readonly string[];
  beat: readonly string[];
  stuck: readonly string[];
  win: readonly string[];
  gaze: readonly string[];
}

/**
 * Small per-theme template bank (design doc §6 step 6).
 * Titles ≤ 40 chars, lines ≤ 90 chars.
 */
const BANKS: Readonly<Record<Theme, ThemeBank>> = {
  forest: {
    titles: [
      'The Fallen Sun Crystal',
      'Mosswood Crossing',
      'Grove of Lost Light',
      'Fernbridge Quest',
    ],
    intro: [
      'The sun crystal fell onto the {goal}. Help me get there!',
      'A grove-light rests on the {goal}. I cannot cross alone.',
      'From this {start} I see the crystal on the {goal}. Guide me!',
    ],
    beat: [
      'Yes! The path opens through the moss.',
      'The grove hums — keep going.',
      'A little farther through the green.',
    ],
    stuck: [
      'The roots block me. A bridge or a switch, perhaps?',
      'I cannot hop this gap. Pinch a plank for me?',
    ],
    win: [
      'The sun crystal is ours. The grove is bright again!',
      'Home with the light — thank you, friend of the forest.',
    ],
    gaze: [
      'Look for a lever if a gate bars the way.',
      'Pinch a plank from the tray, then snap it on a gap.',
    ],
  },
  desert: {
    titles: [
      'Sandglass Shrine',
      'Dune Crossing',
      'The Sunstone Path',
      'Oasis Gate',
    ],
    intro: [
      'The sunstone slipped onto the {goal}. Help me cross the sand!',
      'Heat-shimmer hides the {goal}. I need a path from this {start}.',
      'A shrine-stone waits on the {goal}. Will you walk with me?',
    ],
    beat: [
      'Good — the dunes part a little.',
      'Sand holds. Onward to the shrine.',
      'The oasis is closer now.',
    ],
    stuck: [
      'This gap is too wide for tiny feet. A plank?',
      'A gate in the sand. Is there a lever in reach?',
    ],
    win: [
      'The sunstone is safe. Shade and stars for us both!',
      'Shrine light! The desert sings tonight.',
    ],
    gaze: [
      'Ray-pinch far levers; you need not stand.',
      'Snap a plank between two sun-warm tops.',
    ],
  },
  snow: {
    titles: [
      'Frozen Starlight',
      'Icebridge Run',
      'The Winter Crystal',
      'Snowcap Crossing',
    ],
    intro: [
      'Starlight iced over on the {goal}. Help me reach it!',
      'From this {start} the winter crystal gleams on the {goal}.',
      'A frost-shrine waits across the snow. I cannot jump it.',
    ],
    beat: [
      'The ice holds. Careful steps.',
      'Snow crunches — we are closer.',
      'A warm glow beyond the drift.',
    ],
    stuck: [
      'Too slick, too far. Lay a plank across the cold gap.',
      'A frozen gate. A lever should thaw the lock.',
    ],
    win: [
      'Starlight is home. The snow feels kind again!',
      'The winter crystal sings. Thank you, warm hands.',
    ],
    gaze: [
      'Poke a slime if one patrols the snow.',
      'A gate needs its lever before I can pass.',
    ],
  },
  sky: {
    titles: [
      'Cloudstep Quest',
      'The Sky Crystal',
      'Windbridge Run',
      'High Air Shrine',
    ],
    intro: [
      'The sky crystal drifted onto the {goal}. Help me cloud-step!',
      'Wind took our light to the {goal}. I need a bridge from this {start}.',
      'A shrine in the air waits on the {goal}. Catch me if I slip!',
    ],
    beat: [
      'Up we go — the wind is kind.',
      'Clouds part. Keep the path open.',
      'Almost at the high shrine.',
    ],
    stuck: [
      'I cannot fly this gap. A plank or a portal, please?',
      'Sky-gate ahead. Pull its lever from here.',
    ],
    win: [
      'The sky crystal is ours. What a view!',
      'Home above the clouds. Thank you, sky-friend.',
    ],
    gaze: [
      'Look toward the shrine — I will follow the path you build.',
      'Far pieces use a hand ray. No need to stand.',
    ],
  },
};

const FILL = /\{(goal|start)\}/g;

export function pickTheme(
  seedHash: number,
  recentThemes: readonly Theme[] | undefined
): Theme {
  const preferred = THEMES.filter((theme) => !recentThemes?.includes(theme));
  const pool = preferred.length > 0 ? preferred : THEMES;
  const index = seedHash % pool.length;
  return pool[index] ?? 'forest';
}

export function pickTitle(theme: Theme, rng: Rng): string {
  const bank = BANKS[theme];
  return rng.pick(bank.titles, bank.titles[0] ?? 'Roomquest');
}

export function buildDialogue(
  theme: Theme,
  rng: Rng,
  ctx: DialogueContext
): Dialogue[] {
  const bank = BANKS[theme];
  const fill = (line: string): string =>
    clamp90(
      line.replace(FILL, (_whole, key: string) =>
        key === 'start' ? ctx.startLabel : ctx.goalLabel
      )
    );
  const lines: Dialogue[] = [
    { trigger: 'intro', line: fill(rng.pick(bank.intro, bank.intro[0] ?? '')) },
    { trigger: 'beat', line: fill(rng.pick(bank.beat, bank.beat[0] ?? '')) },
    { trigger: 'stuck', line: fill(rng.pick(bank.stuck, bank.stuck[0] ?? '')) },
    { trigger: 'win', line: fill(rng.pick(bank.win, bank.win[0] ?? '')) },
    { trigger: 'gaze', line: fill(rng.pick(bank.gaze, bank.gaze[0] ?? '')) },
  ];
  return lines.filter((line) => line.line.length > 0).slice(0, 12);
}

function clamp90(line: string): string {
  if (line.length <= 90) {
    return line;
  }
  return line.slice(0, 90);
}
