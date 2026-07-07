import type { GameState } from '../engine';

interface StatsPanelProps {
  state: GameState;
}

export function StatsPanel({ state }: StatsPanelProps) {
  const { p1, p2 } = state.players;

  return (
    <div style={{ display: 'flex', gap: 24, padding: 12, fontFamily: 'sans-serif' }}>
      {[p1, p2].map((p) => (
        <div key={p.id} data-testid={`stats-${p.id}`}>
          <strong style={{ color: p.color }}>{p.color.toUpperCase()}</strong>
          <div>Energy: {p.energy}</div>
          <div>Ammo: {p.ammo}</div>
          <div>Kills: {p.kills}</div>
          <div>Deaths: {p.deaths}</div>
          {state.mode === 'deathmatch' && <div>Score: {p.score}</div>}
          <div>Longest streak: {Math.max(p.longestStreak, p.currentStreak)}</div>
        </div>
      ))}
      <div>
        {state.winner ? (
          <strong>Player {state.players[state.winner].color.toUpperCase()} wins!</strong>
        ) : (
          <div>Current turn: {state.players[state.currentTurn].color.toUpperCase()}</div>
        )}
      </div>
    </div>
  );
}
