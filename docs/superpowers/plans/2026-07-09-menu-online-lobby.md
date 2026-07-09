# Multi-Screen Menu with Online Lobby Scaffolding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single main-menu screen with a multi-screen menu flow (game-type → settings → online create/join/room lobby) while keeping the game fully playable via the existing local hotseat engine.

**Architecture:** Extract the entire menu into a self-contained `src/components/menu/MenuFlow.tsx` component that owns all its navigation state and renders each sub-screen as an inline block (mirroring how `App.tsx` already renders its `menu`/`handoff`/`game` screens inline). `App.tsx` renders `<MenuFlow onStartGame={…} />` when `screen === 'menu'` and is otherwise untouched. Online screens use mock/placeholder data; every "Start game" action calls the existing `startGame`.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`, `noUnusedLocals`), Vite, existing `theme.ts` design tokens.

## Global Constraints

- TypeScript is strict: type-only imports MUST use `import type`; unused locals fail the build. `npm run build` (tsc -b + vite build) is the real gate.
- No new dependencies. No networking. No engine changes.
- All colors/spacing come from `src/theme.ts` — never hardcode palette hex (player token colors excepted, per existing convention).
- No component test framework exists in this repo (engine is unit-tested; UI is verified via `npm run build` + the suite + manual click-through, per CLAUDE.md). Verification steps reflect this.
- Reuse the existing menu button styling (toggle buttons, primary button, card) — match the look of the current menu.

## Reference: current menu code being replaced

`src/App.tsx`:
- `162:  const [connectivity, setConnectivity] = useState<'local'>('local');` — to be removed (only used by old menu).
- `161:  const [playerCount, setPlayerCount] = useState<number>(2);` — the *value* is only read by the old menu; after removal only the setter is used, so this becomes `const [, setPlayerCount]` is NOT enough (see Task 2). Handled by removing the value read.
- `startGame(nextMode, count)` (approx lines 234–259) already accepts `count` and calls `createInitialGameState(nextMode, count)`, `setMode`, `setPlayerCount`, `setPhase('handoff')`.
- The whole `if (screen === 'menu') { … }` block (approx lines 961–1044) is replaced.
- `mode` state (line 160) stays — it is read at line 1054 (game header).

---

## Task 1: Create the MenuFlow component

**Files:**
- Create: `src/components/menu/MenuFlow.tsx`

**Interfaces:**
- Produces: `export function MenuFlow(props: { onStartGame: (mode: GameMode, count: number) => void }): JSX.Element | null`
- Consumes: `GameMode` and `theme` from existing modules.

This task creates the complete, self-contained menu component. It is not yet imported anywhere, so the project still builds (an unreferenced exported component is fine under `noUnusedLocals`).

- [ ] **Step 1: Create the file with full implementation**

Create `src/components/menu/MenuFlow.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify it typechecks and builds**

Run: `npm run build`
Expected: PASS (no type errors). `MenuFlow.tsx` compiles even though nothing imports it yet.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS (no oxlint errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/menu/MenuFlow.tsx
git commit -m "feat: add MenuFlow multi-screen menu component"
```

---

## Task 2: Wire MenuFlow into App and remove the old menu

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `MenuFlow` from Task 1 — `<MenuFlow onStartGame={(mode, count) => void} />`.

- [ ] **Step 1: Add the import**

At the top of `src/App.tsx`, after the existing `import { ControlPanel, … } from './components/ControlPanel';` line, add:

```tsx
import { MenuFlow } from './components/menu/MenuFlow';
```

- [ ] **Step 2: Remove now-unused App state**

Delete these two lines (currently ~161–162):

```tsx
  const [playerCount, setPlayerCount] = useState<number>(2);
  const [connectivity, setConnectivity] = useState<'local'>('local');
```

- [ ] **Step 3: Remove the `setPlayerCount` call in `startGame`**

In `startGame`, delete the line:

```tsx
    setPlayerCount(count);
```

(`count` is still used on the next lines via `createInitialGameState(nextMode, count)`, so the parameter stays.)

- [ ] **Step 4: Replace the whole old menu block with MenuFlow**

Replace the entire `if (screen === 'menu') { … }` block (the block that starts with `const rowLabel: React.CSSProperties = …` inside it and ends with the closing `}` before `const barsPlayer = …`) with:

```tsx
  // ---- Menu (game-type → settings → online lobby) ----
  if (screen === 'menu') {
    return (
      <MenuFlow
        onStartGame={(nextMode, count) => {
          startGame(nextMode, count);
          setScreen('game');
        }}
      />
    );
  }
```

- [ ] **Step 5: Verify build (catches any remaining unused locals)**

Run: `npm run build`
Expected: PASS. In particular, confirm there is NO `'connectivity' is declared but its value is never read` or `'playerCount' is declared but its value is never read` error. If either appears, ensure Steps 2–3 were applied.

- [ ] **Step 6: Run the test suite (guard against regressions)**

Run: `npm run test`
Expected: PASS (engine suite unaffected).

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 8: Manual click-flow verification**

Run: `npm run dev`, open http://localhost:5173, and confirm:
1. App opens on the **game-type** screen (Online / In Person / Bots), no back arrow.
2. **In Person → settings**: back arrow returns to game-type; `Start Game` launches the game (handoff screen for P1's turn).
3. **Bots → settings → Start Game**: also launches the local game.
4. **Online → settings**: shows `Join Game` (left) and `Create Game` (right).
5. `Create Game` → shows `Create Public Room` / `Create Private Room`.
   - Public room: room screen shows `You` + `Waiting…` slots (2 or 4 per selection), **no** code, `Start Game` launches the game.
   - Private room: room screen additionally shows a 6-char code; `Start Game` launches the game.
6. `Join Game` → join screen with `Enter code` button + "No rooms available"; `Enter code` accepts a code and lands on a room screen showing that code; back arrows return correctly at each level.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat: use MenuFlow, remove inline menu and dead menu state"
```

---

## Self-Review Notes

- **Spec coverage:** game-type screen (Task 1 gameType), settings screen with mode/count (Task 1 settings), online Join/Create + public/private prompt (Task 1 settings footer), room lobby with You+Waiting slots and private code (Task 1 room), join screen with Enter code + empty state (Task 1 join), back arrows on all non-root screens (Task 1 `BackArrow`), Bots selectable → settings (Task 1 gameType), Start launches local game everywhere (Task 1 `onStartGame`, Task 2 wiring), MenuFlow extraction (Tasks 1–2). All covered.
- **Type consistency:** `onStartGame: (mode: GameMode, count: number) => void` is defined in `MenuFlowProps` (Task 1) and matched by the callback in Task 2.
- **Unused-locals hazard:** explicitly handled by removing `playerCount`/`connectivity` App state and the `setPlayerCount` call (Task 2 Steps 2–3, verified Step 5).
