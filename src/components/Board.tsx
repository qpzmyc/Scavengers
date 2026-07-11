import type { GameState, Position, PlayerId, PlayerState } from '../engine';
import { GRID_SIZE, visionRadiusForCount } from '../engine';
import { theme, SPAWN_TINT } from '../theme';
import { PlayerToken } from './PlayerToken';

export type HighlightKind = 'candidate' | 'selected' | 'origin' | 'originSelected';

export interface Highlight {
  x: number;
  y: number;
  kind: HighlightKind;
}

// A single tile to briefly tint red for an attack's ripple animation.
// `delayMs` staggers the CSS animation-delay so tiles light up in sequence.
export interface RedTint {
  x: number;
  y: number;
  delayMs: number;
}

export interface DeathAnim {
  playerId: PlayerId;
  deathPos: Position;
  // null means the player was ELIMINATED (fade out and stay gone); a Position means
  // they respawn there.
  respawnPos: Position | null;
  stage: 'out' | 'in';
}

interface BoardProps {
  state: GameState;
  // The player whose perspective the board is drawn from (hidden info + vision).
  viewerId: PlayerId;
  cellPixelSize?: number;
  highlights?: Highlight[];
  onTileClick?: (pos: Position) => void;
  redTints?: RedTint[];
  deathAnims?: DeathAnim[];
  // Tiles a pending (unconfirmed) attack would hit — flashed on a continuous loop
  // to preview the shot, as opposed to `redTints`' one-shot post-confirm ripple.
  previewTints?: Position[];
  // True while the viewer is setting up an attack: their own phantom pulses to show
  // it's about to vanish (attacking clears the phantom).
  attackPreparing?: boolean;
  // Overrides where vision (fog) is centered. Used so an unconfirmed move preview
  // moves the token but NOT the fog — you can't scout by pretending to move.
  visionCenter?: Position;
}

const HIGHLIGHT_STYLES: Record<HighlightKind, { background: string; border: string }> = {
  candidate: { background: theme.candidate, border: `2px solid ${theme.candidateBorder}` },
  selected: { background: theme.selected, border: `2px solid ${theme.selectedBorder}` },
  origin: { background: theme.origin, border: `2px solid ${theme.originBorder}` },
  originSelected: { background: theme.originSelected, border: `2px solid ${theme.originSelectedBorder}` },
};

const euclid = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);

// The position the viewer perceives for a given player: an enemy phantom is seen
// at its fake (display) position; everyone else at their real position.
function perceivedPos(player: PlayerState, isViewer: boolean): Position {
  if (!isViewer && player.isPhantom && player.phantomDisplayPosition) return player.phantomDisplayPosition;
  return player.position;
}

function buildSpawnTints(state: GameState): Map<string, string> {
  const tints = new Map<string, string>();
  for (const id of state.turnOrder) {
    const p = state.players[id];
    const { x0, y0 } = p.cornerZone;
    const tint = SPAWN_TINT[p.color] ?? 'rgba(0,0,0,0.06)';
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        tints.set(`${x0 + dx},${y0 + dy}`, tint);
      }
    }
  }
  return tints;
}

function PickupMarker({ type, size }: { type: 'energyPickup' | 'bonusEnergyPickup' | 'ammoPickup'; size: number }) {
  const color = type === 'ammoPickup' ? theme.ammo : theme.energy;
  const d = Math.max(8, size * 0.34);
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: d,
        height: d,
        transform: 'translate(-50%, -50%) rotate(45deg)',
        borderRadius: 3,
        background: color,
        boxShadow: `0 0 0 2px ${theme.surface}`,
      }}
    />
  );
}

export function Board({
  state,
  viewerId,
  cellPixelSize = 40,
  highlights = [],
  onTileClick,
  redTints = [],
  deathAnims = [],
  previewTints = [],
  attackPreparing = false,
  visionCenter,
}: BoardProps) {
  const highlightMap = new Map<string, HighlightKind>();
  for (const h of highlights) highlightMap.set(`${h.x},${h.y}`, h.kind);
  const spawnTints = buildSpawnTints(state);
  // Vision follows visionCenter when provided (keeps fog fixed during an unconfirmed
  // move preview); otherwise it tracks the viewer's shown position.
  const viewerPos = visionCenter ?? state.players[viewerId].position;
  // Circular (Euclidean) vision. Tiles are "seen" if their center is within the
  // vision radius; the +0.5 keeps a tile whose center just crosses the edge lit.
  // The radius depends on the player count (4-player games see less).
  const visionRadius = visionRadiusForCount(state.turnOrder.length);
  const canSee = (pos: Position) => euclid(viewerPos, pos) <= visionRadius + 0.5;

  // Center of the viewer's tile, in board-pixel space (matching the +6 tile inset).
  const viewCx = 6 + (viewerPos.x + 0.5) * cellPixelSize;
  const viewCy = 6 + (viewerPos.y + 0.5) * cellPixelSize;
  const visRadiusPx = (visionRadius + 0.5) * cellPixelSize;

  const renderToken = (id: PlayerId) => {
    const p = state.players[id];
    if (!p.alive) return null;
    const isViewer = id === viewerId;
    if (!isViewer && !canSee(perceivedPos(p, false))) return null; // enemy out of vision
    const death = deathAnims.find((d) => d.playerId === id) ?? null;
    return (
      <PlayerToken
        key={id}
        player={p}
        cellPixelSize={cellPixelSize}
        hideReal={!isViewer}
        death={death}
        phantomPulsing={isViewer && attackPreparing}
      />
    );
  };

  return (
    <div
      style={{
        position: 'relative',
        width: GRID_SIZE * cellPixelSize,
        height: GRID_SIZE * cellPixelSize,
        flexShrink: 0,
        padding: 6,
        background: theme.boardBg,
        borderRadius: theme.radius + 4,
        boxShadow: theme.shadow,
        boxSizing: 'content-box',
      }}
    >
      {state.board.map((row, y) =>
        row.map((tile, x) => {
          const kind = highlightMap.get(`${x},${y}`);
          const clickable = kind !== undefined && onTileClick;
          const isWallTile = tile.type === 'wall';
          const spawnTint = spawnTints.get(`${x},${y}`);
          const baseBg = isWallTile ? theme.wall : spawnTint ?? theme.tile;
          const visible = canSee({ x, y });
          return (
            <div
              key={`${x}-${y}`}
              data-testid={`tile-${x}-${y}`}
              onClick={clickable ? () => onTileClick!({ x, y }) : undefined}
              style={{
                position: 'absolute',
                left: x * cellPixelSize + 6,
                top: y * cellPixelSize + 6,
                width: cellPixelSize,
                height: cellPixelSize,
                backgroundColor: baseBg,
                backgroundImage: kind
                  ? `linear-gradient(${HIGHLIGHT_STYLES[kind].background}, ${HIGHLIGHT_STYLES[kind].background})`
                  : undefined,
                border: kind ? HIGHLIGHT_STYLES[kind].border : `1px solid ${theme.tileBorder}`,
                boxSizing: 'border-box',
                cursor: clickable ? 'pointer' : 'default',
                zIndex: kind ? 3 : 1,
              }}
            >
              {visible && (tile.type === 'energyPickup' || tile.type === 'bonusEnergyPickup' || tile.type === 'ammoPickup') && (
                <PickupMarker type={tile.type} size={cellPixelSize} />
              )}
            </div>
          );
        })
      )}
      {/* Circular "flashlight" fog: transparent within the vision radius, fading to
          dark beyond it, centered on the viewer. Softer and rounder than per-tile boxes. */}
      <div
        style={{
          position: 'absolute',
          inset: 6,
          pointerEvents: 'none',
          zIndex: 4,
          background: `radial-gradient(circle ${visRadiusPx}px at ${viewCx - 6}px ${viewCy - 6}px, rgba(6,8,13,0) 78%, rgba(6,8,13,0.5) 90%, rgba(6,8,13,0.88) 100%)`,
        }}
      />
      <div style={{ position: 'absolute', left: 6, top: 6, zIndex: 5 }}>
        {state.turnOrder.map((id) => renderToken(id))}
      </div>
      {redTints.map((t, i) => (
        <div
          key={`tint-${t.x}-${t.y}-${i}`}
          style={{
            position: 'absolute',
            left: t.x * cellPixelSize + 6,
            top: t.y * cellPixelSize + 6,
            width: cellPixelSize,
            height: cellPixelSize,
            // Caps at 50% opacity (redTintOn fades to opacity:1) so it reads as a
            // tint over the tile rather than a solid red square.
            background: 'rgba(231, 76, 60, 0.5)',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: 6,
            // Fade in (staggered by delayMs) and hold lit; the whole set is cleared
            // together when the animation frame ends. Duration matches TINT_FADE_MS.
            animation: 'redTintOn 0.17s ease-out',
            animationDelay: `${t.delayMs}ms`,
            animationFillMode: 'forwards',
          }}
        />
      ))}
      {previewTints.map((t, i) => (
        <div
          key={`preview-tint-${t.x}-${t.y}-${i}`}
          style={{
            position: 'absolute',
            left: t.x * cellPixelSize + 6,
            top: t.y * cellPixelSize + 6,
            width: cellPixelSize,
            height: cellPixelSize,
            // Pulses between faint and 50% (redTintPulseLoop peaks at opacity:1).
            background: 'rgba(231, 76, 60, 0.5)',
            pointerEvents: 'none',
            zIndex: 6,
            animation: 'redTintPulseLoop 0.9s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}
