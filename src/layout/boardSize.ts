import { GRID_SIZE } from '../engine';

// Below this the tiles stop being tappable, so the board is allowed to overflow
// its container instead of shrinking further.
export const MIN_CELL_PX = 28;

// Board.tsx renders content-box with 6px padding each side, so the board's
// real rendered size is GRID_SIZE * cell + this, on both axes. Must be
// subtracted before fitting the board into a measured box, or the board
// overshoots the box it was sized from by this many pixels.
export const BOARD_CHROME_PX = 12;

/**
 * The pixel size of one board tile, given the space the board has to work with.
 *
 * Floored to a whole pixel: fractional tile sizes make the 1px gridlines land on
 * half-pixels and seam visibly. Deliberately has no upper bound — the previous
 * implementation capped this at 68px, which left large displays with a small
 * board floating in empty space.
 */
export function boardCellSize(availW: number, availH: number): number {
  const limiting = Math.min(availW, availH) - BOARD_CHROME_PX;
  if (!Number.isFinite(limiting) || limiting <= 0) return MIN_CELL_PX;
  return Math.max(MIN_CELL_PX, Math.floor(limiting / GRID_SIZE));
}
