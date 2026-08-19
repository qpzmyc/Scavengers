/**
 * The look of a score change: the two colours, the two row washes behind them,
 * and the sign the number is written with.
 *
 * Its own module rather than exports from Leaderboard.tsx for the same reason
 * standingsLabel.ts is: a file that exports anything besides components loses
 * Fast Refresh. Shared because the leaderboard row and the phone's ScoreStrip
 * show the same +5 / −3, and each used to carry its own copy of these literals.
 */

// Green for a gain, red for a loss. Both are also player colours here, so the
// sign carries the meaning on its own and the colour only reinforces it.
export const GAIN = '#4ade80';
export const LOSS = '#f87171';

// The same two colours behind the whole row. Kept faint: this sits under the
// player's name and their score, and both have to stay readable through it.
export const GAIN_WASH = 'rgba(74, 222, 128, 0.16)';
export const LOSS_WASH = 'rgba(248, 113, 113, 0.16)';

/**
 * `String(-3)` gives a hyphen, which is not the character the scoring legend
 * beside it uses, so a minus sign was rendered two different ways a few pixels
 * apart. Everything that prints a delta goes through here.
 */
export function formatDelta(amount: number): string {
  return amount >= 0 ? `+${amount}` : `−${Math.abs(amount)}`;
}
