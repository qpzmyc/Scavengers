import type { GameState } from '../engine';
import { GRID_SIZE } from '../engine';
import { PlayerToken } from './PlayerToken';

interface BoardProps {
  state: GameState;
  cellPixelSize?: number;
}

const TILE_COLORS: Record<string, string> = {
  empty: '#e8e8e8',
  wall: '#444444',
  energyPickup: '#f6d743',
  ammoPickup: '#f2994a',
};

export function Board({ state, cellPixelSize = 40 }: BoardProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: GRID_SIZE * cellPixelSize,
        height: GRID_SIZE * cellPixelSize,
      }}
    >
      {state.board.map((row, y) =>
        row.map((tile, x) => (
          <div
            key={`${x}-${y}`}
            data-testid={`tile-${x}-${y}`}
            style={{
              position: 'absolute',
              left: x * cellPixelSize,
              top: y * cellPixelSize,
              width: cellPixelSize,
              height: cellPixelSize,
              backgroundColor: TILE_COLORS[tile.type],
              border: '1px solid #ccc',
              boxSizing: 'border-box',
            }}
          />
        ))
      )}
      <PlayerToken player={state.players.p1} cellPixelSize={cellPixelSize} />
      <PlayerToken player={state.players.p2} cellPixelSize={cellPixelSize} />
    </div>
  );
}
