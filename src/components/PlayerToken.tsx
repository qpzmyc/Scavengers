import type React from 'react';
import type { PlayerState } from '../engine';

interface PlayerTokenProps {
  player: PlayerState;
  cellPixelSize: number;
}

function tokenStyle(x: number, y: number, cellPixelSize: number, color: string, opacity: number): React.CSSProperties {
  return {
    position: 'absolute',
    left: x * cellPixelSize + cellPixelSize * 0.1,
    top: y * cellPixelSize + cellPixelSize * 0.1,
    width: cellPixelSize * 0.8,
    height: cellPixelSize * 0.8,
    borderRadius: '50%',
    backgroundColor: color,
    opacity,
    pointerEvents: 'none',
  };
}

export function PlayerToken({ player, cellPixelSize }: PlayerTokenProps) {
  if (!player.alive) return null;

  if (player.isPhantom && player.phantomDisplayPosition) {
    return (
      <>
        <div
          data-testid={`token-${player.id}-real`}
          style={tokenStyle(player.position.x, player.position.y, cellPixelSize, player.color, 0.35)}
        />
        <div
          data-testid={`token-${player.id}-phantom`}
          style={tokenStyle(player.phantomDisplayPosition.x, player.phantomDisplayPosition.y, cellPixelSize, player.color, 1)}
        />
      </>
    );
  }

  return (
    <div
      data-testid={`token-${player.id}`}
      style={tokenStyle(player.position.x, player.position.y, cellPixelSize, player.color, 1)}
    />
  );
}
