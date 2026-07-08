import type { Tile, Position } from './types';
import { GRID_SIZE } from './constants';

export function buildBoard(): Tile[][] {
  const board: Tile[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({ type: 'empty' });
    }
    board.push(row);
  }

  const set = (x: number, y: number, type: Tile['type']) => {
    board[y][x] = { type };
  };

  // Four corners of the central 5x5 -> energy pickups
  set(3, 3, 'energyPickup');
  set(7, 3, 'energyPickup');
  set(3, 7, 'energyPickup');
  set(7, 7, 'energyPickup');

  // Dead center -> wall
  set(5, 5, 'wall');

  // 3 random distinct cells within the central 3x3 (excluding center wall) -> ammo pickups
  const centralCells: Position[] = [];
  for (let x = 4; x <= 6; x++) {
    for (let y = 4; y <= 6; y++) {
      if (x === 5 && y === 5) continue;
      centralCells.push({ x, y });
    }
  }
  const shuffled = centralCells.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const cell of shuffled.slice(0, 3)) {
    set(cell.x, cell.y, 'ammoPickup');
  }

  // Edge-midpoint walls
  set(5, 0, 'wall');
  set(5, 1, 'wall');
  set(5, 9, 'wall');
  set(5, 10, 'wall');
  set(0, 5, 'wall');
  set(1, 5, 'wall');
  set(9, 5, 'wall');
  set(10, 5, 'wall');

  return board;
}

export function isInBounds(pos: Position): boolean {
  return pos.x >= 0 && pos.x < GRID_SIZE && pos.y >= 0 && pos.y < GRID_SIZE;
}

export function getTile(board: Tile[][], pos: Position): Tile {
  return board[pos.y][pos.x];
}

export function isWall(board: Tile[][], pos: Position): boolean {
  return isInBounds(pos) && getTile(board, pos).type === 'wall';
}
