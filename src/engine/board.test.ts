import { describe, it, expect } from 'vitest';
import { buildBoard, isInBounds, getTile, isWall } from './board';
import { GRID_SIZE } from './constants';

describe('buildBoard', () => {
  it('creates an 11x11 board', () => {
    const board = buildBoard();
    expect(board.length).toBe(GRID_SIZE);
    expect(board[0].length).toBe(GRID_SIZE);
  });

  it('places the center wall at (5,5)', () => {
    const board = buildBoard();
    expect(getTile(board, { x: 5, y: 5 }).type).toBe('wall');
  });

  it('places edge-midpoint walls', () => {
    const board = buildBoard();
    expect(getTile(board, { x: 5, y: 0 }).type).toBe('wall');
    expect(getTile(board, { x: 5, y: 1 }).type).toBe('wall');
    expect(getTile(board, { x: 5, y: 9 }).type).toBe('wall');
    expect(getTile(board, { x: 5, y: 10 }).type).toBe('wall');
    expect(getTile(board, { x: 0, y: 5 }).type).toBe('wall');
    expect(getTile(board, { x: 1, y: 5 }).type).toBe('wall');
    expect(getTile(board, { x: 9, y: 5 }).type).toBe('wall');
    expect(getTile(board, { x: 10, y: 5 }).type).toBe('wall');
  });

  it('places energy pickups on the outer ring of the center 5x5', () => {
    const board = buildBoard();
    expect(getTile(board, { x: 3, y: 3 }).type).toBe('energyPickup');
    expect(getTile(board, { x: 7, y: 7 }).type).toBe('energyPickup');
    expect(getTile(board, { x: 5, y: 3 }).type).toBe('energyPickup');
  });

  it('places ammo pickups on the middle ring (border of inner 3x3)', () => {
    const board = buildBoard();
    expect(getTile(board, { x: 4, y: 4 }).type).toBe('ammoPickup');
    expect(getTile(board, { x: 6, y: 6 }).type).toBe('ammoPickup');
    expect(getTile(board, { x: 5, y: 4 }).type).toBe('ammoPickup');
  });

  it('leaves most tiles empty', () => {
    const board = buildBoard();
    expect(getTile(board, { x: 0, y: 0 }).type).toBe('empty');
  });
});

describe('isInBounds', () => {
  it('accepts tiles inside the grid', () => {
    expect(isInBounds({ x: 0, y: 0 })).toBe(true);
    expect(isInBounds({ x: 10, y: 10 })).toBe(true);
  });

  it('rejects tiles outside the grid', () => {
    expect(isInBounds({ x: -1, y: 0 })).toBe(false);
    expect(isInBounds({ x: 11, y: 0 })).toBe(false);
    expect(isInBounds({ x: 0, y: 11 })).toBe(false);
  });
});

describe('isWall', () => {
  it('returns true for a wall tile', () => {
    const board = buildBoard();
    expect(isWall(board, { x: 5, y: 5 })).toBe(true);
  });

  it('returns false for a non-wall tile', () => {
    const board = buildBoard();
    expect(isWall(board, { x: 0, y: 0 })).toBe(false);
  });
});
