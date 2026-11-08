/** Pure grid geometry shared by movement-effect inference and item-target choices. */
export type ReachPos = Readonly<{ x: number; y: number }>;

const key = (p: ReachPos): string => p.x + "," + p.y;
const chebyshev = (a: ReachPos, b: ReachPos): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function floorIndex(cells: readonly ReachPos[]): ReadonlySet<string> {
  return new Set(cells.map(key));
}

/** Core 8.8 rule: a one-cell diagonal is allowed only when both side cells are floor. */
function stepDoesNotCutCorner(floor: ReadonlySet<string>, a: ReachPos, b: ReachPos): boolean {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx !== 1 || dy !== 1) return true;
  return floor.has(key({ x: b.x, y: a.y })) && floor.has(key({ x: a.x, y: b.y }));
}

/** Eight-neighbour reachability used by adjacent attacks and berry/tonic targets. */
export function adjacentReachable(
  floor: ReadonlySet<string>,
  from: ReachPos,
  to: ReachPos,
): boolean {
  return chebyshev(from, to) === 1 && stepDoesNotCutCorner(floor, from, to);
}

/** Items may target the acting member or a legal eight-neighbour teammate. */
export function selfOrAdjacentReachable(
  floor: readonly ReachPos[],
  from: ReachPos,
  to: ReachPos,
): boolean {
  if (from.x === to.x && from.y === to.y) return true;
  return adjacentReachable(floorIndex(floor), from, to);
}

/**
 * Core ray rule for front2/line10: axis-aligned or exact 45-degree path,
 * check corner cells at every step, and block on occupied intermediate cells.
 * The endpoint is intentionally not checked against occupied because it is the target.
 */
export function rayReachable(
  floor: ReadonlySet<string>,
  occupied: ReadonlySet<string>,
  from: ReachPos,
  to: ReachPos,
  maxRange: number,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = chebyshev(from, to);
  if (
    length < 1 ||
    length > maxRange ||
    (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy))
  ) return false;

  const step = { x: Math.sign(dx), y: Math.sign(dy) };
  let previous = from;
  for (let i = 1; i <= length; i++) {
    const next = { x: previous.x + step.x, y: previous.y + step.y };
    if (!stepDoesNotCutCorner(floor, previous, next)) return false;
    if (i < length && (!floor.has(key(next)) || occupied.has(key(next)))) return false;
    previous = next;
  }
  return true;
}

const ORDER: readonly ReachPos[] = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

/**
 * Shortest walk from `from` to `to` for click-to-walk: eight directions, one cell per step (the same step rule as a keyboard move:
 * floor only, revealed only, no cutting a wall corner), never through `blocked` cells (living enemies). Straight steps are tried before diagonal ones,
 * so equal-length routes prefer the tidy one. Cells in `avoid` (items, stairs, switches) are crossed only when no other route exists (the walk stops on them).
 * Returns the cells after `from`, ending at `to`, or null when `to` cannot be reached.
 */
export function walkPath(
  floor: ReadonlySet<string>,
  seen: ReadonlySet<string>,
  from: ReachPos,
  to: ReachPos,
  blocked: ReadonlySet<string>,
  avoid: ReadonlySet<string> = new Set(),
): ReachPos[] | null {
  const search = (skipAvoid: boolean): ReachPos[] | null => {
    const start = key(from), goal = key(to);
    if (start === goal || !floor.has(goal) || !seen.has(goal) || blocked.has(goal)) return null;
    const parent = new Map<string, string>([[start, ""]]);
    const queue: ReachPos[] = [from];
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i];
      for (const d of ORDER) {
        const next = { x: at.x + d.x, y: at.y + d.y }, k = key(next);
        if (parent.has(k) || !floor.has(k) || !seen.has(k) || blocked.has(k) || !stepDoesNotCutCorner(floor, at, next)) continue;
        if (skipAvoid && avoid.has(k) && k !== goal) continue;
        parent.set(k, key(at));
        if (k === goal) {
          const path: ReachPos[] = [];
          for (let c = goal; c !== start; c = parent.get(c)!) { const [x, y] = c.split(",").map(Number); path.push({ x, y }); }
          return path.reverse();
        }
        queue.push(next);
      }
    }
    return null;
  };
  return search(true) ?? search(false);
}
