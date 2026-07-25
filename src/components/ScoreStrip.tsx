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

/**
 * Phone-only summary line. In deathmatch the score is the number a player
 * glances at constantly, so it stays on screen rather than going behind a tap;
 * the full standings and the kills feed open as modals.
 */
export function ScoreStrip({ state, onOpenStandings, onOpenKills, lastKill }: ScoreStripProps) {
  const showScore = state.mode === 'deathmatch';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, padding: '8px 10px' }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Leaderboard
      </span>
      {/* Own row, full strip width. Sharing this row with the kill tracker (the
          old layout) is what squeezed 4 players out of a real 375px phone;
          the tracker now gets its own row below. */}
      <button
        onClick={onOpenStandings}
        aria-label="Open standings"
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0, overflowX: 'auto', background: 'none', border: 'none', padding: 0 }}
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
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: theme.text }}>
                    {remaining}×
                  </span>
                  <span style={{ fontSize: 12, lineHeight: 1, color: p.color }}>♥</span>
                </span>
              )}
            </span>
          );
        })}
      </button>
      {/* Kill tracker's own row: it needed to give up the player row's width, and
          in exchange it now gets the whole 343px before its ellipsis kicks in —
          useful since real kill text ("GREEN shot BLUE") runs much longer than
          "No kills yet". */}
      <button
        onClick={onOpenKills}
        aria-label="Open kills feed"
        style={{
          width: '100%',
          minWidth: 0,
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
  );
}
