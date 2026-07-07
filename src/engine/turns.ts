import { GameState, PlayerId } from './types';
import { respawnPlayer, tickImmunity } from './respawn';
import { applyKillScoring, incrementStreakScore } from './scoring';
import { checkWinCondition } from './winCondition';

export interface AttackResult {
  state: GameState;
  killedPlayerIds: PlayerId[];
}

export function resolveAttack(attackResult: AttackResult, attackerId: PlayerId): GameState {
  let state = attackResult.state;
  for (const victimId of attackResult.killedPlayerIds) {
    state = applyKillScoring(state, attackerId, victimId);
    state = respawnPlayer(state, victimId);
  }
  const winner = checkWinCondition(state);
  if (winner) {
    state = { ...state, winner };
  }
  return state;
}

export function endTurn(state: GameState, actingPlayerId: PlayerId, gotKill: boolean): GameState {
  if (gotKill) {
    return incrementStreakScore(state, actingPlayerId);
  }

  const nextPlayerId: PlayerId = actingPlayerId === 'p1' ? 'p2' : 'p1';
  let next = incrementStreakScore(state, actingPlayerId);
  next = tickImmunity(next, nextPlayerId);
  return { ...next, currentTurn: nextPlayerId };
}
