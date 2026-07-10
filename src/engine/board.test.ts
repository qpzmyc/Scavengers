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

  it('places energy pickups at the four corners of the central 5x5', () => {
    const board = buildBoard();
    expect(getTile(board, { x: 3, y: 3 }).type).toBe('energyPickup');
    expect(getTile(board, { x: 7, y: 3 }).type).toBe('energyPickup');
    expect(getTile(board, { x: 3, y: 7 }).type).toBe('energyPickup');
    expect(getTile(board, { x: 7, y: 7 }).type).toBe('energyPickup');
  });

  it('places exactly 4 energy pickups and 3 ammo pickups on the board', () => {
    const board = buildBoard();
    let energyCount = 0;
    let ammoCount = 0;
    let ammoInCentral = 0;
    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[y].length; x++) {
        const type = board[y][x].type;
        if (type === 'energyPickup') energyCount++;
        if (type === 'ammoPickup') {
          ammoCount++;
          const inCentral = x >= 4 && x <= 6 && y >= 4 && y <= 6 && !(x === 5 && y === 5);
          if (inCentral) ammoInCentral++;
        }
      }
    }
    expect(energyCount).toBe(4);
    expect(ammoCount).toBe(3);
    expect(ammoInCentral).toBe(3);
  });

  it('places 3 ammo pickups by default (2-player games)', () => {
    const board = buildBoard();
    let ammoCount = 0;
    for (const row of board) {
      for (const tile of row) {
        if (tile.type === 'ammoPickup') ammoCount += 1;
      }
    }
    expect(ammoCount).toBe(3);
  });

  it('places 4 ammo pickups in 4-player games', () => {
    const board = buildBoard(4);
    let ammoCount = 0;
    for (const row of board) {
      for (const tile of row) {
        if (tile.type === 'ammoPickup') ammoCount += 1;
      }
    }
    expect(ammoCount).toBe(4);
  });

  it('never places an ammo pickup on the center wall cell', () => {
    const board = buildBoard();
    expect(getTile(board, { x: 5, y: 5 }).type).toBe('wall');
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
