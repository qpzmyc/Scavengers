import { useState } from 'react';
import type { GameMode } from '../../engine';
import { theme } from '../../theme';
import { useLobby } from '../../online/useLobby';
import type { LobbyRow } from '../../online/protocol';
import { getSavedPlayerName, setSavedPlayerName } from '../../online/playerName';
import { Modal } from '../Modal';
import { TextInputPopup } from '../TextInputPopup';
import { BackArrow } from '../BackArrow';

type GameType = 'online' | 'inPerson' | 'bots';
type MenuScreen = 'gameType' | 'settings' | 'join';

export interface EnterRoomConfig {
  roomId: string;
  create?: { mode: GameMode; count: number; visibility: 'public' | 'private' };
}

interface MenuFlowProps {
  onStartGame: (mode: GameMode, count: number) => void;
  onEnterRoom: (config: EnterRoomConfig) => void;
  // Where to land on mount — used when returning from a room via its back arrow, so the
  // player lands back on the online settings screen instead of the root game-type screen.
  initialGameType?: GameType;
  initialScreen?: MenuScreen;
}

const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

const card: React.CSSProperties = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radius,
  boxShadow: theme.shadow,
};
const rowLabel: React.CSSProperties = { fontSize: 16, color: theme.textMuted, marginBottom: 10, fontWeight: 600 };
const toggleBtn = (active: boolean): React.CSSProperties => ({
  padding: '14px 24px',
  margin: '0 8px 0 0',
  fontSize: 17,
  fontWeight: 500,
  borderRadius: 10,
  cursor: 'pointer',
  background: active ? theme.accentSoft : theme.surface,
  border: `1px solid ${active ? theme.accent : theme.border}`,
  color: active ? theme.accentText : theme.text,
});
// Left as-is per design: the bottom primary action button(s) keep their existing size.
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
  gap: 32,
  padding: 24,
  boxSizing: 'border-box',
  position: 'relative',
};
const titleStyle: React.CSSProperties = {
  fontSize: 68,
  fontWeight: 800,
  letterSpacing: -1.5,
  color: theme.heading,
  margin: 0,
  textShadow: '0 2px 12px rgba(91, 140, 255, 0.25)',
};

function TitleRow({ onBack, title }: { onBack?: () => void; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: 420, maxWidth: '100%' }}>
      {onBack && <BackArrow onClick={onBack} />}
      <h1 style={{ ...titleStyle, fontSize: 44 }}>{title}</h1>
    </div>
  );
}

function JoinScreen({ onBack, onEnterRoom }: { onBack: () => void; onEnterRoom: (config: EnterRoomConfig) => void }) {
  const { rooms, refresh } = useLobby();
  const [showCodePopup, setShowCodePopup] = useState(false);
  const [refreshedNotice, setRefreshedNotice] = useState(false);

  const handleRefresh = () => {
    refresh();
    setRefreshedNotice(true);
    window.setTimeout(() => setRefreshedNotice(false), 2000);
  };

  return (
    <div style={screenWrap}>
      <TitleRow onBack={onBack} title="Join a Game" />
      {refreshedNotice && (
        <div
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            fontWeight: 700,
            color: '#fff',
            background: theme.accent,
          }}
        >
          Rooms refreshed!
        </div>
      )}
      <div style={{ display: 'flex', gap: 14 }}>
        <button
          style={{ ...toggleBtn(false), margin: 0, padding: '14px 26px', fontSize: 16 }}
          onClick={() => setShowCodePopup(true)}
        >
          Enter code
        </button>
        <button
          style={{ ...toggleBtn(false), margin: 0, padding: '14px 26px', fontSize: 16 }}
          onClick={handleRefresh}
        >
          Refresh
        </button>
      </div>
      <div
        style={{
          ...card,
          padding: 28,
          minWidth: 420,
          minHeight: 180,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {rooms.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.textMuted,
              fontStyle: 'italic',
              fontSize: 16,
            }}
          >
            No public rooms
          </div>
        ) : (
          rooms.map((row: LobbyRow) => {
            const full = row.filled >= row.playerCount;
            return (
              <button
                key={row.code}
                disabled={full}
                onClick={() => onEnterRoom({ roomId: row.code })}
                style={{
                  padding: '14px 18px',
                  borderRadius: 10,
                  background: theme.surfaceAlt,
                  border: `1px solid ${theme.border}`,
                  color: full ? theme.textMuted : theme.text,
                  fontWeight: 600,
                  fontSize: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  cursor: full ? 'not-allowed' : 'pointer',
                  opacity: full ? 0.5 : 1,
                }}
              >
                <span>{row.code}</span>
                <span style={{ fontWeight: 400, color: theme.textMuted }}>
                  {row.mode === 'lastStanding' ? 'Last Standing' : 'Deathmatch'}
                </span>
                <span>{row.filled}/{row.playerCount}</span>
              </button>
            );
          })
        )}
      </div>
      {showCodePopup && (
        <TextInputPopup
          title="Enter Room Code"
          placeholder="ABC123"
          maxLength={6}
          confirmLabel="Join"
          onConfirm={(code) => {
            setShowCodePopup(false);
            onEnterRoom({ roomId: code.toUpperCase() });
          }}
          onClose={() => setShowCodePopup(false)}
        />
      )}
    </div>
  );
}

export function MenuFlow({ onStartGame, onEnterRoom, initialGameType, initialScreen }: MenuFlowProps) {
  const [screen, setScreen] = useState<MenuScreen>(initialScreen ?? 'gameType');
  const [gameType, setGameType] = useState<GameType>(initialGameType ?? 'inPerson');
  const [mode, setMode] = useState<GameMode>('lastStanding');
  const [playerCount, setPlayerCount] = useState<number>(2);
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [showNamePopup, setShowNamePopup] = useState(false);

  // ---- Screen 1: game type (root, no back) ----
  if (screen === 'gameType') {
    const typeBtn = (type: GameType, label: string) => (
      <button
        style={{ ...toggleBtn(gameType === type), padding: '18px 30px', fontSize: 18, margin: 0 }}
        onClick={() => { setGameType(type); setScreen('settings'); }}
      >
        {label}
      </button>
    );
    return (
      <div style={screenWrap}>
        <h1 style={titleStyle}>Scavengers</h1>
        <div style={{ ...card, padding: 40, display: 'flex', flexDirection: 'column', gap: 22, minWidth: 420 }}>
          <div style={rowLabel}>Choose game type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {typeBtn('online', 'Online')}
            {typeBtn('inPerson', 'In Person')}
            {typeBtn('bots', 'Bots')}
          </div>
        </div>
      </div>
    );
  }

  // ---- Screen 2: settings (mode + player count) ----
  if (screen === 'settings') {
    return (
      <div style={screenWrap}>
        <TitleRow onBack={() => setScreen('gameType')} title="Scavengers" />
        <div style={{ ...card, padding: 40, display: 'flex', flexDirection: 'column', gap: 28, minWidth: 420 }}>
          <div>
            <div style={rowLabel}>Players</div>
            <div>
              <button style={toggleBtn(playerCount === 2)} onClick={() => setPlayerCount(2)}>2 Players</button>
              <button style={toggleBtn(playerCount === 4)} onClick={() => setPlayerCount(4)}>4 Players</button>
            </div>
          </div>
          <div>
            <div style={rowLabel}>Mode</div>
            <div>
              <button style={toggleBtn(mode === 'deathmatch')} onClick={() => setMode('deathmatch')}>Deathmatch</button>
              <button style={toggleBtn(mode === 'lastStanding')} onClick={() => setMode('lastStanding')}>Last Player Standing</button>
            </div>
          </div>
        </div>

        {gameType === 'online' ? (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={primaryBtn} onClick={() => setScreen('join')}>Join Game</button>
            <button style={primaryBtn} onClick={() => setShowCreatePopup(true)}>Create Game</button>
            <button style={primaryBtn} onClick={() => setShowNamePopup(true)}>Change Name</button>
          </div>
        ) : (
          <button style={primaryBtn} onClick={() => onStartGame(mode, playerCount)}>Start Game</button>
        )}

        {showCreatePopup && (
          <Modal title="Create Game" onClose={() => setShowCreatePopup(false)}>
            <div style={{ display: 'flex', gap: 16 }}>
              <button
                style={primaryBtn}
                onClick={() => onEnterRoom({ roomId: generateRoomCode(), create: { mode, count: playerCount, visibility: 'public' } })}
              >
                Create Public Room
              </button>
              <button
                style={primaryBtn}
                onClick={() => onEnterRoom({ roomId: generateRoomCode(), create: { mode, count: playerCount, visibility: 'private' } })}
              >
                Create Private Room
              </button>
            </div>
          </Modal>
        )}

        {showNamePopup && (
          <TextInputPopup
            title="Change Your Name"
            placeholder="Your name"
            initialValue={getSavedPlayerName()}
            maxLength={16}
            confirmLabel="Save"
            onConfirm={(name) => {
              setSavedPlayerName(name);
              setShowNamePopup(false);
            }}
            onClose={() => setShowNamePopup(false)}
          />
        )}
      </div>
    );
  }

  // ---- Join ----
  if (screen === 'join') {
    return <JoinScreen onBack={() => setScreen('settings')} onEnterRoom={onEnterRoom} />;
  }

  return null;
}
