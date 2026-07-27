import { GRID_SIZE } from '../engine';

// Below this the tiles stop being tappable, so the board is allowed to overflow
// its container instead of shrinking further.
export const MIN_CELL_PX = 28;

// How much bigger the board renders than its tiles alone, on both axes: the
// board's real rendered size is GRID_SIZE * cell + this. Must be subtracted
// before fitting the board into a measured box, or the board overshoots the box
// it was sized from by this many pixels.
//
// Currently zero, and deliberately still here rather than deleted. Board.tsx has
// no padding and its outer edge is an inset overlay (border-box, so the 1px sits
// over the outermost gridlines rather than outside them), which means the board
// is exactly its tiles. Anything added around the grid later — padding, a
// content-box border, a frame — has to come back here, or the board will
// silently overflow the column it was measured from.
export const BOARD_CHROME_PX = 0;

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
