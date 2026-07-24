import type { GameState } from '../engine';
import { theme } from '../theme';

interface ScoreStripProps {
  state: GameState;
  onOpenStandings: () => void;
  onOpenKills: () => void;
  killCount: number;
}

/**
 * Phone-only summary line. In deathmatch the score is the number a player
 * glances at constantly, so it stays on screen rather than going behind a tap;
 * the full standings and the kills feed open as modals.
 */
export function ScoreStrip({ state, onOpenStandings, onOpenKills, killCount }: ScoreStripProps) {
  const showScore = state.mode === 'deathmatch';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, padding: '8px 10px' }}>
      <button
        onClick={onOpenStandings}
        aria-label="Open standings"
        style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, overflowX: 'auto', background: 'none', border: 'none', padding: 0 }}
      >
        {state.turnOrder.map((id) => {
          const p = state.players[id];
          return (
            <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: p.eliminated ? 0.4 : 1 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
              <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: theme.text }}>
                {showScore ? p.score : Math.max(0, state.deathCap - p.deaths)}
              </span>
            </span>
          );
        })}
      </button>
      <button onClick={onOpenKills} aria-label="Open kills feed" style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}>
        Kills {killCount > 0 ? killCount : ''}
      </button>
    </div>
  );
}
