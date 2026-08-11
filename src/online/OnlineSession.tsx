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
// A 16-character name (the rename field's maxLength) rendered at the row's normal
// 15px ends flush against the edit button with no gap left. Stepping the size down
// past 11 characters buys that gap back while keeping the whole name readable,
// which is why this shrinks rather than truncating.
function nameFontSize(label: string): number {
  if (label.length <= 11) return 15;
  return label.length <= 13 ? 13.5 : 12;
}

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

  // Once we're seated in the lobby, surface any server rejection (e.g. clicking Start Game
  // when the game has already started) as a self-dismissing toast so it doesn't linger.
  useEffect(() => {
    if (room.myPlayerId && room.error) flashNotice(room.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.error]);

  // Once the game actually starts, tear down any lingering lobby toast so a late/among
  // rejection like "The game has already started." can't stay pinned over the intro/board.
  useEffect(() => {
    if (room.phase !== 'lobby') {
      window.clearTimeout(noticeTimer.current);
      setNotice(null);
      setJoinNotice(null);
    }
  }, [room.phase]);

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

  // ---- Start-of-game intro sequence ----
  // When the host starts the game, the room screen stays up and fades to black over 5s,
  // then a big "Scavengers" title fades in over 2s, holds for 2s, and finally the board
  // fades in over 3s while the title fades out — after which the first-turn randomizer runs.
  // (A client that joins mid-game — phase already non-lobby at mount — skips the intro.)
  const [introDone, setIntroDone] = useState(room.phase !== 'lobby');
  const [showGame, setShowGame] = useState(room.phase !== 'lobby');
  const [introMounted, setIntroMounted] = useState(false);
  const [blackOp, setBlackOp] = useState(0);
  const [blackDur, setBlackDur] = useState(5);
  const [titleOp, setTitleOp] = useState(0);
  const [titleDur, setTitleDur] = useState(2);
  const introStartedRef = useRef(false);
  const prevPhaseRef = useRef(room.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = room.phase;
    if (prev !== 'lobby' || room.phase !== 'playing' || introStartedRef.current) return;
    introStartedRef.current = true;
    setIntroMounted(true);
    const timers = [
      window.setTimeout(() => setBlackOp(1), 50),                                              // 0–5s: room fades to black
      // Flip showGame first: this moves the overlay into the game render branch, remounting it
      // at opacity 0. Starting the title fade in the SAME commit would skip the transition, so
      // raise titleOp one tick later, after the remounted node has painted its 0 state.
      window.setTimeout(() => { setShowGame(true); setTitleDur(2); }, 5050),                    // 5s: mount game behind black
      window.setTimeout(() => setTitleOp(1), 5200),                                             // 5–7s: title fades in
      window.setTimeout(() => { setBlackDur(3); setBlackOp(0); setTitleDur(3); setTitleOp(0); }, 9050), // 9–12s: board fades in, title out
      window.setTimeout(() => { setIntroMounted(false); setIntroDone(true); }, 12100),          // intro done → randomizer
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [room.phase]);

  const introOverlay = introMounted ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 620, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: blackOp, transition: `opacity ${blackDur}s ease` }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: titleOp,
          transition: `opacity ${titleDur}s ease`,
        }}
      >
        <h1 style={{ fontSize: 96, fontWeight: 800, letterSpacing: 2, color: '#fff', margin: 0, textAlign: 'center' }}>Scavengers</h1>
      </div>
    </div>
  ) : null;

  if (room.phase !== 'lobby' && showGame) {
    return (
      <>
        <OnlineGame room={room} onLeave={onLeave} onEnterRoom={onEnterRoom} isHost={isHost} introDone={introDone} />
        {introOverlay}
      </>
    );
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
      {introOverlay}
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
                  // Same gap as a filled row's dot-to-name spacing, so the marker
                  // below lands in the same column as the real colour dots.
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {/* Sits exactly where the joining player's colour dot will be, so
                    the row reads as a seat someone is about to take rather than a
                    dead box. Decorative: the text beside it already says what this
                    is, so a screen reader gains nothing from announcing it. */}
                <span
                  aria-hidden="true"
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: `1.5px dashed ${theme.textMuted}`,
                    boxSizing: 'border-box',
                    flexShrink: 0,
                    animation: 'seatSlotWait 2.4s linear infinite',
                  }}
                />
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
                // The lobby panel is sized by its content, so `space-between`
                // never has spare room to distribute and a long name ends up
                // touching the button. This gap is what actually holds them
                // apart; nameFontSize above is what stops the panel widening to
                // pay for it (at 15px the row needs 366 of a 375px viewport).
                gap: 14,
              }}
            >
              {/* minWidth:0 lets this half of the row give way rather than push
                  the button off the edge, whatever the font size works out to. */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span
                  aria-label={entry.color}
                  style={{ width: 14, height: 14, borderRadius: '50%', background: entry.color, flexShrink: 0 }}
                />
                {entry.isHost && <span aria-label="host" title="Host">👑</span>}
                <span style={{ fontSize: nameFontSize(labelFor(entry.name, entry.color)) }}>
                  {labelFor(entry.name, entry.color)}
                </span>
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
