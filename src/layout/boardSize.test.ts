import { describe, it, expect } from 'vitest';
import { boardCellSize, BOARD_CHROME_PX, MIN_CELL_PX } from './boardSize';
import { GRID_SIZE } from '../engine';

describe('boardCellSize', () => {
  it('divides the limiting dimension by the grid size, after removing the board chrome', () => {
    // (672 - 12) / 11 = 60 exactly, and height is not the constraint.
    expect(boardCellSize(672, 900)).toBe(60);
  });

  it('is limited by height when height is smaller', () => {
    expect(boardCellSize(900, 672)).toBe(60);
  });

  it('floors to a whole pixel so gridlines do not seam', () => {
    // (678 - 12) / 11 = 666 / 11 = 60.5454... (floors to 60, but rounds to 61).
    // Verified by temporarily swapping the implementation's Math.floor for
    // Math.round: this case fails under Math.round (61 !== 60), confirming
    // the test actually distinguishes the two.
    expect(boardCellSize(678, 900)).toBe(60);
  });

  it('has no upper cap, so large displays get a bigger board', () => {
    // The old implementation capped this at 68. (1662 - 12) / 11 = 150 exactly.
    expect(boardCellSize(1662, 1662)).toBeGreaterThan(68);
    expect(boardCellSize(1662, 1662)).toBe(150);
  });

  it('never returns less than the minimum, even in a tiny space', () => {
    expect(boardCellSize(100, 100)).toBe(MIN_CELL_PX);
  });

  it('returns the minimum for zero or negative space, rather than 0 or NaN', () => {
    // A ResizeObserver fires once with 0x0 before first layout.
    expect(boardCellSize(0, 0)).toBe(MIN_CELL_PX);
    expect(boardCellSize(-50, 400)).toBe(MIN_CELL_PX);
    // Also covers a box smaller than the chrome itself, where subtracting
    // BOARD_CHROME_PX would otherwise go negative.
    expect(boardCellSize(10, 10)).toBe(MIN_CELL_PX);
  });

  it('scales with GRID_SIZE rather than assuming 11', () => {
    expect(boardCellSize(GRID_SIZE * 40 + BOARD_CHROME_PX, GRID_SIZE * 40 + BOARD_CHROME_PX)).toBe(
      40
    );
  });

  it('never renders a board larger than the box it was measured from', () => {
    // The rendered board is GRID_SIZE * cellSize + BOARD_CHROME_PX on both axes
    // (Board.tsx: content-box, 6px padding each side). That must never exceed
    // the smaller of the measured box's two dimensions. Sizes here are kept
    // well clear of the MIN_CELL_PX floor, where overflow is intentional.
    const sizes: Array<[number, number]> = [
      [500, 800],
      [800, 500],
      [1024, 768],
      [1280, 800],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
      [700, 700],
      [667, 900],
      [901, 899],
    ];
    for (const [w, h] of sizes) {
      const cell = boardCellSize(w, h);
      expect(GRID_SIZE * cell + BOARD_CHROME_PX).toBeLessThanOrEqual(Math.min(w, h));
    }
  });
});
