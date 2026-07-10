import type { GameMode } from '../engine';
import { theme } from '../theme';
import { useOnlineRoom } from './useOnlineRoom';
import { useLobbyRegistration } from './useLobby';
import type { LobbyRow } from './protocol';
import { OnlineGame } from './OnlineGame';

const card: React.CSSProperties = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radius,
  boxShadow: theme.shadow,
};
const rowLabel: React.CSSProperties = { fontSize: 13, color: theme.textMuted, marginBottom: 8, fontWeight: 600 };
const primaryBtn: React.CSSProperties = {
  padding: '16px 40px',
  fontSize: 18,
  fontWeight: 700,
  background: theme.accent,
  border: `1px solid ${theme.accent}`,
  color: '#fff',
  borderRadius: 10,
  cursor: 'pointer',
};
const screenWrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 28,
  padding: 24,
  boxSizing: 'border-box',
  position: 'relative',
};

function BackArrow({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Back"
      style={{
        position: 'absolute',
        top: 24,
        left: 24,
        width: 44,
        height: 44,
        fontSize: 22,
        lineHeight: 1,
        borderRadius: 10,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        color: theme.text,
        cursor: 'pointer',
      }}
    >
      ←
    </button>
  );
}

export function OnlineSession({
  roomId,
  create,
  onLeave,
}: {
  roomId: string;
  create?: { mode: GameMode; count: number; visibility: 'public' | 'private' };
  onLeave: () => void;
}) {
  const room = useOnlineRoom(roomId, create ? { mode: create.mode, count: create.count } : undefined);

  const row: LobbyRow | null =
    create?.visibility === 'public'
      ? { code: roomId, mode: room.mode, playerCount: room.playerCount, filled: room.roster.length }
      : null;
  useLobbyRegistration(row, room.phase === 'lobby');

  const isHost = room.roster.find((r) => r.playerId === room.myPlayerId)?.isHost ?? false;

  if (room.phase !== 'lobby') {
    return <OnlineGame room={room} onLeave={onLeave} isHost={isHost} />;
  }

  const title = create?.visibility === 'private' ? 'Private Room' : create ? 'Public Room' : 'Room';
  const showCode = create?.visibility === 'private' || !create;

  return (
    <div style={screenWrap}>
      <BackArrow onClick={onLeave} />
      <h1 style={{ fontSize: 36 }}>{title}</h1>
      <div style={{ ...card, padding: 24, minWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={rowLabel}>Players ({room.playerCount} max)</div>
        {Array.from({ length: room.playerCount }, (_, i) => {
          const entry = room.roster[i];
          const label = entry
            ? `${entry.color.toUpperCase()}${entry.playerId === room.myPlayerId ? ' (you)' : ''}${entry.isHost ? ' (host)' : ''}`
            : 'Waiting for player…';
          return (
            <div
              key={i}
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: entry ? theme.accentSoft : theme.surfaceAlt,
                color: entry ? theme.accentText : theme.textMuted,
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>
      {showCode && (
        <div style={{ textAlign: 'center' }}>
          <div style={rowLabel}>Room code</div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 6, color: theme.heading }}>{roomId}</div>
        </div>
      )}
      {isHost ? (
        <button
          style={{ ...primaryBtn, opacity: room.roster.length < room.playerCount ? 0.5 : 1 }}
          disabled={room.roster.length < room.playerCount}
          onClick={() => room.send({ type: 'startGame' })}
        >
          Start Game
        </button>
      ) : (
        <div style={{ color: theme.textMuted, fontStyle: 'italic' }}>Waiting for host to start…</div>
      )}
    </div>
  );
}
