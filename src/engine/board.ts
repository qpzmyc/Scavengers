import { Tile, Position } from './types';
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

  // Outer ring of center 5x5 (x,y in [3,7], border cells) -> energy pickups
  for (let x = 3; x <= 7; x++) {
    for (let y = 3; y <= 7; y++) {
      if (x === 3 || x === 7 || y === 3 || y === 7) {
        set(x, y, 'energyPickup');
      }
    }
  }

  // Border of inner 3x3 (x,y in [4,6]) -> ammo pickups
  for (let x = 4; x <= 6; x++) {
    for (let y = 4; y <= 6; y++) {
      if (x === 4 || x === 6 || y === 4 || y === 6) {
        set(x, y, 'ammoPickup');
      }
    }
  }

  // Dead center -> wall (overrides ammo pickup at 5,5 set above)
  set(5, 5, 'wall');

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
