import type { GameState, PlayerId } from './types';

export function checkWinCondition(state: GameState): PlayerId | null {
  const ids = state.turnOrder;

  if (state.mode === 'lastStanding') {
    const remaining = ids.filter((id) => !state.players[id].eliminated);
    if (remaining.length === 1) {
      return remaining[0];
    }
    return null;
  }

  // deathmatch
  for (const id of ids) {
    if (state.players[id].score >= state.targetScore) {
      return id;
    }
  }
  return null;
}
