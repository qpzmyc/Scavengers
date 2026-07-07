import { GameState, PlayerId } from './types';

export function checkWinCondition(state: GameState): PlayerId | null {
  const ids: PlayerId[] = ['p1', 'p2'];

  if (state.mode === 'lastStanding') {
    for (const id of ids) {
      if (state.players[id].deaths >= state.deathCap) {
        return ids.find((other) => other !== id) ?? null;
      }
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
