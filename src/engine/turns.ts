import type { GameState, PlayerId } from './types';
import { respawnPlayer, tickImmunity } from './respawn';
import { applyKillScoring, incrementStreakScore } from './scoring';
import { checkWinCondition } from './winCondition';
import { tickPickups } from './pickups';

export interface AttackResult {
  state: GameState;
  killedPlayerIds: PlayerId[];
}

function eliminatePlayer(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, eliminated: true, alive: false, isPhantom: false, phantomDisplayPosition: null },
    },
  };
}

export function resolveAttack(attackResult: AttackResult, attackerId: PlayerId): GameState {
  let state = attackResult.state;
  for (const victimId of attackResult.killedPlayerIds) {
    state = applyKillScoring(state, attackerId, victimId);
    const victim = state.players[victimId];
    if (state.mode === 'lastStanding' && victim.deaths >= state.deathCap) {
      state = eliminatePlayer(state, victimId);
    } else {
      state = respawnPlayer(state, victimId);
    }
  }
  const winner = checkWinCondition(state);
  if (winner) {
    state = { ...state, winner };
  }
  return state;
}

function nextNonEliminatedPlayerId(state: GameState, afterPlayerId: PlayerId): PlayerId {
  const order = state.turnOrder;
  const startIndex = order.indexOf(afterPlayerId);
  for (let i = 1; i <= order.length; i++) {
    const candidate = order[(startIndex + i) % order.length];
    if (!state.players[candidate].eliminated) {
      return candidate;
    }
  }
  return afterPlayerId;
}

export function endTurn(state: GameState, actingPlayerId: PlayerId, gotKill: boolean): GameState {
  if (gotKill) {
    let next = incrementStreakScore(state, actingPlayerId);
    next = tickPickups(next);
    return next;
  }

  const nextPlayerId: PlayerId = nextNonEliminatedPlayerId(state, actingPlayerId);
  let next = incrementStreakScore(state, actingPlayerId);
  next = tickImmunity(next, nextPlayerId);
  next = tickPickups(next);
  return { ...next, currentTurn: nextPlayerId };
}
