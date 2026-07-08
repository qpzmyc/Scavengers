import type React from 'react';
import type { PlayerState, Position } from '../engine';

export interface DeathAnimInfo {
  deathPos: Position;
  // null means the player was ELIMINATED — fade out and stay gone.
  respawnPos: Position | null;
  stage: 'out' | 'in';
}

interface PlayerTokenProps {
  player: PlayerState;
  cellPixelSize: number;
  // When true (the viewer is NOT this token's owner), a phantom hides its real
  // translucent position and shows only the solid "fake" at the display position.
  hideReal?: boolean;
  // Present while this player is being killed/respawned; drives the fade-out/fade-in choreography.
  death?: DeathAnimInfo | null;
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
    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
    transition: 'left 0.3s ease, top 0.3s ease',
    zIndex: 5,
  };
}

export function PlayerToken({ player, cellPixelSize, hideReal = false, death = null }: PlayerTokenProps) {
  if (!player.alive) return null;

  // A player mid-death/respawn is rendered at a fixed spot (death or respawn corner)
  // with a fade keyframe instead of the normal token, overriding phantom rendering too.
  if (death) {
    const pos = death.stage === 'out' ? death.deathPos : (death.respawnPos ?? death.deathPos);
    const style: React.CSSProperties = {
      ...tokenStyle(pos.x, pos.y, cellPixelSize, player.color, 1),
      transition: 'none',
      animation: death.stage === 'out' ? 'deathFadeOut 0.9s ease forwards' : 'deathFadeIn 1.1s ease',
    };
    return <div data-testid={`token-${player.id}-death`} style={style} />;
  }

  if (player.isPhantom && player.phantomDisplayPosition) {
    // Opponent's view: only the fake (solid) token is visible — the real position is hidden.
    if (hideReal) {
      return (
        <div
          data-testid={`token-${player.id}-phantom`}
          style={tokenStyle(player.phantomDisplayPosition.x, player.phantomDisplayPosition.y, cellPixelSize, player.color, 1)}
        />
      );
    }
    // Owner's view: real position shown translucent, fake shown solid.
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
