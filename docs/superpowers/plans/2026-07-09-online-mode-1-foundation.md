# Online Mode — Plan 1: Foundation (protocol + action reducer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, framework-agnostic foundation for online mode — the shared wire-protocol types and a server-authoritative action reducer — fully unit-tested against the real engine, with no networking and no React changes yet.

**Architecture:** All pure online logic lives under `src/online/` (not `server/src/`) so it is imported by BOTH the client and the server, and so its tests are discovered by the existing Vitest config (`include: ['src/**/*.test.ts']`). The reducer wraps the existing engine (`movePlayer` / `restPlayer` / `fakeMove` / `punch` / `shoot` / `bomb` → `resolveAttack` → `endTurn`) with turn/legality validation, replicating the exact action contract in `App.tsx`'s `handleConfirm` (including the phantom-crush case).

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`, `noUnusedLocals`), Vitest, the existing pure engine in `src/engine`.

## Global Constraints

- Strict TypeScript: type-only imports MUST use `import type`; unused locals fail the build. `npm run build` (tsc -b + vite build) is the real gate.
- No new dependencies in this plan. No engine changes. No React/App changes.
- Pure online logic lives under `src/online/` and imports the engine via `../engine` (the barrel). It must remain free of DOM/React/network imports so the server can import it via `../../src/online/...`.
- Tests live beside the code as `src/online/*.test.ts` (Vitest only scans `src/**/*.test.ts`).
- This plan deviates from the spec's stated file locations (`server/src/protocol.ts` / `server/src/actionReducer.ts`): the canonical copies live under `src/online/` instead, for test discovery and single-source sharing. The server (Plan 2) imports them.

## Reference: exact engine signatures (already implemented)

From `src/engine` (barrel `src/engine/index.ts`):
- `movePlayer(state: GameState, playerId: PlayerId, path: Position[]): GameState` — throws on illegal path (non-adjacent, out-of-bounds, wall, path length not 1..2, insufficient energy).
- `restPlayer(state: GameState, playerId: PlayerId): GameState`.
- `fakeMove(state: GameState, playerId: PlayerId, direction: Position): GameState` — throws if energy < 2 or display pos out of bounds.
- `punch(state, attackerId, targetPos: Position): { state: GameState; killedPlayerIds: PlayerId[] }` — throws if target not adjacent or energy < 2.
- `shoot(state, attackerId, direction: Position): { state; killedPlayerIds }` — throws if ammo < 1 or energy < 1.
- `bomb(state, attackerId, targetPos: Position): { state; killedPlayerIds }` — throws if ammo < 2 or target not on a straight line.
- `resolveAttack(result: { state; killedPlayerIds }, attackerId: PlayerId): GameState`.
- `endTurn(state: GameState, actorId: PlayerId, gotKill: boolean): GameState` — flips `currentTurn` UNLESS `gotKill` (kill grants an extra turn).
- `createInitialGameState(mode: GameMode, playerCount?: number): GameState`.
- Types: `GameState`, `PlayerId` (`'p1'|'p2'|'p3'|'p4'`), `PlayerColor`, `GameMode`, `Position`.

`GameState` shape (relevant fields): `{ board: Tile[][]; players: Record<PlayerId, PlayerState>; turnOrder: PlayerId[]; currentTurn: PlayerId; winner: PlayerId | null; ... }`. `PlayerState` includes `position`, `energy`, `ammo`, `alive`, `eliminated`, `isPhantom`, `phantomDisplayPosition`, `immuneTurns`.

`App.tsx`'s `handleConfirm` action contract this reducer replicates:
- **move:** detect phantom-crush (an enemy phantom whose REAL tile is on the path) → `movePlayer` → if any squashed, mark them `alive:false`, `resolveAttack(..., actorId)`, `endTurn(acted, actorId, false)` (a crush grants NO extra turn); else `endTurn(moved, actorId, false)`.
- **rest:** `restPlayer` → `endTurn(..., false)`.
- **fakeMove:** `fakeMove(state, actorId, dir)` → `endTurn(..., false)`.
- **attack:** optional reposition `base = path.length ? movePlayer(state, actorId, path) : state`; `from = path.length ? path[last] : actor.position`; run `punch(base, actorId, target)` / `shoot(base, actorId, {x:target.x-from.x, y:target.y-from.y})` / `bomb(base, actorId, target)`; `resolveAttack(result, actorId)`; `endTurn(acted, actorId, gotKill)` where `gotKill = killedPlayerIds.length > 0`.

---

## Task 1: Shared wire-protocol types

**Files:**
- Create: `src/online/protocol.ts`

**Interfaces:**
- Produces: `RoomPhase`, `RosterEntry`, `AttackKind`, `ActionRequest`, `ActionEvent`, `ClientMsg`, `ServerMsg`, `LobbyRow`, `LobbyClientMsg`, `LobbyServerMsg` (all exported types). Task 2 consumes `ActionRequest` and `ActionEvent`.

This task adds only type declarations (no runtime behavior), so it is verified by the typecheck/build, not a unit test.

- [ ] **Step 1: Create the protocol file**

Create `src/online/protocol.ts`:

```ts
import type { GameState, GameMode, PlayerId, PlayerColor, Position } from '../engine';

// ---- Room lifecycle ----
export type RoomPhase = 'lobby' | 'playing' | 'paused' | 'over';

export interface RosterEntry {
  playerId: PlayerId;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
}

// ---- Actions (client -> server intent; also echoed inside ActionEvent) ----
export type AttackKind = 'punch' | 'shoot' | 'bomb';

export type ActionRequest =
  | { kind: 'move'; path: Position[] }
  | { kind: 'rest' }
  | { kind: 'fakeMove'; dir: Position }
  | { kind: 'attack'; type: AttackKind; path: Position[]; target: Position };

// What actually happened, broadcast so every client can reconstruct animation frames.
export interface ActionEvent {
  actorId: PlayerId;
  request: ActionRequest;
  killedPlayerIds: PlayerId[];
}

// ---- Room party messages ----
export type ClientMsg =
  | { type: 'join' }
  | { type: 'startGame' }
  | { type: 'action'; request: ActionRequest }
  | { type: 'endMatch' };

export type ServerMsg =
  | { type: 'assigned'; playerId: PlayerId }
  | { type: 'roster'; entries: RosterEntry[]; phase: RoomPhase; mode: GameMode; playerCount: number }
  | { type: 'gameStart'; state: GameState }
  | { type: 'state'; state: GameState; event: ActionEvent }
  | { type: 'paused'; disconnected: PlayerId }
  | { type: 'resumed'; state: GameState }
  | { type: 'over'; state: GameState }
  | { type: 'error'; message: string };

// ---- Lobby (public-room registry) messages ----
export interface LobbyRow {
  code: string;
  mode: GameMode;
  playerCount: number;
  filled: number;
}

export type LobbyClientMsg =
  | { type: 'register'; row: LobbyRow }
  | { type: 'unregister'; code: string }
  | { type: 'list' };

export type LobbyServerMsg = { type: 'rooms'; rooms: LobbyRow[] };
```

- [ ] **Step 2: Verify it typechecks and builds**

Run: `npm run build`
Expected: PASS (no type errors).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/online/protocol.ts
git commit -m "feat: add online wire-protocol types"
```

---

## Task 2: Server-authoritative action reducer

**Files:**
- Create: `src/online/actionReducer.ts`
- Test: `src/online/actionReducer.test.ts`

**Interfaces:**
- Consumes: `ActionRequest`, `ActionEvent` from `./protocol` (Task 1); engine functions/types from `../engine`.
- Produces: `type ApplyResult` and `applyAction(state: GameState, actorId: PlayerId, req: ActionRequest): ApplyResult`. Plan 2's room server consumes `applyAction`.

- [ ] **Step 1: Write the failing tests**

Create `src/online/actionReducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../engine';
import type { GameState, PlayerId, Position } from '../engine';
import { applyAction } from './actionReducer';

function withPlayerAt(state: GameState, id: PlayerId, pos: Position): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], position: pos } } };
}
function withEnergy(state: GameState, id: PlayerId, energy: number): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], energy } } };
}
function withEmptyTile(state: GameState, pos: Position): GameState {
  const board = state.board.map((r) => r.slice());
  board[pos.y][pos.x] = { type: 'empty' };
  return { ...state, board };
}

describe('applyAction', () => {
  it('rejects an action from a player whose turn it is not', () => {
    const state = createInitialGameState('deathmatch', 2); // currentTurn = p1
    const res = applyAction(state, 'p2', { kind: 'rest' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/turn/i);
  });

  it('rejects any action once the game is over', () => {
    const state = { ...createInitialGameState('deathmatch', 2), winner: 'p1' as PlayerId };
    const res = applyAction(state, 'p1', { kind: 'rest' });
    expect(res.ok).toBe(false);
  });

  it('applies rest and passes the turn to the next player', () => {
    const state = withEnergy(createInitialGameState('deathmatch', 2), 'p1', 1);
    const res = applyAction(state, 'p1', { kind: 'rest' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.players.p1.energy).toBe(4); // 1 + REST_ENERGY_GAIN(3)
      expect(res.state.currentTurn).toBe('p2');
      expect(res.event.killedPlayerIds).toEqual([]);
    }
  });

  it('applies a one-tile move onto a known-empty tile and passes the turn', () => {
    let state = createInitialGameState('deathmatch', 2);
    state = withPlayerAt(state, 'p1', { x: 5, y: 5 });
    state = withEmptyTile(state, { x: 6, y: 5 });
    const res = applyAction(state, 'p1', { kind: 'move', path: [{ x: 6, y: 5 }] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.players.p1.position).toEqual({ x: 6, y: 5 });
      expect(res.state.currentTurn).toBe('p2');
    }
  });

  it('applies a fake move, marking the actor a phantom, and passes the turn', () => {
    const state = createInitialGameState('deathmatch', 2); // p1 at (0,0), energy 5
    const res = applyAction(state, 'p1', { kind: 'fakeMove', dir: { x: 1, y: 0 } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.players.p1.isPhantom).toBe(true);
      expect(res.state.players.p1.phantomDisplayPosition).toEqual({ x: 1, y: 0 });
      expect(res.state.currentTurn).toBe('p2');
    }
  });

  it('a punch that kills grants an extra turn (currentTurn stays the actor) and reports the victim', () => {
    let state = createInitialGameState('deathmatch', 2);
    state = withPlayerAt(state, 'p1', { x: 5, y: 5 });
    state = withPlayerAt(state, 'p2', { x: 5, y: 4 }); // directly north, adjacent
    const res = applyAction(state, 'p1', { kind: 'attack', type: 'punch', path: [], target: { x: 5, y: 4 } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.event.killedPlayerIds).toContain('p2');
      expect(res.state.currentTurn).toBe('p1'); // extra turn on kill
    }
  });

  it('rejects an illegal attack (non-adjacent punch target) with an error, leaving no state', () => {
    let state = createInitialGameState('deathmatch', 2);
    state = withPlayerAt(state, 'p1', { x: 5, y: 5 });
    const res = applyAction(state, 'p1', { kind: 'attack', type: 'punch', path: [], target: { x: 9, y: 9 } });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/online/actionReducer.test.ts`
Expected: FAIL — `applyAction` is not defined / module not found.

- [ ] **Step 3: Implement the reducer**

Create `src/online/actionReducer.ts`:

```ts
import {
  movePlayer,
  restPlayer,
  fakeMove,
  punch,
  shoot,
  bomb,
  resolveAttack,
  endTurn,
} from '../engine';
import type { GameState, PlayerId } from '../engine';
import type { ActionRequest, ActionEvent } from './protocol';

export type ApplyResult =
  | { ok: true; state: GameState; event: ActionEvent }
  | { ok: false; error: string };

// Validate + apply one player's action against the authoritative state, returning
// the new state plus an ActionEvent (what happened). Mirrors App.tsx handleConfirm.
export function applyAction(state: GameState, actorId: PlayerId, req: ActionRequest): ApplyResult {
  if (state.winner !== null) return { ok: false, error: 'The game is over.' };
  if (state.currentTurn !== actorId) return { ok: false, error: 'Not your turn.' };
  const actor = state.players[actorId];
  if (!actor || actor.eliminated) return { ok: false, error: 'You are not in play.' };

  try {
    if (req.kind === 'move') {
      const pathKeys = new Set(req.path.map((p) => `${p.x},${p.y}`));
      const squashedIds = state.turnOrder.filter((id) => {
        if (id === actorId) return false;
        const o = state.players[id];
        return o.alive && !o.eliminated && o.isPhantom && pathKeys.has(`${o.position.x},${o.position.y}`);
      });
      const moved = movePlayer(state, actorId, req.path);
      if (squashedIds.length) {
        let killedState = moved;
        for (const id of squashedIds) {
          killedState = {
            ...killedState,
            players: { ...killedState.players, [id]: { ...killedState.players[id], alive: false } },
          };
        }
        const acted = resolveAttack({ state: killedState, killedPlayerIds: squashedIds }, actorId);
        const next = endTurn(acted, actorId, false); // a crush is incidental: no extra turn
        return { ok: true, state: next, event: { actorId, request: req, killedPlayerIds: squashedIds } };
      }
      const next = endTurn(moved, actorId, false);
      return { ok: true, state: next, event: { actorId, request: req, killedPlayerIds: [] } };
    }

    if (req.kind === 'rest') {
      const acted = restPlayer(state, actorId);
      const next = endTurn(acted, actorId, false);
      return { ok: true, state: next, event: { actorId, request: req, killedPlayerIds: [] } };
    }

    if (req.kind === 'fakeMove') {
      const acted = fakeMove(state, actorId, req.dir);
      const next = endTurn(acted, actorId, false);
      return { ok: true, state: next, event: { actorId, request: req, killedPlayerIds: [] } };
    }

    // attack (with optional reposition path)
    const base = req.path.length ? movePlayer(state, actorId, req.path) : state;
    const from = req.path.length ? req.path[req.path.length - 1] : actor.position;
    const result =
      req.type === 'punch'
        ? punch(base, actorId, req.target)
        : req.type === 'shoot'
          ? shoot(base, actorId, { x: req.target.x - from.x, y: req.target.y - from.y })
          : bomb(base, actorId, req.target);
    const acted = resolveAttack(result, actorId);
    const gotKill = result.killedPlayerIds.length > 0;
    const next = endTurn(acted, actorId, gotKill);
    return { ok: true, state: next, event: { actorId, request: req, killedPlayerIds: result.killedPlayerIds } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Illegal action.' };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/online/actionReducer.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Run the full suite and build**

Run: `npm run test && npm run build`
Expected: PASS (existing engine/UI tests plus the 7 new reducer tests; typecheck clean).

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/online/actionReducer.ts src/online/actionReducer.test.ts
git commit -m "feat: add server-authoritative action reducer with tests"
```

---

## Self-Review Notes

- **Spec coverage (this plan = spec step 1 + the reducer of step 3):** `protocol.ts` covers all `ClientMsg`/`ServerMsg`/`ActionRequest`/`ActionEvent`/lobby types from the spec's "Server → protocol.ts" section; `actionReducer.ts` covers the spec's `applyAction` contract (out-of-turn rejection, each action kind, phantom-crush, kill→extra-turn, illegal→error). Networking, `animation.ts`, `roomServer`, `lobbyServer`, client hooks, `OnlineGame`, and menu wiring are intentionally deferred to Plan 2.
- **Type consistency:** `applyAction` returns `ApplyResult`; `ActionEvent.killedPlayerIds` and `ActionRequest` shapes match `protocol.ts` exactly. The reducer's attack `from`/`dir` math matches `App.tsx` (`shoot` uses `target - from`).
- **Placeholder scan:** none — all steps contain full code and exact commands.
- **Location deviation from spec** (pure logic under `src/online/` not `server/src/`) is called out in Global Constraints; Plan 2's server imports these modules via `../../src/online/...`.
