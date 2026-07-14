import type { GameState, PlayerId } from '../engine';
import { theme } from '../theme';

interface LeaderboardProps {
  state: GameState;
  // Overrides the color-based label per player (e.g. a custom online display name).
  // Falls back to color.toUpperCase() when omitted (hotseat's call sites omit it).
  displayName?: (id: PlayerId) => string;
}

// Fixed row height so rows can be absolutely positioned and slide (transform) between
// ranks when the sort order changes.
const ROW_H = 42;

const cell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 16,
  fontWeight: 600,
  color: theme.text,
  padding: '0 10px',
};

const headCell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '0 10px 6px',
  color: theme.textMuted,
  fontWeight: 500,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

export function Leaderboard({ state, displayName }: LeaderboardProps) {
  const showScore = state.mode === 'deathmatch';
  const ids = state.turnOrder;
  const metricCount = 3 + (showScore ? 1 : 0);
  const gridTemplateColumns = `minmax(0,1fr) repeat(${metricCount}, minmax(52px, auto))`;

  // Rank order, recomputed every render: active players first (removed/eliminated sink
  // to the bottom), then by score descending in deathmatch, with turn order as a stable
  // tie-break. Each player's row is drawn at its rank * ROW_H and CSS-transitions there,
  // so score changes and a player leaving animate as smooth position swaps.
  const ranked = [...ids].sort((a, b) => {
    const pa = state.players[a];
    const pb = state.players[b];
    const ea = pa.eliminated ? 1 : 0;
    const eb = pb.eliminated ? 1 : 0;
    if (ea !== eb) return ea - eb;
    if (showScore && pb.score !== pa.score) return pb.score - pa.score;
    return ids.indexOf(a) - ids.indexOf(b);
  });
  const rankOf = new Map<PlayerId, number>(ranked.map((id, i) => [id, i]));

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        boxShadow: theme.shadow,
        padding: 16,
        minWidth: 240,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Leaderboard</h3>
        {showScore && (
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.accentText }}>
            Target: {state.targetScore}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns }}>
        <div style={{ ...headCell, justifyContent: 'flex-start' }}>Player</div>
        <div style={headCell}>Kills (+5)</div>
        <div style={headCell}>Deaths (-3)</div>
        <div style={headCell}>Streak (+1)</div>
        {showScore && <div style={headCell}>Score</div>}
      </div>

      {/* Positioned rows: each keyed by player id (so React keeps the DOM node) and
          translated to its current rank, with a transition for animated re-ranking. */}
      <div style={{ position: 'relative', height: ids.length * ROW_H }}>
        {ids.map((id) => {
          const p = state.players[id];
          const rank = rankOf.get(id) ?? 0;
          return (
            <div
              key={id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: ROW_H,
                display: 'grid',
                gridTemplateColumns,
                alignItems: 'center',
                borderTop: `1px solid ${theme.border}`,
                boxSizing: 'border-box',
                transform: `translateY(${rank * ROW_H}px)`,
                transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease',
                opacity: p.eliminated ? 0.4 : 1,
              }}
            >
              <div style={{ ...cell, justifyContent: 'flex-start', gap: 8, minWidth: 0 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName ? displayName(p.id) : p.color.toUpperCase()}
                </span>
              </div>
              <div style={cell}>{p.kills}</div>
              <div style={cell}>{p.deaths}</div>
              <div style={cell}>{Math.max(p.longestStreak, p.currentStreak)}</div>
              {showScore && <div style={cell}>{p.score}</div>}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: theme.textMuted }}>Streak = most consecutive turns alive</div>
    </div>
  );
}
