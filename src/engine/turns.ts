import type { GameState, PlayerId } from './types';
import { respawnPlayer, tickImmunity } from './respawn';
import { applyKillScoring, incrementStreakScore } from './scoring';
import { checkWinCondition } from './winCondition';
import { tickPickups, spawnRespawnCornerPickup } from './pickups';

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
  const eliminatedThisAttack: PlayerId[] = [];
  for (const victimId of attackResult.killedPlayerIds) {
    state = applyKillScoring(state, attackerId, victimId);
    const victim = state.players[victimId];
    if (state.mode === 'lastStanding' && victim.deaths >= state.deathCap) {
      state = eliminatePlayer(state, victimId);
      eliminatedThisAttack.push(victimId);
    } else {
      state = respawnPlayer(state, victimId);
      // Don't spawn the corner pickup yet — a kill grants the attacker an extra turn,
      // during which they could go on to score another kill (and another, ...). Queue
      // it and flush once the attacker's turn actually passes (see endTurn).
      state = { ...state, pendingCornerPickups: [...state.pendingCornerPickups, victimId] };
    }
  }
  // Draw: this single blast eliminated everyone who was still in the game (only possible
  // when a bomb catches the thrower and every remaining opponent, each on their last
  // life). Record the finalists, in turn order, for the shared "…Win!" screen.
  if (state.mode === 'lastStanding' && state.turnOrder.every((id) => state.players[id].eliminated)) {
    const draw = state.turnOrder.filter((id) => eliminatedThisAttack.includes(id));
    return { ...state, draw };
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

// Spawn `playerId`'s queued respawn corner bonus right before they take their turn,
// and drop them from the queue. A no-op if they have nothing queued. Any other queued
// victims keep waiting until the turn actually reaches each of them, so a multi-kill's
// bonuses appear staggered (each just ahead of its owner's next turn), not all at once.
function flushCornerPickup(state: GameState, playerId: PlayerId): GameState {
  if (!state.pendingCornerPickups.includes(playerId)) return state;
  const spawned = spawnRespawnCornerPickup(state, playerId);
  return { ...spawned, pendingCornerPickups: spawned.pendingCornerPickups.filter((id) => id !== playerId) };
}

export function endTurn(state: GameState, actingPlayerId: PlayerId, gotKill: boolean): GameState {
  if (gotKill) {
    let next = incrementStreakScore(state, actingPlayerId);
    next = tickPickups(next);
    // The same player takes an extra turn. If they bombed themselves and respawned,
    // the turn preceding their next turn is their own — so spawn their queued corner
    // bonus now, right before that extra turn.
    next = flushCornerPickup(next, actingPlayerId);
    return next;
  }

  const nextPlayerId: PlayerId = nextNonEliminatedPlayerId(state, actingPlayerId);
  let next = incrementStreakScore(state, actingPlayerId);
  next = tickImmunity(next, nextPlayerId);
  next = tickPickups(next);
  next = flushCornerPickup(next, nextPlayerId);
  return { ...next, currentTurn: nextPlayerId };
}
