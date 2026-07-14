import type { GameState, PlayerId } from './types';

export function checkWinCondition(state: GameState): PlayerId | null {
  const ids = state.turnOrder;

  // Last player standing wins in BOTH modes: once everyone else is gone — eliminated
  // in survival, or removed after leaving an online game — the sole remaining player
  // wins immediately, even in deathmatch before anyone reaches the target score.
  const remaining = ids.filter((id) => !state.players[id].eliminated);
  if (remaining.length === 1) {
    return remaining[0];
  }

  if (state.mode === 'lastStanding') {
    return null;
  }

  // deathmatch: first to the target score
  for (const id of ids) {
    if (state.players[id].score >= state.targetScore) {
      return id;
    }
  }
  return null;
}
