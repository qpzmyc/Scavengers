import type { GameState, Position, PlayerId } from '../engine';
import { isInBounds, isWall, traceLine } from '../engine';
import type { RedTint, DeathAnim } from '../components/Board';

// ---- Timing (ms) shared by live 'result' play and opponent replays/live online play ----
export const RESULT_MS = 1200;     // how long an actor sees their own outcome before handoff
export const MOVE_STEP_MS = 550;   // hold time for an intermediate step of a 2-tile move
export const DEATH_OUT_MS = 1100;  // hold time for the death fade-out frame
export const DEATH_IN_MS = 600;    // hold time for the death fade-in (respawn) frame
export const TINT_FADE_MS = 170;   // per-tile fade-in duration (matches Board's redTintOn)
export const TINT_STEP = 110;      // per-tile stagger for the attack ripple
export const TINT_HOLD_MS = 1400;  // dwell with every tile lit before they clear

// A single step of an animated sequence: the board/player state to show, the tint
// overlays and death-fade info active during this step, and how long to hold it.
export interface AnimFrame {
  display: GameState;
  redTints: RedTint[];
  death: DeathAnim[];
  holdMs: number;
  // Which player's turn produced this frame (used to label hotseat replays by color).
  actorId?: PlayerId;
}

export const plainFrame = (display: GameState, holdMs: number): AnimFrame => ({ display, redTints: [], death: [], holdMs });

export const DIRS8: Position[] = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
];

export const eq = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

export function neighbors(board: GameState['board'], from: Position): Position[] {
  return DIRS8.map((d) => ({ x: from.x + d.x, y: from.y + d.y })).filter(
    (p) => isInBounds(p) && !isWall(board, p)
  );
}

export function rayTiles(from: Position): Position[] {
  const tiles: Position[] = [];
  for (const d of DIRS8) {
    let c = { x: from.x + d.x, y: from.y + d.y };
    while (isInBounds(c)) {
      tiles.push(c);
      c = { x: c.x + d.x, y: c.y + d.y };
    }
  }
  return tiles;
}

// The tiles a punch/shoot/bomb would actually hit from `from`, aimed at `target`.
export function computeHitTiles(
  board: GameState['board'],
  type: 'punch' | 'shoot' | 'bomb',
  from: Position,
  target: Position
): Position[] {
  if (type === 'shoot') {
    const dir = { x: target.x - from.x, y: target.y - from.y };
    return traceLine(board, from, dir);
  }
  if (type === 'bomb') {
    const tiles: Position[] = [{ x: target.x, y: target.y }];
    for (const d of DIRS8) {
      const p = { x: target.x + d.x, y: target.y + d.y };
      if (isInBounds(p)) tiles.push(p);
    }
    return tiles;
  }
  // punch: the targeted ring tile plus its two neighbors in the ring of 8 around the origin.
  const ringIdx = DIRS8.findIndex((d) => eq({ x: from.x + d.x, y: from.y + d.y }, target));
  const idxs = ringIdx === -1 ? [] : [(ringIdx - 1 + 8) % 8, ringIdx, (ringIdx + 1) % 8];
  const tiles: Position[] = [];
  for (const k of idxs) {
    const d = DIRS8[k];
    const p = { x: from.x + d.x, y: from.y + d.y };
    if (isInBounds(p)) tiles.push(p);
  }
  return tiles;
}
