import type { GameMode } from '../engine';

/**
 * What to call the standings table in this mode. Deathmatch ranks players by
 * score, survival counts what's left of them, so one word cannot honestly cover
 * both. Shared by the phone strip's card label and by the modal title that card
 * opens, which is what stops the two disagreeing — the strip used to say
 * "Leaderboard" in both modes, putting that word over a row of hearts.
 *
 * Its own module rather than an export from ScoreStrip.tsx so that file keeps
 * exporting only components, which is what Fast Refresh needs.
 */
export function standingsLabel(mode: GameMode): string {
  return mode === 'deathmatch' ? 'Leaderboard' : 'Lives';
}
