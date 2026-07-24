import { GRID_SIZE } from '../engine';

// Below this the tiles stop being tappable, so the board is allowed to overflow
// its container instead of shrinking further.
export const MIN_CELL_PX = 28;

/**
 * The pixel size of one board tile, given the space the board has to work with.
 *
 * Floored to a whole pixel: fractional tile sizes make the 1px gridlines land on
 * half-pixels and seam visibly. Deliberately has no upper bound — the previous
 * implementation capped this at 68px, which left large displays with a small
 * board floating in empty space.
 */
export function boardCellSize(availW: number, availH: number): number {
  const limiting = Math.min(availW, availH);
  if (!Number.isFinite(limiting) || limiting <= 0) return MIN_CELL_PX;
  return Math.max(MIN_CELL_PX, Math.floor(limiting / GRID_SIZE));
}
