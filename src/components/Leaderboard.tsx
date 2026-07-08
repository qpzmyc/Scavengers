import type { GameState } from '../engine';
import { theme } from '../theme';

interface LeaderboardProps {
  state: GameState;
}

const th: React.CSSProperties = {
  textAlign: 'right',
  padding: '6px 10px',
  color: theme.textMuted,
  fontWeight: 500,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const td: React.CSSProperties = {
  textAlign: 'right',
  padding: '8px 10px',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 16,
  fontWeight: 600,
  color: theme.text,
};

export function Leaderboard({ state }: LeaderboardProps) {
  const players = state.turnOrder.map((id) => state.players[id]);
  const showScore = state.mode === 'deathmatch';

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
      <h3 style={{ marginBottom: 10, fontSize: 15 }}>Leaderboard</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Player</th>
            <th style={th}>Kills</th>
            <th style={th}>Deaths</th>
            <th style={th}>Streak</th>
            {showScore && <th style={th}>Score</th>}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} style={{ borderTop: `1px solid ${theme.border}` }}>
              <td style={{ ...td, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                {p.color.toUpperCase()}
              </td>
              <td style={td}>{p.kills}</td>
              <td style={td}>{p.deaths}</td>
              <td style={td}>{Math.max(p.longestStreak, p.currentStreak)}</td>
              {showScore && <td style={td}>{p.score}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 11, color: theme.textMuted }}>Streak = longest alive kill streak</div>
    </div>
  );
}
