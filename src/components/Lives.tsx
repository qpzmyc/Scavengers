import type { GameState, PlayerId } from '../engine';
import { theme } from '../theme';

interface LivesProps {
  state: GameState;
  // Overrides the color-based label per player (e.g. a custom online display name).
  // Falls back to color.toUpperCase() when omitted (hotseat's call sites omit it).
  displayName?: (id: PlayerId) => string;
  // Set when a Modal title already names this table, so the word doesn't appear
  // twice a few pixels apart.
  titledExternally?: boolean;
}

export function Lives({ state, displayName, titledExternally }: LivesProps) {
  const players = state.turnOrder.map((id) => state.players[id]);

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
      {!titledExternally && <h3 style={{ marginBottom: 10, fontSize: 15 }}>Lives</h3>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {players.map((p) => {
          const remaining = Math.max(0, state.deathCap - p.deaths);
          const hearts = Array.from({ length: state.deathCap }, (_, i) => i < remaining);

          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                opacity: p.eliminated ? 0.45 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: p.color,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{displayName ? displayName(p.id) : p.color.toUpperCase()}</span>
                {p.eliminated && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.6,
                      color: theme.textMuted,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 4,
                      padding: '1px 5px',
                    }}
                  >
                    OUT
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 3, paddingLeft: 26 }}>
                {hearts.map((filled, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 16,
                      lineHeight: 1,
                      color: filled ? p.color : theme.border,
                    }}
                  >
                    ♥
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
