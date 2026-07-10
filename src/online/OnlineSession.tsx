import { useEffect, useRef, useState } from 'react';
import type { GameMode } from '../engine';
import { theme } from '../theme';
import { useOnlineRoom } from './useOnlineRoom';
import { useLobbyRegistration } from './useLobby';
import type { LobbyRow } from './protocol';
import { OnlineGame } from './OnlineGame';
import { TextInputPopup } from '../components/TextInputPopup';
import { BackArrow } from '../components/BackArrow';
import { getSavedPlayerName, setSavedPlayerName } from './playerName';

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
  const [showRenamePopup, setShowRenamePopup] = useState(false);

  const row: LobbyRow | null =
    create?.visibility === 'public'
      ? { code: roomId, mode: room.mode, playerCount: room.playerCount, filled: room.roster.length }
      : null;
  useLobbyRegistration(row, room.phase === 'lobby');

  const isHost = room.roster.find((r) => r.playerId === room.myPlayerId)?.isHost ?? false;

  // Auto-apply a previously saved name (from the menu's "Change Name" or an in-room
  // rename) to every room joined, once we've been assigned a seat.
  const namedAppliedRef = useRef(false);
  useEffect(() => {
    if (namedAppliedRef.current || !room.myPlayerId) return;
    const saved = getSavedPlayerName();
    if (saved.trim()) {
      namedAppliedRef.current = true;
      room.send({ type: 'setName', name: saved });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.myPlayerId]);

  // Join-result toast: only meaningful when arriving via join (no `create`), since a room we
  // just created has no ambiguity about whether the join succeeded.
  const [joinNotice, setJoinNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const joinNoticeShownRef = useRef(false);
  useEffect(() => {
    if (create || joinNoticeShownRef.current) return;
    if (room.myPlayerId) {
      joinNoticeShownRef.current = true;
      setJoinNotice({ kind: 'success', text: 'Successfully joined room' });
      const t = window.setTimeout(() => setJoinNotice(null), 3000);
      return () => window.clearTimeout(t);
    }
    if (room.error) {
      joinNoticeShownRef.current = true;
      setJoinNotice({ kind: 'error', text: 'Invalid room code' });
    }
  }, [create, room.myPlayerId, room.error]);

  if (room.phase !== 'lobby') {
    return <OnlineGame room={room} onLeave={onLeave} isHost={isHost} />;
  }

  const title = create?.visibility === 'private' ? 'Private Room' : create ? 'Public Room' : 'Room';

  // Display-only reorder: the current host's row goes first. Underlying seat/turn order
  // (room.roster's index, which mirrors p1..pN) is untouched — this only affects rendering.
  const orderedRoster = [...room.roster].sort((a, b) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0));
  const emptySlotCount = room.playerCount - room.roster.length;

  return (
    <div style={screenWrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: 420, maxWidth: '100%' }}>
        <BackArrow onClick={onLeave} />
        <h1 style={{ fontSize: 36, margin: 0 }}>{title}</h1>
      </div>
      {joinNotice && (
        <div
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            fontWeight: 700,
            color: '#fff',
            background: joinNotice.kind === 'success' ? theme.accent : '#c0392b',
          }}
        >
          {joinNotice.text}
        </div>
      )}
      <div style={{ ...card, padding: 24, minWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={rowLabel}>Players ({room.playerCount} max)</div>
        {orderedRoster.map((entry) => {
          const isMe = entry.playerId === room.myPlayerId;
          return (
            <div
              key={entry.playerId}
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: theme.accentSoft,
                color: theme.accentText,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  aria-label={entry.color}
                  style={{ width: 14, height: 14, borderRadius: '50%', background: entry.color, flexShrink: 0 }}
                />
                {entry.name && <span>{entry.name}</span>}
                {isMe && <span style={{ fontWeight: 400 }}>(you)</span>}
                {entry.isHost && <span style={{ fontWeight: 400 }}>(host)</span>}
              </span>
              {isMe && (
                <button
                  onClick={() => setShowRenamePopup(true)}
                  aria-label="Change your name"
                  style={{
                    width: 28,
                    height: 28,
                    fontSize: 14,
                    borderRadius: 6,
                    background: theme.surfaceAlt,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                    cursor: 'pointer',
                  }}
                >
                  ✎
                </button>
              )}
            </div>
          );
        })}
        {Array.from({ length: Math.max(0, emptySlotCount) }, (_, i) => (
          <div
            key={`empty-${i}`}
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: theme.surfaceAlt,
              color: theme.textMuted,
              fontWeight: 600,
            }}
          >
            Waiting for player…
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={rowLabel}>Room code</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 6, color: theme.heading }}>{roomId}</div>
      </div>
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
      {showRenamePopup && (
        <TextInputPopup
          title="Change Your Name"
          placeholder="Your name"
          initialValue={room.roster.find((r) => r.playerId === room.myPlayerId)?.name ?? ''}
          maxLength={16}
          confirmLabel="Save"
          onConfirm={(name) => {
            room.send({ type: 'setName', name });
            setSavedPlayerName(name);
            setShowRenamePopup(false);
          }}
          onClose={() => setShowRenamePopup(false)}
        />
      )}
    </div>
  );
}
