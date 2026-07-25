import type { ReactNode } from 'react';
import type { GameState } from '../engine';
import { theme } from '../theme';

interface ScoreStripProps {
  state: GameState;
  onOpenStandings: () => void;
  onOpenKills: () => void;
  // Ready-made kill text for the most recent kill (already colored/worded by the
  // caller — App.tsx and OnlineGame.tsx build kill text differently, so ScoreStrip
  // stays ignorant of both and just renders whatever it's handed). `null` before
  // the first kill of the game.
  lastKill: ReactNode | null;
}

// Hearts are only rendered one-per-life when they're guaranteed to fit. Worst case
// is MAX_DEATH_CAP (6) lives on 4 players = 24 heart glyphs, which does not fit the
// ~210px of strip width available on a 375px phone (24 glyphs need roughly 320px).
// Below this threshold every player's hearts render individually (matching Lives.tsx);
// at or above it each player collapses to one heart glyph + a numeric count (e.g. "♥6").
const MAX_TOTAL_HEARTS_FOR_ICONS = 12;

/**
 * Phone-only summary line. In deathmatch the score is the number a player
 * glances at constantly, so it stays on screen rather than going behind a tap;
 * the full standings and the kills feed open as modals.
 */
export function ScoreStrip({ state, onOpenStandings, onOpenKills, lastKill }: ScoreStripProps) {
  const showScore = state.mode === 'deathmatch';
  const showHeartIcons = state.turnOrder.length * state.deathCap <= MAX_TOTAL_HEARTS_FOR_ICONS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, padding: '8px 10px' }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Leaderboard
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onOpenStandings}
          aria-label="Open standings"
          style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, overflowX: 'auto', background: 'none', border: 'none', padding: 0 }}
        >
          {state.turnOrder.map((id) => {
            const p = state.players[id];
            const remaining = Math.max(0, state.deathCap - p.deaths);
            return (
              <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: p.eliminated ? 0.4 : 1 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                {showScore ? (
                  <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: theme.text }}>
                    {p.score}
                  </span>
                ) : showHeartIcons ? (
                  <span style={{ display: 'flex', gap: 1 }}>
                    {Array.from({ length: state.deathCap }, (_, i) => (
                      <span key={i} style={{ fontSize: 12, lineHeight: 1, color: i < remaining ? p.color : theme.border }}>
                        ♥
                      </span>
                    ))}
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: p.color }}>
                    <span style={{ fontSize: 12, lineHeight: 1 }}>♥</span>
                    {remaining}
                  </span>
                )}
              </span>
            );
          })}
        </button>
        <button
          onClick={onOpenKills}
          aria-label="Open kills feed"
          style={{
            flex: '0 1 42%',
            minWidth: 0,
            maxWidth: '55%',
            fontSize: 12,
            padding: '4px 10px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {lastKill ?? 'No kills yet'}
        </button>
      </div>
    </div>
  );
}
