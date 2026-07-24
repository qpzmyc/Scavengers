import { describe, it, expect } from 'vitest';
import { boardCellSize, MIN_CELL_PX } from './boardSize';
import { GRID_SIZE } from '../engine';

describe('boardCellSize', () => {
  it('divides the limiting dimension by the grid size', () => {
    // 660 / 11 = 60 exactly, and height is not the constraint.
    expect(boardCellSize(660, 900)).toBe(60);
  });

  it('is limited by height when height is smaller', () => {
    expect(boardCellSize(900, 660)).toBe(60);
  });

  it('floors to a whole pixel so gridlines do not seam', () => {
    // 665 / 11 = 60.45...
    expect(boardCellSize(665, 900)).toBe(60);
  });

  it('has no upper cap, so large displays get a bigger board', () => {
    // The old implementation capped this at 68.
    expect(boardCellSize(1650, 1650)).toBeGreaterThan(68);
    expect(boardCellSize(1650, 1650)).toBe(150);
  });

  it('never returns less than the minimum, even in a tiny space', () => {
    expect(boardCellSize(100, 100)).toBe(MIN_CELL_PX);
  });

  it('returns the minimum for zero or negative space, rather than 0 or NaN', () => {
    // A ResizeObserver fires once with 0x0 before first layout.
    expect(boardCellSize(0, 0)).toBe(MIN_CELL_PX);
    expect(boardCellSize(-50, 400)).toBe(MIN_CELL_PX);
  });

  it('scales with GRID_SIZE rather than assuming 11', () => {
    expect(boardCellSize(GRID_SIZE * 40, GRID_SIZE * 40)).toBe(40);
  });
});
