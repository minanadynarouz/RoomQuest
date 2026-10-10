/**
 * Even round-robin over independent dimensions. Run `i` takes
 * rooms[i % R] × tiers[i % T] × seeds[i % S] × arms[i % A] — never the
 * nested cartesian order (room1-all-tiers-all-seeds, then room2, …).
 */
export function pickRoundRobin<T>(index: number, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('round-robin dimension is empty');
  }
  const item = items[index % items.length];
  if (item === undefined) {
    throw new Error('round-robin index out of range');
  }
  return item;
}

export function spreadEvalCells<TRoom, TTier, TSeed, TArm>(
  runCount: number,
  rooms: readonly TRoom[],
  tiers: readonly TTier[],
  seeds: readonly TSeed[],
  arms: readonly TArm[]
): {
  room: TRoom;
  tier: TTier;
  date: TSeed;
  placement: TArm;
}[] {
  const cells: {
    room: TRoom;
    tier: TTier;
    date: TSeed;
    placement: TArm;
  }[] = [];
  for (let i = 0; i < runCount; i += 1) {
    cells.push({
      room: pickRoundRobin(i, rooms),
      tier: pickRoundRobin(i, tiers),
      date: pickRoundRobin(i, seeds),
      placement: pickRoundRobin(i, arms),
    });
  }
  return cells;
}
