import { movePlayer } from '../engine';
import type { GameState, PlayerId, Position } from '../engine';
import type { RedTint, DeathAnim } from '../components/Board';
import type { ActionEvent } from './protocol';
import {
  type AnimFrame,
  RESULT_MS,
  MOVE_STEP_MS,
  DEATH_OUT_MS,
  DEATH_IN_MS,
  TINT_FADE_MS,
  TINT_STEP,
  TINT_HOLD_MS,
  computeHitTiles,
  plainFrame,
} from '../game/animation';

interface Victim {
  playerId: PlayerId;
  deathPos: Position;
  respawnPos: Position | null;
}

const PICKUP_TYPES = new Set(['energyPickup', 'bonusEnergyPickup', 'ammoPickup']);

// `after` bakes in any pickups that spawned this transition (a respawn corner bonus,
// or a normal pickup resurfacing via tickPickups). Reverting those tiles to their
// pre-transition state for the ANIMATION frames keeps a freshly-spawned pickup hidden
// until the final commit reveals it — so it pops in exactly as control hands over
// (after the frame's hold), not the instant the last frame starts playing.
function maskFreshPickups(before: GameState, after: GameState): GameState {
  let board: GameState['board'] | null = null;
  for (let y = 0; y < after.board.length; y++) {
    for (let x = 0; x < after.board[y].length; x++) {
      const a = after.board[y][x];
      if (PICKUP_TYPES.has(a.type) && a.type !== before.board[y][x].type) {
        if (!board) board = after.board.map((row) => row.slice());
        board[y][x] = before.board[y][x];
      }
    }
  }
  return board ? { ...after, board } : after;
}

// Death fade-out frame(s) + respawn fade-in frame for the victims of an action.
// `after` already reflects each victim's resolved (respawned or eliminated) position,
// so the 'out' frame must carry the fade from the start (mirrors App.tsx).
function victimsOf(before: GameState, after: GameState, killed: PlayerId[]): Victim[] {
  return killed.map((id) => ({
    playerId: id,
    deathPos: before.players[id].position,
    respawnPos: after.players[id].eliminated ? null : after.players[id].position,
  }));
}
function respawnFrame(after: GameState, victims: Victim[]): AnimFrame[] {
  const respawning = victims.filter((v) => v.respawnPos !== null);
  if (!respawning.length) return [];
  return [
    {
      display: after,
      redTints: [],
      death: respawning.map((v) => ({ playerId: v.playerId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'in' as const })),
      holdMs: DEATH_IN_MS,
    },
  ];
}

// Turn an authoritative (before -> after) transition into the live animation frames.
// PRECONDITION: `before` MUST be exactly the state immediately prior to `event`
// (the frame the viewer currently shows). The move steps and ripple origin are
// re-derived from `before` via movePlayer/computeHitTiles, so a stale `before`
// yields wrong intermediate frames — only the terminal `after` frame is authoritative.
export function buildOnlineFrames(before: GameState, after: GameState, event: ActionEvent): AnimFrame[] {
  const req = event.request;
  const actorId = event.actorId;
  // Board shown DURING the animation: identical to `after` but with any pickups that
  // spawned this transition held back, so they only surface at the final commit.
  const disp = maskFreshPickups(before, after);

  if (req.kind === 'rest' || req.kind === 'fakeMove') {
    if (req.kind === 'fakeMove' && event.killedPlayerIds.length) {
      // The phantom landed on an enemy's real tile: fade the decoy in, then the death out.
      const victims = victimsOf(before, after, event.killedPlayerIds);
      return [
        plainFrame(disp, MOVE_STEP_MS),
        {
          display: disp,
          redTints: [],
          death: victims.map((v) => ({ playerId: v.playerId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'out' as const })),
          holdMs: DEATH_OUT_MS,
        },
        ...respawnFrame(disp, victims),
      ];
    }
    return [plainFrame(disp, RESULT_MS)];
  }

  if (req.kind === 'move') {
    // Step the mover tile-by-tile: snap to the start, then show each intermediate tile.
    const frames: AnimFrame[] = [plainFrame(before, MOVE_STEP_MS)];
    for (let i = 1; i < req.path.length; i++) {
      frames.push(plainFrame(movePlayer(before, actorId, req.path.slice(0, i)), MOVE_STEP_MS));
    }
    if (event.killedPlayerIds.length) {
      // Phantom-crush: no ripple, just the death fade on the after-state.
      const victims = victimsOf(before, after, event.killedPlayerIds);
      frames.push({
        display: disp,
        redTints: [],
        death: victims.map((v) => ({ playerId: v.playerId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'out' as const })),
        holdMs: Math.max(MOVE_STEP_MS, DEATH_OUT_MS),
      });
      frames.push(...respawnFrame(disp, victims));
    } else {
      frames.push(plainFrame(disp, RESULT_MS));
    }
    return frames;
  }

  // attack (with optional reposition path)
  const from: Position = req.path.length ? req.path[req.path.length - 1] : before.players[actorId].position;
  const frames: AnimFrame[] = [];
  if (req.path.length) {
    frames.push(plainFrame(before, MOVE_STEP_MS));
    frames.push(plainFrame(movePlayer(before, actorId, req.path), MOVE_STEP_MS));
  }
  const hitTiles = computeHitTiles(before.board, req.type, from, req.target);
  const tints: RedTint[] = hitTiles.map((p, i) => ({ x: p.x, y: p.y, delayMs: i * TINT_STEP }));
  const maxTintDelay = tints.reduce((m, t) => Math.max(m, t.delayMs), 0);

  if (event.killedPlayerIds.length) {
    const victims = victimsOf(before, after, event.killedPlayerIds);
    const death: DeathAnim[] = victims.map((v) => ({ playerId: v.playerId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'out' as const }));
    frames.push({
      display: disp,
      redTints: tints,
      death,
      holdMs: Math.max(maxTintDelay + TINT_FADE_MS + TINT_HOLD_MS, DEATH_OUT_MS),
    });
    frames.push(...respawnFrame(disp, victims));
  } else {
    frames.push({
      display: disp,
      redTints: tints,
      death: [],
      holdMs: Math.max(RESULT_MS, maxTintDelay + TINT_FADE_MS + TINT_HOLD_MS),
    });
  }
  return frames;
}
