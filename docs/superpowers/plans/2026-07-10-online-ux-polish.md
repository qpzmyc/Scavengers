# Online UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the batch of menu/online-room UX fixes and balance/randomness tweaks from `docs/superpowers/specs/2026-07-10-online-ux-polish-design.md`: bigger menu chrome with popups replacing inline buttons/`window.prompt`, custom per-player names that replace colors everywhere online (with "You"-substituted, always-name-both-parties notification text), room-code visibility, host-reorder, 4-ammo-pickup balance, a randomized online first turn with a reveal animation, and auto-delisting of abandoned public rooms.

**Architecture:** Engine-level balance change (`board.ts`/`state.ts`) is independent and goes first. Server-side room/lobby changes (`protocol.ts`, `roomReducer.ts`, `server.ts`) are the next independent layer — they define the wire shapes (`RosterEntry.name`, `setName`, randomized `currentTurn`) that the UI tasks consume. UI work is split into: a small shared `Modal`/`TextInputPopup`/`BackArrow` component layer (reused by both menu and room screens), the menu restyle itself, the room screen, and finally the in-game (`OnlineGame`) viewer-aware name/notification/reveal work, which is the largest and most interconnected task and goes last so it can consume everything below it.

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax`, `noUnusedLocals`) for `src/`; a Cloudflare Workers + Durable Objects server (`partyserver`) in `server/` that is **not** covered by the root `tsconfig`/`npm run build` gate (only `src/` is) — `server/src/server.ts` changes are verified by running `wrangler dev` and manually exercising the behavior, per the existing project convention (see `server/` has no test files today).

## Global Constraints

- TypeScript strict with `verbatimModuleSyntax` and `noUnusedLocals`: type-only imports use `import type`; no unused locals. `npm run build` (`tsc -b && vite build`) is the real gate for everything under `src/`.
- All colors come from `src/theme.ts` — no hardcoded hex in components (the existing `#fff` on accent-button text is the established repeated idiom in this codebase and may be reused, per prior session precedent; anything else new goes through `theme`).
- Engine (`src/engine/`) functions stay pure/immutable; `src/engine/index.ts` barrel re-exports all public engine API — import from `../engine`, not deep paths.
- No component tests — UI is verified via `npm run build` + `npx vitest run` + manual preview/playtest, matching this repo's established convention.
- Custom names, host-reorder display, room-code display, rename button, and the random-first-turn reveal are **online-mode only** — hotseat (`App.tsx`) call sites of shared components (`ResourceBars`, `Leaderboard`) must see unchanged behavior when new props are omitted.
- Server-authoritative: the client never invents game outcomes; the randomized first turn is chosen server-side in `roomReducer.ts`, broadcast as part of `gameStart`'s `state`, and the client only animates a reveal of what the server already decided.

---

### Task 1: Balance — 4 ammo pickups in 4-player games

**Files:**
- Modify: `src/engine/constants.ts:23-24`
- Modify: `src/engine/board.ts` (whole file — `buildBoard`)
- Modify: `src/engine/state.ts:60-70` (`createInitialGameState`)
- Test: `src/engine/board.test.ts`

**Interfaces:**
- Produces: `buildBoard(playerCount?: number): Tile[][]` (new optional parameter, defaults to `2` so all existing no-arg callers are unaffected); `ammoPickupCountForCount(playerCount: number): number` exported from `constants.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/board.test.ts` (after the existing `'places exactly 4 energy pickups and 3 ammo pickups on the board'` test, inside the same `describe('buildBoard', ...)` block):

```ts
  it('places 3 ammo pickups by default (2-player games)', () => {
    const board = buildBoard();
    let ammoCount = 0;
    for (const row of board) {
      for (const tile of row) {
        if (tile.type === 'ammoPickup') ammoCount += 1;
      }
    }
    expect(ammoCount).toBe(3);
  });

  it('places 4 ammo pickups in 4-player games', () => {
    const board = buildBoard(4);
    let ammoCount = 0;
    for (const row of board) {
      for (const tile of row) {
        if (tile.type === 'ammoPickup') ammoCount += 1;
      }
    }
    expect(ammoCount).toBe(4);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/board.test.ts`
Expected: FAIL — `buildBoard(4)` still places 3 ammo pickups (the new test's assertion `expect(ammoCount).toBe(4)` fails), since `buildBoard` doesn't yet accept a parameter.

- [ ] **Step 3: Add the named constants**

In `src/engine/constants.ts`, replace line 24 (`export const AMMO_PICKUP_COUNT = 3;`) with:

```ts
export const AMMO_PICKUP_COUNT_DEFAULT = 3; // 2-player games
export const AMMO_PICKUP_COUNT_4P = 4; // 4-player games

// Ammo pickup count for a game with `playerCount` players.
export function ammoPickupCountForCount(playerCount: number): number {
  return playerCount >= 4 ? AMMO_PICKUP_COUNT_4P : AMMO_PICKUP_COUNT_DEFAULT;
}
```

(This mirrors the existing `visionRadiusForCount` pattern a few lines below it in the same file — keep it directly above `visionRadiusForCount` for readability, order doesn't matter functionally.)

- [ ] **Step 4: Update `buildBoard` to accept `playerCount`**

In `src/engine/board.ts`, change the signature and the ammo-pickup section:

```ts
import type { Tile, Position } from './types';
import { GRID_SIZE, ammoPickupCountForCount } from './constants';

export function buildBoard(playerCount: number = 2): Tile[][] {
```

And replace the ammo-pickup block:

```ts
  // Random distinct cells within the central 3x3 (excluding center wall) -> ammo pickups.
  // Count scales with player count (see ammoPickupCountForCount).
  const centralCells: Position[] = [];
  for (let x = 4; x <= 6; x++) {
    for (let y = 4; y <= 6; y++) {
      if (x === 5 && y === 5) continue;
      centralCells.push({ x, y });
    }
  }
  const shuffled = centralCells.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const cell of shuffled.slice(0, ammoPickupCountForCount(playerCount))) {
    set(cell.x, cell.y, 'ammoPickup');
  }
```

- [ ] **Step 5: Wire the call site**

In `src/engine/state.ts`, inside `createInitialGameState` (around line 70), change:

```ts
    board: buildBoard(),
```

to:

```ts
    board: buildBoard(playerCount),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/engine/board.test.ts`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 7: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: PASS — no other file referenced the now-removed `AMMO_PICKUP_COUNT` (confirmed unused anywhere else in the codebase during design).

- [ ] **Step 8: Commit**

```bash
git add src/engine/constants.ts src/engine/board.ts src/engine/state.ts src/engine/board.test.ts
git commit -m "feat: scale ammo pickup count with player count (3 for 2p, 4 for 4p)"
```

---

### Task 2: Room protocol + reducer — custom names, random first turn, abandoned-room detection

**Files:**
- Modify: `src/online/protocol.ts`
- Modify: `src/online/roomReducer.ts`
- Test: `src/online/roomReducer.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `RosterEntry.name: string | null`; `ClientMsg` variant `{ type: 'setName'; name: string }`; `RoomInput` variant `{ t: 'setName'; connId: string; name: string }`; exported `isAbandonedInLobby(model: RoomModel): boolean` from `roomReducer.ts` (consumed by Task 3's `server.ts`). `startGame`'s resulting `RoomModel.state.currentTurn` is now a random member of `turnOrder` instead of always `'p1'`.

- [ ] **Step 1: Write the failing tests**

Add to `src/online/roomReducer.test.ts` (new `describe` blocks, or append `it`s inside the existing top-level `describe('roomReduce', ...)`):

```ts
  it('setName trims and stores a custom name on the caller\'s own seat, then broadcasts roster', () => {
    let m = seatedTwo();
    const step = roomReduce(m, { t: 'setName', connId: 'A', name: '  Ellie  ' });
    m = step.model;
    expect(m.slots.find((s) => s.connId === 'A')?.name).toBe('Ellie');
    const rosterMsg = step.out.find((o) => o.to === 'all' && o.msg.type === 'roster');
    expect(rosterMsg).toBeDefined();
    const entries = (rosterMsg!.msg as { entries: { playerId: string; name: string | null }[] }).entries;
    expect(entries.find((e) => e.playerId === 'p1')?.name).toBe('Ellie');
  });

  it('setName with an empty/whitespace-only name clears back to null', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'setName', connId: 'A', name: 'Ellie' }).model;
    m = roomReduce(m, { t: 'setName', connId: 'A', name: '   ' }).model;
    expect(m.slots.find((s) => s.connId === 'A')?.name).toBeNull();
  });

  it('setName clamps to 16 characters', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'setName', connId: 'A', name: 'ThisNameIsWayTooLongForARoster' }).model;
    expect(m.slots.find((s) => s.connId === 'A')?.name).toBe('ThisNameIsWayToo');
  });

  it('setName from a connId not seated in the room is a no-op', () => {
    const m = seatedTwo();
    const step = roomReduce(m, { t: 'setName', connId: 'stranger', name: 'X' });
    expect(step.model).toEqual(m);
    expect(step.out).toEqual([]);
  });

  it('startGame picks a currentTurn that is always a member of turnOrder (randomized across many runs)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const m = seatedTwo();
      const started = roomReduce(m, { t: 'startGame', connId: 'A' });
      const state = started.model.state!;
      expect(state.turnOrder).toContain(state.currentTurn);
      seen.add(state.currentTurn);
    }
    // Over 40 runs with a 2-way random pick, both players should have gone first at least once.
    expect(seen.size).toBe(2);
  });

  it('isAbandonedInLobby is true only when every slot is disconnected and the room never started', () => {
    let m = seatedTwo();
    expect(isAbandonedInLobby(m)).toBe(false); // both connected
    m = roomReduce(m, { t: 'disconnect', connId: 'A' }).model;
    expect(isAbandonedInLobby(m)).toBe(false); // B still connected
    m = roomReduce(m, { t: 'disconnect', connId: 'B' }).model;
    expect(isAbandonedInLobby(m)).toBe(true); // both gone, still lobby

    let started = seatedTwo();
    started = roomReduce(started, { t: 'startGame', connId: 'A' }).model;
    started = roomReduce(started, { t: 'disconnect', connId: 'A' }).model;
    started = roomReduce(started, { t: 'disconnect', connId: 'B' }).model;
    expect(isAbandonedInLobby(started)).toBe(false); // phase is 'paused', not 'lobby'
  });
```

And update the file's import line to pull in the new export:

```ts
import { roomInit, roomReduce, isAbandonedInLobby, type RoomModel } from './roomReducer';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/online/roomReducer.test.ts`
Expected: FAIL — `setName` isn't a recognized `RoomInput` variant (TypeScript error / runtime `undefined` case), `isAbandonedInLobby` isn't exported, and `startGame` always yields `currentTurn: 'p1'` so the "both players went first at least once" assertion fails.

- [ ] **Step 3: Add `name` to the roster wire shape**

In `src/online/protocol.ts`, update `RosterEntry`:

```ts
export interface RosterEntry {
  playerId: PlayerId;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
  name: string | null;
}
```

And add the new client message variant to `ClientMsg`:

```ts
export type ClientMsg =
  | { type: 'join'; token?: string }
  | { type: 'startGame' }
  | { type: 'action'; request: ActionRequest }
  | { type: 'endMatch' }
  | { type: 'setName'; name: string };
```

- [ ] **Step 4: Update `roomReducer.ts`'s model and reducer**

In `src/online/roomReducer.ts`:

Add `name` to the `Slot` interface:

```ts
interface Slot {
  playerId: PlayerId;
  connId: string | null;
  connected: boolean;
  token: string | null;
  name: string | null;
}
```

Update `roomInit` to seed `name: null`:

```ts
export function roomInit(mode: GameMode, playerCount: number): RoomModel {
  const slots: Slot[] = SEAT_ORDER.slice(0, playerCount).map((playerId) => ({
    playerId,
    connId: null,
    connected: false,
    token: null,
    name: null,
  }));
  return { phase: 'lobby', mode, playerCount, slots, hostConnId: null, state: null };
}
```

Update `rosterEntries` to include it:

```ts
function rosterEntries(model: RoomModel): RosterEntry[] {
  return model.slots.map((s) => ({
    playerId: s.playerId,
    color: COLORS[s.playerId],
    connected: s.connected,
    isHost: s.connId !== null && s.connId === model.hostConnId,
    name: s.name,
  }));
}
```

Add `'setName'` to the `RoomInput` union:

```ts
export type RoomInput =
  | { t: 'connect'; connId: string }
  | { t: 'join'; connId: string; token?: string; issueToken: string }
  | { t: 'startGame'; connId: string }
  | { t: 'action'; connId: string; request: ActionRequest }
  | { t: 'endMatch'; connId: string }
  | { t: 'setName'; connId: string; name: string }
  | { t: 'disconnect'; connId: string };
```

Add the `MAX_NAME_LENGTH` constant near the top of the file (below `COLORS`):

```ts
const MAX_NAME_LENGTH = 16;
```

Add the `'setName'` case to `roomReduce`'s `switch` (place it next to `'startGame'`, order among cases doesn't matter):

```ts
    case 'setName': {
      const slot = slotOf(model, input.connId);
      if (!slot) return { model, out: [] };
      const trimmed = input.name.trim().slice(0, MAX_NAME_LENGTH);
      const nextName = trimmed.length > 0 ? trimmed : null;
      const slots = model.slots.map((s) => (s === slot ? { ...s, name: nextName } : s));
      const next: RoomModel = { ...model, slots };
      return { model: next, out: [{ to: 'all', msg: rosterMsg(next) }] };
    }
```

Update `startGame` to randomize the first turn — replace:

```ts
    case 'startGame': {
      if (input.connId !== model.hostConnId) return { model, out: [err(input.connId, 'Only the host can start.')] };
      if (model.phase !== 'lobby') return { model, out: [err(input.connId, 'The game has already started.')] };
      if (!model.slots.every((s) => s.connId !== null && s.connected)) return { model, out: [err(input.connId, 'The room is not full yet.')] };
      const state = createInitialGameState(model.mode, model.playerCount);
      const next: RoomModel = { ...model, phase: 'playing', state };
      return { model: next, out: [{ to: 'all', msg: { type: 'gameStart', state } }, { to: 'all', msg: rosterMsg(next) }] };
    }
```

with:

```ts
    case 'startGame': {
      if (input.connId !== model.hostConnId) return { model, out: [err(input.connId, 'Only the host can start.')] };
      if (model.phase !== 'lobby') return { model, out: [err(input.connId, 'The game has already started.')] };
      if (!model.slots.every((s) => s.connId !== null && s.connected)) return { model, out: [err(input.connId, 'The room is not full yet.')] };
      const initial = createInitialGameState(model.mode, model.playerCount);
      const firstTurn = initial.turnOrder[Math.floor(Math.random() * initial.turnOrder.length)];
      const state = { ...initial, currentTurn: firstTurn };
      const next: RoomModel = { ...model, phase: 'playing', state };
      return { model: next, out: [{ to: 'all', msg: { type: 'gameStart', state } }, { to: 'all', msg: rosterMsg(next) }] };
    }
```

Add the exported helper at the bottom of the file (after `roomReduce`'s closing brace):

```ts
// True once a room's last connected player has left while it was still in the lobby
// (never started) — the signal server.ts uses to auto-delist it from the public lobby.
export function isAbandonedInLobby(model: RoomModel): boolean {
  return model.phase === 'lobby' && model.slots.every((s) => !s.connected);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/online/roomReducer.test.ts`
Expected: PASS (all tests, including the 6 new ones).

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: PASS. (`useOnlineRoom.ts` and other consumers of `RosterEntry`/`ClientMsg` don't destructure `name` yet, so adding the field is non-breaking; `ClientMsg`'s new variant is additive to a discriminated union, non-breaking for existing `switch` statements that don't exhaustively require every case handled — `useOnlineRoom.ts`'s `onMessage` switches on `ServerMsg`, not `ClientMsg`, so it's unaffected here.)

- [ ] **Step 7: Commit**

```bash
git add src/online/protocol.ts src/online/roomReducer.ts src/online/roomReducer.test.ts
git commit -m "feat: add custom player names, randomized online first turn, abandoned-room detection"
```

---

### Task 3: Server wiring — auto-delist abandoned public rooms

**Files:**
- Modify: `server/src/server.ts`

**Interfaces:**
- Consumes: `isAbandonedInLobby(model: RoomModel): boolean` from Task 2's `src/online/roomReducer.ts`.
- Produces: `LobbyServer.unregisterRoom(code: string): Promise<void>` — a public method invoked via Durable Object RPC (a stub obtained from `env.LobbyServer.get(id)` can call it directly; this is not a new client-facing wire message).

**Note:** `server/src/server.ts` is outside the root `tsconfig`'s `include: ["src"]`, so it is not covered by `npm run build`'s `tsc -b` gate — only `wrangler dev`/`wrangler deploy` (esbuild-based, type-stripping, no type-checking) run it. Verification for this task is running `wrangler dev` and manually exercising abandonment, per this file's existing lack of unit test coverage.

- [ ] **Step 1: Add the `unregisterRoom` RPC method to `LobbyServer`**

In `server/src/server.ts`, inside the `LobbyServer` class (after the `model` field, before `onMessage`), add:

```ts
  // Callable via Durable Object RPC from ScavengersServer when a room is abandoned
  // while still in its lobby (see ScavengersServer.dispatch below) — not a client wire message.
  async unregisterRoom(code: string): Promise<void> {
    const step = lobbyReduce(this.model, { t: 'unregister', code });
    this.model = step.model;
    this.broadcast(JSON.stringify({ type: 'rooms', rooms: Object.values(this.model.rooms) }));
  }
```

- [ ] **Step 2: Call it from `ScavengersServer.dispatch` on abandonment**

Update the import line at the top of `server/src/server.ts`:

```ts
import { roomInit, roomReduce, isAbandonedInLobby, type RoomInput, type RoomModel } from '../../src/online/roomReducer';
```

Change `ScavengersServer.dispatch` from:

```ts
  private dispatch(input: RoomInput) {
    if (!this.model) return;
    const step = roomReduce(this.model, input);
    this.model = step.model;
    for (const o of step.out) {
      const payload = JSON.stringify(o.msg);
      if (o.to === 'all') this.broadcast(payload);
      else this.getConnection(o.to.connId)?.send(payload);
    }
  }
```

to:

```ts
  private dispatch(input: RoomInput) {
    if (!this.model) return;
    const step = roomReduce(this.model, input);
    this.model = step.model;
    for (const o of step.out) {
      const payload = JSON.stringify(o.msg);
      if (o.to === 'all') this.broadcast(payload);
      else this.getConnection(o.to.connId)?.send(payload);
    }
    if (input.t === 'disconnect' && isAbandonedInLobby(this.model)) {
      this.delistFromLobby();
    }
  }

  // Best-effort: if this fails, the room simply lingers in the public list until someone
  // clicks it and gets an error — not a correctness issue, just a stale-listing cosmetic one.
  private delistFromLobby() {
    type LobbyStub = { unregisterRoom(code: string): Promise<void> };
    type LobbyNamespace = { idFromName(name: string): unknown; get(id: unknown): LobbyStub };
    const lobbyNs = (this.env as Record<string, unknown>).LobbyServer as LobbyNamespace;
    const stub = lobbyNs.get(lobbyNs.idFromName('lobby'));
    stub.unregisterRoom(this.name).catch((err: unknown) => {
      console.error('Failed to delist abandoned room:', err);
    });
  }
```

- [ ] **Step 3: Manually verify with `wrangler dev`**

Run: `cd server && npm run dev` (or use the `scavengers-server` preview launch config already in `.claude/launch.json` from the prior online-orchestrator session).

With the Vite dev server also running, in one browser tab: Online → Create Game → Create Public Room. In a second tab (or a raw WebSocket script, as used in this project's earlier online-orchestrator playtest): Online → Join Game — confirm the room appears in the public list. Close the host's tab (or otherwise disconnect the only connected socket) before starting the game. Refresh the Join list in the remaining tab (or query the lobby party directly) — confirm the room no longer appears.

Expected: the room is present in the list before the disconnect and absent after.

- [ ] **Step 4: Commit**

```bash
git add server/src/server.ts
git commit -m "feat: auto-delist abandoned public rooms from the lobby"
```

---

### Task 4: Shared popup components (`Modal`, `TextInputPopup`, `BackArrow`)

**Files:**
- Create: `src/components/Modal.tsx`
- Create: `src/components/TextInputPopup.tsx`
- Create: `src/components/BackArrow.tsx`
- Modify: `src/components/menu/MenuFlow.tsx` (remove its local `BackArrow` definition, import the shared one)
- Modify: `src/online/OnlineSession.tsx` (remove its local `BackArrow` definition, import the shared one)

**Interfaces:**
- Produces: `Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode })`; `TextInputPopup({ title, placeholder?, initialValue?, confirmLabel?, maxLength?, onConfirm, onClose }: {...})`; `BackArrow({ onClick }: { onClick: () => void })` — same visual as today's duplicated implementations (44×44, `theme.surface`/`theme.border`, `←` glyph), consumed by Task 5 and Task 6.
- Consumes: `theme` from `../theme`.

- [ ] **Step 1: Create `Modal.tsx`**

```tsx
import type { ReactNode } from 'react';
import { theme } from '../theme';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.scrim,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: theme.radius,
          boxShadow: theme.shadow,
          padding: 32,
          minWidth: 360,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            fontSize: 18,
            lineHeight: 1,
            borderRadius: 8,
            background: theme.surfaceAlt,
            border: `1px solid ${theme.border}`,
            color: theme.text,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
        <h2 style={{ fontSize: 22, margin: 0, color: theme.heading }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `TextInputPopup.tsx`**

```tsx
import { useState } from 'react';
import { Modal } from './Modal';
import { theme } from '../theme';

export function TextInputPopup({
  title,
  placeholder,
  initialValue = '',
  confirmLabel = 'Confirm',
  maxLength,
  onConfirm,
  onClose,
}: {
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  maxLength?: number;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const submit = () => {
    if (value.trim()) onConfirm(value.trim());
  };
  return (
    <Modal title={title} onClose={onClose}>
      <input
        autoFocus
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '14px 16px',
          fontSize: 18,
          borderRadius: 8,
          background: theme.surfaceAlt,
          border: `1px solid ${theme.border}`,
          color: theme.text,
          textAlign: 'center',
          letterSpacing: 2,
        }}
      />
      <button
        onClick={submit}
        style={{
          padding: '14px 32px',
          fontSize: 16,
          fontWeight: 700,
          background: theme.accent,
          border: `1px solid ${theme.accent}`,
          color: '#fff',
          borderRadius: 10,
          cursor: 'pointer',
        }}
      >
        {confirmLabel}
      </button>
    </Modal>
  );
}
```

- [ ] **Step 3: Create `BackArrow.tsx`**

```tsx
import { theme } from '../theme';

export function BackArrow({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Back"
      style={{
        width: 44,
        height: 44,
        fontSize: 22,
        lineHeight: 1,
        borderRadius: 10,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        color: theme.text,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      ←
    </button>
  );
}
```

(This is the same visual as both of today's local `BackArrow` definitions, minus the `position: absolute; top: 24; left: 24` — Task 5 repositions its usage inline with the surrounding layout instead of pinning it to the viewport corner.)

- [ ] **Step 4: Remove the duplicated local definitions and import the shared one**

In `src/components/menu/MenuFlow.tsx`, delete the local `function BackArrow(...)` block (currently right after the `screenWrap` style), and add to the top imports:

```ts
import { BackArrow } from '../BackArrow';
```

In `src/online/OnlineSession.tsx`, delete its local `function BackArrow(...)` block, and add to the top imports:

```ts
import { BackArrow } from '../components/BackArrow';
```

Leave every call site (`<BackArrow onClick={...} />`) as-is for now — Task 5 changes how it's laid out, this step only removes the duplication.

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: PASS. (No behavior change yet — `BackArrow` still renders identically since Task 5 hasn't repositioned its usage. If `MenuFlow.tsx`/`OnlineSession.tsx` still reference `position: absolute` wrapping at their call sites, that's untouched here and still works.)

- [ ] **Step 6: Commit**

```bash
git add src/components/Modal.tsx src/components/TextInputPopup.tsx src/components/BackArrow.tsx src/components/menu/MenuFlow.tsx src/online/OnlineSession.tsx
git commit -m "refactor: extract shared Modal, TextInputPopup, and BackArrow components"
```

---

### Task 5: Menu restyle — bigger chrome, create-game popup, join-code popup

**Files:**
- Modify: `src/components/menu/MenuFlow.tsx`

**Interfaces:**
- Consumes: `Modal`, `TextInputPopup`, `BackArrow` from Task 4. `EnterRoomConfig`/`onEnterRoom` are unchanged (same shape as today).

- [ ] **Step 1: Enlarge the shared style constants**

Replace the style constant block (`card`, `rowLabel`, `toggleBtn`, `primaryBtn`, `screenWrap`) with:

```tsx
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
```

- [ ] **Step 2: Reposition the back arrow inline with the title row instead of the viewport corner**

Add this helper right below `titleStyle` (used by both the `settings` and `join` screens, which both show a back arrow + title):

```tsx
function TitleRow({ onBack, title }: { onBack?: () => void; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: 420, maxWidth: '100%' }}>
      {onBack && <BackArrow onClick={onBack} />}
      <h1 style={{ ...titleStyle, fontSize: 44 }}>{title}</h1>
    </div>
  );
}
```

(The root `gameType` screen keeps its own full-size, no-back-arrow title — see Step 3 — this `TitleRow` is for the secondary screens that need a back arrow, at a slightly smaller size since it shares a row with the arrow.)

- [ ] **Step 3: Update the root `gameType` screen**

Replace its returned JSX:

```tsx
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
```

with:

```tsx
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
```

Also enlarge `typeBtn`'s inline override just above (currently `padding: '16px 26px', fontSize: 16`) to `padding: '18px 30px', fontSize: 18`.

- [ ] **Step 4: Update the `settings` screen — `TitleRow`, bigger card, and the create-game popup**

Add two new pieces of state right after the existing `const [creating, setCreating] = useState(false);` line:

```tsx
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [showCodePopup, setShowCodePopup] = useState(false);
```

`creating` becomes dead once the popup replaces the inline `creating`-gated button row — remove the `const [creating, setCreating] = useState(false);` line and both of its remaining references (`setCreating(false)` in the two `onClick`s that reset it when navigating away, and the `creating ? (...) : (...)` branch) as part of this step, replacing them with the popup-driven flow below.

Replace the whole `settings` screen block with:

```tsx
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
          <div style={{ display: 'flex', gap: 16 }}>
            <button style={primaryBtn} onClick={() => setScreen('join')}>Join Game</button>
            <button style={primaryBtn} onClick={() => setShowCreatePopup(true)}>Create Game</button>
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
      </div>
    );
  }
```

- [ ] **Step 5: Update `JoinScreen` — bigger chrome + a code-entry popup instead of `window.prompt`**

Replace the whole `JoinScreen` function with:

```tsx
function JoinScreen({ onBack, onEnterRoom }: { onBack: () => void; onEnterRoom: (config: EnterRoomConfig) => void }) {
  const { rooms, refresh } = useLobby();
  const [showCodePopup, setShowCodePopup] = useState(false);
  return (
    <div style={screenWrap}>
      <TitleRow onBack={onBack} title="Join a Game" />
      <div style={{ display: 'flex', gap: 14 }}>
        <button
          style={{ ...toggleBtn(false), margin: 0, padding: '14px 26px', fontSize: 16 }}
          onClick={() => setShowCodePopup(true)}
        >
          Enter code
        </button>
        <button
          style={{ ...toggleBtn(false), margin: 0, padding: '14px 26px', fontSize: 16 }}
          onClick={refresh}
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
```

- [ ] **Step 6: Add the new imports**

At the top of `MenuFlow.tsx`, add:

```ts
import { Modal } from '../Modal';
import { TextInputPopup } from '../TextInputPopup';
```

(`BackArrow` was already imported in Task 4.)

- [ ] **Step 7: Run the build**

Run: `npm run build`
Expected: PASS. Check for `noUnusedLocals` failures — the removed `creating`/`setCreating` state must have no leftover references (grep the file for `creating` to confirm none remain outside the deleted block).

- [ ] **Step 8: Manual verification**

Start the dev server (`npm run dev` or the `scavengers-dev` preview launch config) and click through: gameType → In Person → settings (confirm bigger text/buttons, primary "Start Game" button unchanged size) → back (confirm the arrow sits next to the title, not pinned to the corner) → Online → settings → Create Game (confirm the popup opens with an × close button, backdrop click closes it, Create Public/Private Room buttons work) → Join Game → Enter code (confirm a popup with a text field appears, not a native `window.prompt`).

- [ ] **Step 9: Commit**

```bash
git add src/components/menu/MenuFlow.tsx
git commit -m "feat: restyle menu chrome, add create-game and join-code popups"
```

---

### Task 6: Room screen — always show code, rename popup, host reorder, join-result toast

**Files:**
- Modify: `src/online/OnlineSession.tsx`

**Interfaces:**
- Consumes: `Modal`/`TextInputPopup`/`BackArrow` (Task 4), `RosterEntry.name` and the `setName` `ClientMsg` (Task 2). `room.send({ type: 'setName', name })` uses `OnlineRoom.send: (msg: ClientMsg) => void`, already generic in `useOnlineRoom.ts` — no changes needed there.

- [ ] **Step 1: Add rename-popup state, always show the code, and reorder the roster for display**

Replace the whole `OnlineSession` function body (everything from `export function OnlineSession({` to its closing `}`) with:

```tsx
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
          const label = `${entry.name || entry.color.toUpperCase()}${isMe ? ' (you)' : ''}${entry.isHost ? ' (host)' : ''}`;
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
              <span>{label}</span>
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
            setShowRenamePopup(false);
          }}
          onClose={() => setShowRenamePopup(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update imports**

Replace the top of `src/online/OnlineSession.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { GameMode } from '../engine';
import { theme } from '../theme';
import { useOnlineRoom } from './useOnlineRoom';
import { useLobbyRegistration } from './useLobby';
import type { LobbyRow } from './protocol';
import { OnlineGame } from './OnlineGame';
import { Modal } from '../components/Modal';
import { TextInputPopup } from '../components/TextInputPopup';
import { BackArrow } from '../components/BackArrow';
```

(`Modal` is imported here even though this step doesn't use it directly in the JSX above it — it's unused after this task's edits, so **do not** add it; only add `TextInputPopup` and `BackArrow`. Re-check the final file for `noUnusedLocals` before running the build.)

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: PASS. If `Modal` triggers a `noUnusedLocals` error, remove that import (per the note in Step 2 — it was listed defensively but this task doesn't render `<Modal>` directly, only `<TextInputPopup>`, which itself renders `Modal` internally).

- [ ] **Step 4: Run the room-reducer-adjacent suite and full suite**

Run: `npx vitest run`
Expected: PASS — this task doesn't change any pure/tested module, only `OnlineSession.tsx`, so this is a regression check.

- [ ] **Step 5: Manual verification**

With `wrangler dev` + the Vite dev server running (per Task 3's setup), create a private room as host, confirm: the room code is visible, a small ✎ button sits next to your own row (not the other empty slot), clicking it opens a popup prefilled with your current name, saving a name updates your row's label to the name instead of the color. Join as a second simulated client (per the earlier online-orchestrator session's raw-WebSocket technique) and confirm their row appears too, and disconnecting/reconnecting the host causes the new host's row to render first once host reassignment happens (drop the original host's connection while a second player is present, confirm the second player's row moves to the top and gains "(host)").

- [ ] **Step 6: Commit**

```bash
git add src/online/OnlineSession.tsx
git commit -m "feat: show room code always, add rename popup, host-first roster display, join-result toast"
```

---

### Task 7: `OnlineGame` — viewer-aware names, notifications, turn-label fix, random-turn reveal

**Files:**
- Modify: `src/components/ResourceBars.tsx`
- Modify: `src/components/Leaderboard.tsx`
- Modify: `src/online/OnlineGame.tsx`

**Interfaces:**
- Consumes: `room.roster[].name` (Task 2/6), `theme.scrim` (already exists).
- Produces: `ResourceBars`'s new optional props `showTurnLabel?: boolean` (default `true`) and `displayName?: string`; `Leaderboard`'s new optional prop `displayName?: (id: PlayerId) => string`. Both default to today's exact behavior when omitted, so `App.tsx`'s hotseat call sites need **no changes**.

- [ ] **Step 1: Fix the `ResourceBars` "— your turn" bug and add a name override**

Replace `src/components/ResourceBars.tsx`'s `ResourceBarsProps` interface and the component's header row:

```tsx
interface ResourceBarsProps {
  player: PlayerState;
  width: number;
  // Hypothetical resources if the pending (unconfirmed) action were confirmed.
  preview?: ResourcePreview | null;
  // Whether to show "— your turn" next to the name. Defaults to true (hotseat's only call
  // site always renders this component during the viewing player's own turn already).
  showTurnLabel?: boolean;
  // Overrides the color-based name (e.g. a custom online display name). Falls back to
  // player.color.toUpperCase() when omitted.
  displayName?: string;
}
```

```tsx
export function ResourceBars({ player, width, preview, showTurnLabel = true, displayName }: ResourceBarsProps) {
  return (
    <div
      style={{
        width,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        boxShadow: theme.shadow,
        padding: '12px 14px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: player.color, display: 'inline-block' }} />
        <strong style={{ color: theme.heading }}>{displayName ?? player.color.toUpperCase()}</strong>
        {showTurnLabel && <span style={{ color: theme.textMuted, fontSize: 12 }}>— your turn</span>}
      </div>
      <Bar label="Energy" value={player.energy} max={MAX_ENERGY} color={theme.energy} previewValue={preview?.energy} />
      <Bar label="Ammo" value={player.ammo} max={MAX_AMMO} color={theme.ammo} previewValue={preview?.ammo} />
    </div>
  );
}
```

- [ ] **Step 2: Add a `displayName` override to `Leaderboard`**

Update `src/components/Leaderboard.tsx`'s imports and props:

```tsx
import type { GameState, PlayerId } from '../engine';
import { theme } from '../theme';

interface LeaderboardProps {
  state: GameState;
  // Overrides the color-based label per player (e.g. a custom online display name).
  // Falls back to color.toUpperCase() when omitted (hotseat's call sites omit it).
  displayName?: (id: PlayerId) => string;
}
```

And its row-rendering line — change:

```tsx
              <td style={{ ...td, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                {p.color.toUpperCase()}
              </td>
```

to:

```tsx
              <td style={{ ...td, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                {displayName ? displayName(p.id) : p.color.toUpperCase()}
              </td>
```

And update the component signature: `export function Leaderboard({ state, displayName }: LeaderboardProps) {`.

- [ ] **Step 3: Run the build to confirm the shared components are still backward-compatible**

Run: `npm run build`
Expected: PASS — `App.tsx`'s existing `<Leaderboard state={state} />` and `<ResourceBars player={barsPlayer} width={columnWidth} preview={preview} />` calls (hotseat) compile unchanged since both new props are optional.

- [ ] **Step 4: `OnlineGame.tsx` — add `PlayerId` import and a `nameFor`/`describe` helper**

Add `PlayerId` to the existing engine import list at the top of `src/online/OnlineGame.tsx` (it currently imports `GameState`, `Position`, and several functions/constants — add `type PlayerId` alongside `type GameState`, `type Position`).

Inside the `OnlineGame` component, right after the line `const me = state.players[viewerId];` (around line 286), add:

```tsx
  // Custom name if the player set one, else their color as stored by the engine (already
  // lowercase, e.g. 'green') — used for every online notification/label below.
  const nameFor = (id: PlayerId): string => {
    const entry = room.roster.find((r) => r.playerId === id);
    return entry?.name || state.players[id].color;
  };
  // Renders a player for viewer-aware notification text: the viewer sees "You"/"you"
  // (capitalized only when sentenceStart is true) for themselves, and nameFor(id) otherwise.
  const describe = (id: PlayerId, sentenceStart: boolean): string => {
    if (id === viewerId) return sentenceStart ? 'You' : 'you';
    return nameFor(id);
  };
```

- [ ] **Step 5: Rewrite the kill-notification block to always name both sides, with "You" substitution and a self-kill special case**

Replace the `notifications` state type declaration (around line 90-92):

```tsx
  const [notifications, setNotifications] = useState<
    { id: number; killerColor: string; killerName: string; victimColor: string; victimName: string; verb: string }[]
  >([]);
```

with:

```tsx
  const [notifications, setNotifications] = useState<
    { id: number; killerId: PlayerId; victimId: PlayerId; verb: string }[]
  >([]);
```

Replace the whole `if (event.killedPlayerIds.length) { ... }` block (around lines 172-197) with:

```tsx
    if (event.killedPlayerIds.length) {
      const req = event.request;
      const verb = req.kind === 'move' ? 'crushed' : req.kind === 'attack' ? attackVerb[req.type] : null;
      if (verb) {
        setNotifications((list) => {
          const additions = event.killedPlayerIds.map((victimId) => ({
            id: notificationIdRef.current++,
            killerId: event.actorId,
            victimId,
            verb,
          }));
          return [...list, ...additions];
        });

        const selfKill = event.killedPlayerIds.length === 1 && event.killedPlayerIds[0] === event.actorId;
        let killMsg: string;
        if (selfKill) {
          killMsg =
            event.actorId === viewerId
              ? `You ${verb} yourself!`
              : `${nameFor(event.actorId)} ${verb} themselves!`;
        } else {
          const subject = describe(event.actorId, true);
          const victims = event.killedPlayerIds.map((id) => describe(id, false)).join(', ');
          const suffix = after.winner === null && verb !== 'crushed' ? ' — +1 extra turn!' : '!';
          killMsg = `${subject} ${verb} ${victims}${suffix}`;
        }
        pushActionNotice(killMsg, 'kill');
      }
    }
```

(Known accepted scope limit, matching the design spec's literal examples: if a single attack kills the actor *and* other players in the same event, the actor is rendered via the normal `describe` path inside the victim list rather than getting its own special phrasing — only the sole-self-kill case gets the "yourself"/"themselves" wording.)

- [ ] **Step 6: Update the "Kills" panel renderer to use the new per-notification ids**

Replace the notification-rendering block inside the returned JSX (around lines 665-678):

```tsx
              {notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: theme.heading,
                    animation: 'notificationIn 0.25s ease',
                  }}
                >
                  <span style={{ color: n.killerColor }}>{n.killerName.toUpperCase()}</span>
                  {` ${n.verb} `}
                  <span style={{ color: n.victimColor }}>{n.victimName.toUpperCase()}</span>
                </div>
              ))}
```

with:

```tsx
              {notifications.map((n) => {
                const selfKill = n.killerId === n.victimId;
                return (
                  <div
                    key={n.id}
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: theme.heading,
                      animation: 'notificationIn 0.25s ease',
                    }}
                  >
                    <span style={{ color: state.players[n.killerId].color }}>{describe(n.killerId, true)}</span>
                    {selfKill ? (
                      ` ${n.verb} themselves`
                    ) : (
                      <>
                        {` ${n.verb} `}
                        <span style={{ color: state.players[n.victimId].color }}>{describe(n.victimId, false)}</span>
                      </>
                    )}
                  </div>
                );
              })}
```

- [ ] **Step 7: Update `renderColoredText` to highlight names (not just color words) in toast text**

Replace `renderColoredText`'s signature and body (around lines 43-51):

```tsx
function renderColoredText(text: string, nameColorMap: Map<string, string>): ReactNode[] {
  return text.split(/([A-Za-z]+)/).map((tok, i) => {
    const color = nameColorMap.get(tok.toLowerCase());
    return color ? (
      <span key={i} style={{ color, fontWeight: 800, textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}>{tok}</span>
    ) : (
      <span key={i}>{tok}</span>
    );
  });
}
```

Replace the `colorSet` construction (around line 290) — change:

```tsx
  const colorSet = new Set(state.turnOrder.map((id) => state.players[id].color.toLowerCase()));
```

to:

```tsx
  const nameColorMap = new Map<string, string>(
    state.turnOrder.map((id) => [nameFor(id).toLowerCase(), state.players[id].color] as const)
  );
  nameColorMap.set('you', me.color);
```

And update the `renderColoredText(n.text, colorSet)` call site (around line 547) to `renderColoredText(n.text, nameColorMap)`.

(Known accepted limitation, same class as the pre-existing regex-based highlighter it replaces: multi-word custom names won't be matched as a single highlighted span, since the split is per single word. Single-word names — the common case for a 16-character-max field — work correctly.)

- [ ] **Step 8: Fix `statusText` and the `ResourceBars`/`Leaderboard` call sites to use display names**

Update the `statusText` line (around line 553):

```tsx
  const statusText = sending || animating ? 'Resolving…' : !myTurn ? `Waiting for ${state.players[state.currentTurn].color}…` : null;
```

to:

```tsx
  const statusText = sending || animating ? 'Resolving…' : !myTurn ? `Waiting for ${nameFor(state.currentTurn)}…` : null;
```

Update the `<ResourceBars .../>` call site (around line 607):

```tsx
            <ResourceBars player={me} width={columnWidth} preview={preview} />
```

to:

```tsx
            <ResourceBars player={me} width={columnWidth} preview={preview} showTurnLabel={myTurn} displayName={nameFor(viewerId)} />
```

Find `OnlineGame`'s `<Leaderboard .../>` call site (search the file for `<Leaderboard`) and add the `displayName` prop:

```tsx
<Leaderboard state={state} displayName={nameFor} />
```

(keep whatever other props/wrapping it already has — only add `displayName={nameFor}`).

- [ ] **Step 9: Add the random-first-turn reveal overlay**

Add new state near the component's other `useState`/`useRef` declarations (before the early-return guard, so hook order stays stable across renders — place it right after the `cellSize` line, alongside `notifications`/`actionNotices`):

```tsx
  const [revealing, setRevealing] = useState(true);
  const [highlightId, setHighlightId] = useState<PlayerId | null>(null);
  const revealStartedRef = useRef(false);

  useEffect(() => {
    if (revealStartedRef.current || !room.state) return;
    revealStartedRef.current = true;
    const order = room.state.turnOrder;
    let i = 0;
    setHighlightId(order[0]);
    const interval = window.setInterval(() => {
      i = (i + 1) % order.length;
      setHighlightId(order[i]);
    }, 120);
    const stop = window.setTimeout(() => {
      window.clearInterval(interval);
      setHighlightId(room.state!.currentTurn);
      window.setTimeout(() => setRevealing(false), 500);
    }, 1500);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.state]);
```

Render the overlay right after `{pausedOverlay}` in the returned JSX (inside the `return (<div style={{ minHeight: '100vh', ... }}>` block, so after the guard where `state`/`me` are defined):

```tsx
      {revealing && highlightId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: theme.scrim,
            zIndex: 400,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <div style={{ fontSize: 18, color: theme.textMuted, fontWeight: 600, letterSpacing: 1 }}>
            Choosing first turn…
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            {state.turnOrder.map((id) => (
              <div
                key={id}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: state.players[id].color,
                  opacity: id === highlightId ? 1 : 0.35,
                  transform: id === highlightId ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.1s ease',
                  boxShadow: id === highlightId ? `0 0 24px ${state.players[id].color}` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 10: Run the build**

Run: `npm run build`
Expected: PASS. Watch specifically for `noUnusedLocals` on the now-unused `killerColor`/`killerName`/`victimColor`/`victimName` fields (they were fully replaced, not left dangling) and for the `PlayerId` type import actually being used (it is, in `nameFor`/`describe`/the new state types).

- [ ] **Step 11: Run the full suite**

Run: `npx vitest run`
Expected: PASS — this task touches no pure/tested module (`ResourceBars.tsx`/`Leaderboard.tsx`/`OnlineGame.tsx` have no dedicated unit tests today per this project's convention of testing engine/reducer logic, not components).

- [ ] **Step 12: Manual verification**

With `wrangler dev` + Vite dev server running and two simulated clients (per the earlier online-orchestrator session's technique): start a match, confirm the "Choosing first turn…" color-cycle overlay appears for ~1.5s before the board is interactive, and that it lands on whichever player the server actually gave `currentTurn` to (cross-check against the `gameStart` payload). Confirm the "— your turn" label only shows on the acting player's own `ResourceBars`, never on the "Waiting for X…" screen. Set a custom name on one client (per Task 6) and confirm it replaces that player's color in: the Leaderboard, the "Waiting for {name}…" status text, and kill notifications/toasts from every viewer's screen. Trigger a kill and confirm: the acting player's own screen says "You bombed {victim}!", other viewers' screens say "{actor} bombed {victim}!", and the victim's own screen says "{actor} bombed you!". If reachable (e.g. a bomb catching the actor in their own blast with no other victims), confirm the self-kill phrasing ("You bombed yourself!" / "{actor} bombed themselves!" on other screens).

- [ ] **Step 13: Commit**

```bash
git add src/components/ResourceBars.tsx src/components/Leaderboard.tsx src/online/OnlineGame.tsx
git commit -m "feat: viewer-aware names and notification phrasing, fix turn-label bug, add first-turn reveal"
```

---

## Self-Review Notes (from the plan-writing pass)

- **Spec coverage:** all 8 items from the design spec map to a task — Task 1 (ammo balance), Task 2+3 (random turn, names wire format, abandoned-room detection + delisting), Task 4+5 (menu restyle + popups), Task 6 (room code, rename, host reorder, join toast), Task 7 (turn-label fix, viewer-aware notifications, reveal animation).
- **Placeholder scan:** no TBDs; the two deliberately-scoped-out edge cases (mixed self+other-victim kills; multi-word custom name highlighting) are called out explicitly as accepted limitations with the reasoning, not silently dropped.
- **Type consistency:** `RosterEntry.name: string | null` (Task 2) is read the same way in Task 6 (`entry?.name`) and Task 7 (`entry?.name`, via `nameFor`). `isAbandonedInLobby` exported from Task 2 is imported with the exact same name/signature in Task 3. `ClientMsg`'s `setName` variant fields (`name: string`) match `room.send({ type: 'setName', name })` call sites in Task 6.
