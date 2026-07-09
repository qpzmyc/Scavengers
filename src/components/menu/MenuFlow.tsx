import { useState } from 'react';
import type { GameMode } from '../../engine';
import { theme } from '../../theme';

type GameType = 'online' | 'inPerson' | 'bots';
type MenuScreen = 'gameType' | 'settings' | 'room' | 'join';
type Visibility = 'public' | 'private';

interface MenuFlowProps {
  onStartGame: (mode: GameMode, count: number) => void;
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
const rowLabel: React.CSSProperties = { fontSize: 13, color: theme.textMuted, marginBottom: 8, fontWeight: 600 };
const toggleBtn = (active: boolean): React.CSSProperties => ({
  padding: '10px 18px',
  margin: '0 8px 0 0',
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 8,
  cursor: 'pointer',
  background: active ? theme.accentSoft : theme.surface,
  border: `1px solid ${active ? theme.accent : theme.border}`,
  color: active ? theme.accentText : theme.text,
});
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

export function MenuFlow({ onStartGame }: MenuFlowProps) {
  const [screen, setScreen] = useState<MenuScreen>('gameType');
  const [gameType, setGameType] = useState<GameType>('inPerson');
  const [mode, setMode] = useState<GameMode>('lastStanding');
  const [playerCount, setPlayerCount] = useState<number>(2);
  const [creating, setCreating] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [roomCode, setRoomCode] = useState('');

  // ---- Screen 1: game type (root, no back) ----
  if (screen === 'gameType') {
    const typeBtn = (type: GameType, label: string) => (
      <button
        style={{ ...toggleBtn(gameType === type), padding: '16px 26px', fontSize: 16, margin: 0 }}
        onClick={() => { setGameType(type); setCreating(false); setScreen('settings'); }}
      >
        {label}
      </button>
    );
    return (
      <div style={screenWrap}>
        <h1 style={{ fontSize: 44 }}>Scavengers</h1>
        <div style={{ ...card, padding: 28, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 360 }}>
          <div style={rowLabel}>Choose game type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
        <BackArrow onClick={() => { setCreating(false); setScreen('gameType'); }} />
        <h1 style={{ fontSize: 44 }}>Scavengers</h1>
        <div style={{ ...card, padding: 28, display: 'flex', flexDirection: 'column', gap: 22, minWidth: 360 }}>
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
          creating ? (
            <div style={{ display: 'flex', gap: 16 }}>
              <button style={primaryBtn} onClick={() => { setVisibility('public'); setRoomCode(''); setScreen('room'); }}>Create Public Room</button>
              <button style={primaryBtn} onClick={() => { setVisibility('private'); setRoomCode(generateRoomCode()); setScreen('room'); }}>Create Private Room</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 16 }}>
              <button style={primaryBtn} onClick={() => setScreen('join')}>Join Game</button>
              <button style={primaryBtn} onClick={() => setCreating(true)}>Create Game</button>
            </div>
          )
        ) : (
          <button style={primaryBtn} onClick={() => onStartGame(mode, playerCount)}>Start Game</button>
        )}
      </div>
    );
  }

  // ---- Room lobby ----
  if (screen === 'room') {
    const slots = Array.from({ length: playerCount }, (_, i) => (i === 0 ? 'You' : 'Waiting for player…'));
    return (
      <div style={screenWrap}>
        <BackArrow onClick={() => setScreen('settings')} />
        <h1 style={{ fontSize: 36 }}>{visibility === 'private' ? 'Private' : 'Public'} Room</h1>
        <div style={{ ...card, padding: 24, minWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={rowLabel}>Players ({playerCount} max)</div>
          {slots.map((label, i) => (
            <div
              key={i}
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: i === 0 ? theme.accentSoft : theme.surfaceAlt,
                color: i === 0 ? theme.accentText : theme.textMuted,
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>
        {visibility === 'private' && (
          <div style={{ textAlign: 'center' }}>
            <div style={rowLabel}>Room code</div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 6, color: theme.heading }}>{roomCode}</div>
          </div>
        )}
        <button style={primaryBtn} onClick={() => onStartGame(mode, playerCount)}>Start Game</button>
      </div>
    );
  }

  // ---- Join ----
  if (screen === 'join') {
    return (
      <div style={screenWrap}>
        <BackArrow onClick={() => setScreen('settings')} />
        <h1 style={{ fontSize: 36 }}>Join a Game</h1>
        <button
          style={{ ...toggleBtn(false), margin: 0, padding: '12px 22px', fontSize: 15 }}
          onClick={() => {
            const code = window.prompt('Enter room code');
            if (code && code.trim()) {
              setVisibility('private');
              setRoomCode(code.trim().toUpperCase());
              setScreen('room');
            }
          }}
        >
          Enter code
        </button>
        <div
          style={{
            ...card,
            padding: 24,
            minWidth: 360,
            minHeight: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.textMuted,
            fontStyle: 'italic',
          }}
        >
          No rooms available
        </div>
      </div>
    );
  }

  return null;
}
