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
  // When true, this token's phantom (fake) marker pulses to signal it's about to be
  // cleared — shown to the owner while they're setting up an attack.
  phantomPulsing?: boolean;
}

function tokenStyle(
  x: number,
  y: number,
  cellPixelSize: number,
  color: string,
  opacity: number,
  immune = false
): React.CSSProperties {
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
    // Immune players get a pulsing cyan halo so both they and would-be attackers can
    // see the attack won't land.
    boxShadow: immune
      ? '0 0 0 3px rgba(120,230,255,0.95), 0 0 10px 3px rgba(120,230,255,0.7), 0 1px 3px rgba(0,0,0,0.4)'
      : '0 1px 3px rgba(0,0,0,0.4)',
    animation: immune ? 'immunePulse 1s ease-in-out infinite' : undefined,
    transition: 'left 0.3s ease, top 0.3s ease',
    zIndex: 5,
  };
}

// The pulsing halo color, reused for the countdown digit so it reads as "the same signal".
const IMMUNE_TEXT_COLOR = 'rgba(120,230,255,0.95)';

const immuneBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: IMMUNE_TEXT_COLOR,
  fontWeight: 700,
  fontSize: '1.5em',
  lineHeight: 1,
  pointerEvents: 'none',
  textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 2px #000',
};

function ImmuneBadge({ turns }: { turns: number }) {
  return <span style={immuneBadgeStyle}>{turns}</span>;
}

export function PlayerToken({ player, cellPixelSize, hideReal = false, death = null, phantomPulsing = false }: PlayerTokenProps) {
  if (!player.alive) return null;
  const immune = player.immuneTurns > 0;
  const phantomAnim = phantomPulsing ? 'phantomVanishPulse 0.8s ease-in-out infinite' : undefined;

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
    // It still carries the immunity halo/badge when the owner is immune, so an immune
    // player's phantom looks identical to their real token and doesn't give itself away.
    if (hideReal) {
      return (
        <div
          data-testid={`token-${player.id}-phantom`}
          style={tokenStyle(player.phantomDisplayPosition.x, player.phantomDisplayPosition.y, cellPixelSize, player.color, 1, immune)}
        >
          {immune && <ImmuneBadge turns={player.immuneTurns} />}
        </div>
      );
    }
    // Owner's view: their real position stays solid; the fake decoy is shown translucent.
    return (
      <>
        <div
          data-testid={`token-${player.id}-real`}
          style={tokenStyle(player.position.x, player.position.y, cellPixelSize, player.color, 1, immune)}
        >
          {immune && <ImmuneBadge turns={player.immuneTurns} />}
        </div>
        <div
          data-testid={`token-${player.id}-phantom`}
          style={{
            ...tokenStyle(player.phantomDisplayPosition.x, player.phantomDisplayPosition.y, cellPixelSize, player.color, 0.35, immune),
            ...(phantomAnim ? { animation: phantomAnim } : {}),
          }}
        >
          {immune && <ImmuneBadge turns={player.immuneTurns} />}
        </div>
      </>
    );
  }

  return (
    <div
      data-testid={`token-${player.id}`}
      style={tokenStyle(player.position.x, player.position.y, cellPixelSize, player.color, 1, immune)}
    >
      {immune && <ImmuneBadge turns={player.immuneTurns} />}
    </div>
  );
}
