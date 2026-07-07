import { GameState, PlayerId } from './types';
import { KILL_SCORE, DEATH_SCORE, STREAK_SCORE_PER_TURN } from './constants';

export function applyKillScoring(state: GameState, killerId: PlayerId, victimId: PlayerId): GameState {
  const killer = state.players[killerId];
  const victim = state.players[victimId];
  return {
    ...state,
    players: {
      ...state.players,
      [killerId]: { ...killer, kills: killer.kills + 1, score: killer.score + KILL_SCORE },
      [victimId]: {
        ...victim,
        deaths: victim.deaths + 1,
        score: victim.score + DEATH_SCORE,
        longestStreak: Math.max(victim.longestStreak, victim.currentStreak),
      },
    },
  };
}

export function incrementStreakScore(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        currentStreak: player.currentStreak + 1,
        score: player.score + STREAK_SCORE_PER_TURN,
      },
    },
  };
}
