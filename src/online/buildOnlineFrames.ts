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

  if (req.kind === 'rest' || req.kind === 'fakeMove') {
    return [plainFrame(after, RESULT_MS)];
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
        display: after,
        redTints: [],
        death: victims.map((v) => ({ playerId: v.playerId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'out' as const })),
        holdMs: Math.max(MOVE_STEP_MS, DEATH_OUT_MS),
      });
      frames.push(...respawnFrame(after, victims));
    } else {
      frames.push(plainFrame(after, RESULT_MS));
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
      display: after,
      redTints: tints,
      death,
      holdMs: Math.max(maxTintDelay + TINT_FADE_MS + TINT_HOLD_MS, DEATH_OUT_MS),
    });
    frames.push(...respawnFrame(after, victims));
  } else {
    frames.push({
      display: after,
      redTints: tints,
      death: [],
      holdMs: Math.max(RESULT_MS, maxTintDelay + TINT_FADE_MS + TINT_HOLD_MS),
    });
  }
  return frames;
}
