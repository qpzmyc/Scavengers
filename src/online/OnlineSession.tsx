import { useEffect, useRef, useState } from 'react';
import type { GameMode, PlayerId } from '../engine';
import {
  MIN_TARGET_SCORE,
  MAX_TARGET_SCORE,
  TARGET_SCORE_STEP,
  MIN_DEATH_CAP,
  MAX_DEATH_CAP,
} from '../engine';
import { theme } from '../theme';
import { useOnlineRoom } from './useOnlineRoom';
import { useLobbyRegistration } from './useLobby';
import type { LobbyRow } from './protocol';
import type { EnterRoomConfig } from '../components/menu/MenuFlow';
import { OnlineGame } from './OnlineGame';
import { TextInputPopup } from '../components/TextInputPopup';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BackArrow } from '../components/BackArrow';
import { Toast } from '../components/Toast';
import { getSavedPlayerName, setSavedPlayerName } from './playerName';

// A player's display label in the lobby: their custom name, or their color capitalized
// as a default (without marking a name as "set" — the rename field stays empty for them).
function labelFor(name: string | null, color: string): string {
  if (name) return name;
  return color.toUpperCase();
}

// Square 30×30 icon button used for both the rename (✎) and player-options (⋯) actions.
const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  fontSize: 16,
  lineHeight: 1,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: theme.accentSoft,
  border: `1px solid ${theme.accent}`,
  color: theme.accentText,
  cursor: 'pointer',
  flexShrink: 0,
};

const toggleBtn = (active: boolean): React.CSSProperties => ({
  padding: '10px 18px',
  margin: 0,
  fontSize: 15,
  fontWeight: 500,
  borderRadius: 10,
  cursor: 'pointer',
  background: active ? theme.accentSoft : theme.surface,
  border: `1px solid ${active ? theme.accent : theme.border}`,
  color: active ? theme.accentText : theme.text,
});

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
  becomeHost,
  seat,
  onLeave,
  onEnterRoom,
}: {
  roomId: string;
  create?: { mode: GameMode; count: number; visibility: 'public' | 'private'; deathCap: number; targetScore: number };
  becomeHost?: boolean;
  seat?: PlayerId;
  onLeave: () => void;
  onEnterRoom: (config: EnterRoomConfig) => void;
}) {
  const room = useOnlineRoom(
    roomId,
    create
      ? { mode: create.mode, count: create.count, deathCap: create.deathCap, targetScore: create.targetScore, visibility: create.visibility }
      : undefined,
    becomeHost,
    seat,
  );
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showRenamePopup, setShowRenamePopup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draftMode, setDraftMode] = useState<GameMode>('lastStanding');
  const [draftDeathCap, setDraftDeathCap] = useState(3);
  const [draftTargetScore, setDraftTargetScore] = useState(25);
  const [makeHostTarget, setMakeHostTarget] = useState<PlayerId | null>(null);
  const [kickTarget, setKickTarget] = useState<PlayerId | null>(null);
  const [menuTarget, setMenuTarget] = useState<PlayerId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const flashNotice = (text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  };
  const openSettings = () => {
    setDraftMode(room.mode);
    setDraftDeathCap(room.deathCap);
    setDraftTargetScore(room.targetScore);
    setShowSettings(true);
  };

  const row: LobbyRow | null =
    create?.visibility === 'public'
      ? { code: roomId, mode: room.mode, playerCount: room.playerCount, filled: room.roster.filter((r) => r.connected).length }
      : null;
  useLobbyRegistration(row, room.phase === 'lobby');

  const isHost = room.roster.find((r) => r.playerId === room.myPlayerId)?.isHost ?? false;

  // If the host removed us, return to the menu.
  useEffect(() => {
    if (room.kicked) onLeave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.kicked]);

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
      // Not returned as effect cleanup on purpose: a later re-render (e.g. a host
      // transfer on rematch rejoin) would otherwise clear this timeout while the
      // shown-ref guard blocks re-scheduling it, leaving the toast stuck forever.
      window.setTimeout(() => setJoinNotice(null), 3000);
    } else if (room.error) {
      joinNoticeShownRef.current = true;
      setJoinNotice({ kind: 'error', text: 'Invalid room code' });
    }
  }, [create, room.myPlayerId, room.error]);

  if (room.phase !== 'lobby') {
    return <OnlineGame room={room} onLeave={onLeave} onEnterRoom={onEnterRoom} isHost={isHost} />;
  }

  const title = room.visibility === 'private' ? 'Private Room' : 'Public Room';

  // Display-only reorder: the current host's row goes first. Underlying seat/turn order
  // (room.roster's index, which mirrors p1..pN) is untouched — this only affects rendering.
  // room.roster always has one entry per seat (playerCount), connected or not — a seat's
  // `connected` flag, not its presence in the array, is what distinguishes an empty slot.
  const orderedRoster = [...room.roster].sort((a, b) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0));
  const connectedCount = room.roster.filter((r) => r.connected).length;

  return (
    <div style={screenWrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: 420, maxWidth: '100%' }}>
        <BackArrow onClick={() => setShowLeaveConfirm(true)} />
        <h1 style={{ fontSize: 36, margin: 0 }}>{title}</h1>
      </div>
      {joinNotice && <Toast kind={joinNotice.kind}>{joinNotice.text}</Toast>}
      <div style={{ ...card, padding: 24, minWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={rowLabel}>Players ({room.playerCount} max)</div>
        {orderedRoster.map((entry) => {
          if (!entry.connected) {
            return (
              <div
                key={entry.playerId}
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
            );
          }
          const isMe = entry.playerId === room.myPlayerId;
          return (
            <div
              key={entry.playerId}
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                // The tint now marks *you*; the crown marks the host (no separate host tint).
                background: isMe ? theme.accentSoft : theme.surfaceAlt,
                border: '1px solid transparent',
                color: theme.text,
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
                {entry.isHost && <span aria-label="host" title="Host">👑</span>}
                <span>{labelFor(entry.name, entry.color)}</span>
              </span>
              {isMe ? (
                <button
                  onClick={() => setShowRenamePopup(true)}
                  aria-label="Change your name"
                  style={iconBtn}
                >
                  ✎
                </button>
              ) : (
                isHost && !entry.isHost && (
                  <button onClick={() => setMenuTarget(entry.playerId)} aria-label="Player options" style={iconBtn}>
                    ⋯
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={rowLabel}>Room code</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 6, color: theme.heading }}>{roomId}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          aria-label="Game settings"
          onClick={() => (isHost ? openSettings() : flashNotice('Only the host can change the game’s settings'))}
          style={{
            width: 52,
            height: 52,
            fontSize: 22,
            lineHeight: 1,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            color: isHost ? theme.text : theme.textMuted,
            opacity: isHost ? 1 : 0.5,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ⚙
        </button>
        {isHost ? (
          <button
            style={{ ...primaryBtn, opacity: connectedCount < room.playerCount ? 0.5 : 1 }}
            disabled={connectedCount < room.playerCount}
            onClick={() => room.send({ type: 'startGame' })}
          >
            Start Game
          </button>
        ) : (
          <div style={{ color: theme.textMuted, fontStyle: 'italic' }}>Waiting for host to start…</div>
        )}
      </div>
      {notice && <Toast kind="error">{notice}</Toast>}
      {showSettings && (
        <Modal title="Game Settings" onClose={() => setShowSettings(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 300 }}>
            <div>
              <div style={rowLabel}>Mode</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={toggleBtn(draftMode === 'deathmatch')} onClick={() => setDraftMode('deathmatch')}>Deathmatch</button>
                <button style={toggleBtn(draftMode === 'lastStanding')} onClick={() => setDraftMode('lastStanding')}>Survival</button>
              </div>
            </div>
            {draftMode === 'deathmatch' ? (
              <div>
                <div style={rowLabel}>Target score: <span style={{ color: theme.accentText }}>{draftTargetScore}</span></div>
                <input
                  type="range"
                  min={MIN_TARGET_SCORE}
                  max={MAX_TARGET_SCORE}
                  step={TARGET_SCORE_STEP}
                  value={draftTargetScore}
                  onChange={(e) => setDraftTargetScore(Number(e.target.value))}
                  style={{ width: '100%', accentColor: theme.accent }}
                />
              </div>
            ) : (
              <div>
                <div style={rowLabel}>Lives: <span style={{ color: theme.accentText }}>{draftDeathCap}</span></div>
                <input
                  type="range"
                  min={MIN_DEATH_CAP}
                  max={MAX_DEATH_CAP}
                  step={1}
                  value={draftDeathCap}
                  onChange={(e) => setDraftDeathCap(Number(e.target.value))}
                  style={{ width: '100%', accentColor: theme.accent }}
                />
              </div>
            )}
            <button
              style={primaryBtn}
              onClick={() => {
                room.send({ type: 'updateSettings', mode: draftMode, deathCap: draftDeathCap, targetScore: draftTargetScore });
                setShowSettings(false);
              }}
            >
              OK
            </button>
          </div>
        </Modal>
      )}
      {showLeaveConfirm && (
        <ConfirmDialog
          title="Leave room?"
          message="Are you sure you would like to leave the room?"
          confirmLabel="Leave"
          onConfirm={onLeave}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
      {makeHostTarget && (
        <ConfirmDialog
          title="Transfer host?"
          message={`Make ${labelFor(
            room.roster.find((r) => r.playerId === makeHostTarget)?.name ?? null,
            room.roster.find((r) => r.playerId === makeHostTarget)?.color ?? '',
          )} the host?`}
          confirmLabel="Make host"
          confirmColor={theme.accent}
          onConfirm={() => {
            room.send({ type: 'makeHost', playerId: makeHostTarget });
            setMakeHostTarget(null);
          }}
          onCancel={() => { setMenuTarget(makeHostTarget); setMakeHostTarget(null); }}
        />
      )}
      {showRenamePopup && (
        <TextInputPopup
          title="Change Your Name"
          placeholder="Your Name"
          initialValue={room.roster.find((r) => r.playerId === room.myPlayerId)?.name ?? ''}
          maxLength={16}
          confirmLabel="Save"
          allowEmpty
          onConfirm={(name) => {
            room.send({ type: 'setName', name });
            setSavedPlayerName(name);
            setShowRenamePopup(false);
          }}
          onClose={() => setShowRenamePopup(false)}
        />
      )}
      {menuTarget && (
        <Modal
          title={labelFor(
            room.roster.find((r) => r.playerId === menuTarget)?.name ?? null,
            room.roster.find((r) => r.playerId === menuTarget)?.color ?? '',
          )}
          onClose={() => setMenuTarget(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
            <button
              style={{ ...primaryBtn, padding: '12px 20px', fontSize: 15 }}
              onClick={() => { setMakeHostTarget(menuTarget); setMenuTarget(null); }}
            >
              Make Host
            </button>
            <button
              style={{
                padding: '12px 20px',
                fontSize: 15,
                fontWeight: 700,
                background: '#c0392b',
                border: '1px solid #c0392b',
                color: '#fff',
                borderRadius: 10,
                cursor: 'pointer',
              }}
              onClick={() => { setKickTarget(menuTarget); setMenuTarget(null); }}
            >
              Kick Player
            </button>
          </div>
        </Modal>
      )}
      {kickTarget && (
        <ConfirmDialog
          title="Kick player?"
          message={`Remove ${labelFor(
            room.roster.find((r) => r.playerId === kickTarget)?.name ?? null,
            room.roster.find((r) => r.playerId === kickTarget)?.color ?? '',
          )} from the room?`}
          confirmLabel="Kick"
          onConfirm={() => {
            room.send({ type: 'kickPlayer', playerId: kickTarget });
            setKickTarget(null);
          }}
          onCancel={() => { setMenuTarget(kickTarget); setKickTarget(null); }}
        />
      )}
    </div>
  );
}
