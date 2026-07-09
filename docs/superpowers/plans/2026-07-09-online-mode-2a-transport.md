# Online Mode — Plan 2A: Transport (server + client sockets)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real-time transport for online mode — pure, unit-tested room and lobby state machines, the `partyserver` Durable Object adapters that wrap them, wrangler bindings, and the client socket hooks — so two clients can connect, fill a room, start a game, exchange authoritative state, and pause/resume on disconnect. No game UI yet (that is Plan 2B).

**Architecture:** All correctness-critical logic lives in pure reducers under `src/online/` (`roomReducer`, `lobbyReducer`), unit-tested by Vitest exactly like the existing `actionReducer`. The `partyserver` `Server` subclasses in `server/src/` are thin adapters: parse a message, feed it to the reducer, and fan the reducer's output messages out over WebSockets. The client hooks (`src/online/`) wrap `partysocket` and expose typed React state; they contain no game logic.

**Tech Stack:** `partyserver@0.0.68` (Cloudflare Workers + Durable Objects via `wrangler dev`), `partysocket` (client, to be installed in the root package), the existing pure engine + `applyAction`, Vitest, React 19, strict TypeScript.

## Global Constraints

- Strict TypeScript: type-only imports MUST use `import type`; unused locals fail the build. `npm run build` is the real gate for client code.
- Pure online logic lives under `src/online/` and stays free of DOM/React/network imports so the server can import it via `../../src/online/...`. Its tests are `src/online/*.test.ts` (Vitest scans `src/**/*.test.ts`).
- No engine changes. `applyAction` (from Plan 1, `src/online/actionReducer.ts`) is the ONLY place game actions are validated/applied — reducers call it, never re-implement it.
- Server framework is `partyserver` (NOT hosted PartyKit). Server API: subclass `Server<Env>`; lifecycle `onStart()`, `onConnect(conn, ctx)`, `onMessage(conn, message)`, `onClose(conn, code, reason, wasClean)`; `this.broadcast(msg, without?)`, `this.getConnection(id)`, `conn.send(...)`, `conn.id`. Config in `server/wrangler.jsonc` as Durable Object bindings + migrations.
- Routing rule (verified in `partyserver`): `routePartykitRequest` maps each DO binding to a party namespace = the binding name kebab-cased. Binding `ScavengersServer` → party `scavengers-server`; binding `LobbyServer` → party `lobby-server`. Clients MUST set `party` explicitly (the default `"main"` matches nothing).
- Start rule: host-only, only when every slot is filled. Disconnect: pause + allow reconnect. These live in `roomReducer`.
- Wire format = the Plan 1 `src/online/protocol.ts` types (`ClientMsg`, `ServerMsg`, `LobbyClientMsg`, `LobbyServerMsg`, `RosterEntry`, `ActionRequest`, `ActionEvent`, `LobbyRow`). Do not change them.

## Reference (already implemented, Plan 1)

`src/online/protocol.ts` exports: `RoomPhase = 'lobby'|'playing'|'paused'|'over'`; `RosterEntry = { playerId; color; connected; isHost }`; `ActionRequest`; `ActionEvent = { actorId; request; killedPlayerIds }`; `ClientMsg = {type:'join'} | {type:'startGame'} | {type:'action'; request} | {type:'endMatch'}`; `ServerMsg = {type:'assigned'; playerId} | {type:'roster'; entries; phase; mode; playerCount} | {type:'gameStart'; state} | {type:'state'; state; event} | {type:'paused'; disconnected} | {type:'resumed'; state} | {type:'over'; state} | {type:'error'; message}`; `LobbyRow = { code; mode; playerCount; filled }`; `LobbyClientMsg = {type:'register'; row} | {type:'unregister'; code} | {type:'list'}`; `LobbyServerMsg = {type:'rooms'; rooms}`.

`src/online/actionReducer.ts` exports `applyAction(state: GameState, actorId: PlayerId, req: ActionRequest): { ok: true; state: GameState; event: ActionEvent } | { ok: false; error: string }`.

`src/engine` exports `createInitialGameState(mode: GameMode, playerCount?: number): GameState` and types `GameState`, `GameMode`, `PlayerId`, `PlayerColor`.

Existing `server/src/server.ts` is an echo stub exporting `class ScavengersServer extends Server` plus a default `fetch` handler calling `routePartykitRequest`. Existing `server/wrangler.jsonc` binds only `ScavengersServer`.

---

## Task 1: Pure room state machine (`roomReducer`)

**Files:**
- Create: `src/online/roomReducer.ts`
- Test: `src/online/roomReducer.test.ts`

**Interfaces:**
- Consumes: `applyAction` from `./actionReducer`; `createInitialGameState`, types from `../engine`; `RoomPhase`, `RosterEntry`, `ServerMsg`, `ActionRequest` from `./protocol`.
- Produces: `RoomModel`, `RoomInput`, `Outbound`, `RoomStep`, `roomInit(mode, playerCount): RoomModel`, `roomReduce(model, input): RoomStep`. Task 3's adapter consumes `roomInit`/`roomReduce`.

- [ ] **Step 1: Write the failing tests**

Create `src/online/roomReducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { roomInit, roomReduce, type RoomModel } from './roomReducer';

// Seat two connections into a fresh 2-player room, returning the model after both joins.
function seatedTwo(): RoomModel {
  let m = roomInit('deathmatch', 2);
  m = roomReduce(m, { t: 'connect', connId: 'A' }).model;
  m = roomReduce(m, { t: 'join', connId: 'A' }).model; // host -> p1
  m = roomReduce(m, { t: 'connect', connId: 'B' }).model;
  m = roomReduce(m, { t: 'join', connId: 'B' }).model; // -> p2
  return m;
}

describe('roomReduce', () => {
  it('assigns the first joiner as host p1 and replies with an assigned message + roster', () => {
    let m = roomInit('deathmatch', 2);
    const step = roomReduce(m, { t: 'join', connId: 'A' });
    m = step.model;
    expect(m.slots[0].connId).toBe('A');
    expect(m.hostConnId).toBe('A');
    expect(step.out).toContainEqual({ to: { connId: 'A' }, msg: { type: 'assigned', playerId: 'p1' } });
    expect(step.out.some((o) => o.to === 'all' && o.msg.type === 'roster')).toBe(true);
  });

  it('rejects startGame until every slot is filled, then broadcasts gameStart', () => {
    let m = roomInit('deathmatch', 2);
    m = roomReduce(m, { t: 'join', connId: 'A' }).model;
    const early = roomReduce(m, { t: 'startGame', connId: 'A' });
    expect(early.out).toContainEqual({ to: { connId: 'A' }, msg: { type: 'error', message: expect.stringMatching(/full/i) } });
    expect(early.model.phase).toBe('lobby');

    m = seatedTwo();
    const started = roomReduce(m, { t: 'startGame', connId: 'A' });
    expect(started.model.phase).toBe('playing');
    expect(started.model.state).not.toBeNull();
    expect(started.out.some((o) => o.to === 'all' && o.msg.type === 'gameStart')).toBe(true);
  });

  it('rejects startGame from a non-host', () => {
    const m = seatedTwo();
    const step = roomReduce(m, { t: 'startGame', connId: 'B' });
    expect(step.model.phase).toBe('lobby');
    expect(step.out).toContainEqual({ to: { connId: 'B' }, msg: { type: 'error', message: expect.stringMatching(/host/i) } });
  });

  it('broadcasts new state on a legal action and returns an error to the sender on an out-of-turn action', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model; // currentTurn p1 (A)
    const bad = roomReduce(m, { t: 'action', connId: 'B', request: { kind: 'rest' } }); // B is p2, not their turn
    expect(bad.out).toContainEqual({ to: { connId: 'B' }, msg: { type: 'error', message: expect.stringMatching(/turn/i) } });

    const good = roomReduce(m, { t: 'action', connId: 'A', request: { kind: 'rest' } });
    const stateMsg = good.out.find((o) => o.to === 'all' && o.msg.type === 'state');
    expect(stateMsg).toBeDefined();
    expect(good.model.state!.currentTurn).toBe('p2');
  });

  it('pauses the game when a player disconnects mid-match and resumes when they rejoin', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model;
    const dropped = roomReduce(m, { t: 'disconnect', connId: 'B' });
    m = dropped.model;
    expect(m.phase).toBe('paused');
    expect(dropped.out.some((o) => o.to === 'all' && o.msg.type === 'paused')).toBe(true);

    const rejoin = roomReduce(m, { t: 'join', connId: 'B2' });
    m = rejoin.model;
    expect(m.phase).toBe('playing');
    expect(rejoin.out.some((o) => o.to === 'all' && o.msg.type === 'resumed')).toBe(true);
    expect(m.slots.find((s) => s.playerId === 'p2')!.connId).toBe('B2');
  });

  it('frees a lobby slot on disconnect so a new connection can take it', () => {
    let m = roomInit('deathmatch', 2);
    m = roomReduce(m, { t: 'join', connId: 'A' }).model; // p1 host
    m = roomReduce(m, { t: 'join', connId: 'B' }).model; // p2
    m = roomReduce(m, { t: 'disconnect', connId: 'B' }).model; // still lobby -> slot freed
    expect(m.slots.find((s) => s.playerId === 'p2')!.connId).toBeNull();
    const rejoin = roomReduce(m, { t: 'join', connId: 'C' });
    expect(rejoin.model.slots.find((s) => s.playerId === 'p2')!.connId).toBe('C');
  });

  it('lets the host end the match', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model;
    const step = roomReduce(m, { t: 'endMatch', connId: 'A' });
    expect(step.model.phase).toBe('over');
    expect(step.out.some((o) => o.to === 'all' && o.msg.type === 'over')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/online/roomReducer.test.ts`
Expected: FAIL — module `./roomReducer` not found.

- [ ] **Step 3: Implement the reducer**

Create `src/online/roomReducer.ts`:

```ts
import { createInitialGameState } from '../engine';
import type { GameState, GameMode, PlayerId, PlayerColor } from '../engine';
import { applyAction } from './actionReducer';
import type { RoomPhase, RosterEntry, ServerMsg, ActionRequest } from './protocol';

const SEAT_ORDER: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
const COLORS: Record<PlayerId, PlayerColor> = { p1: 'green', p2: 'red', p3: 'blue', p4: 'yellow' };

interface Slot {
  playerId: PlayerId;
  connId: string | null;   // the socket currently seated here (retained while disconnected mid-game for reconnect)
  connected: boolean;
}

export interface RoomModel {
  phase: RoomPhase;
  mode: GameMode;
  playerCount: number;
  slots: Slot[];           // length === playerCount, seat/turn order p1..pN
  hostConnId: string | null;
  state: GameState | null;
}

export type RoomInput =
  | { t: 'connect'; connId: string }
  | { t: 'join'; connId: string }
  | { t: 'startGame'; connId: string }
  | { t: 'action'; connId: string; request: ActionRequest }
  | { t: 'endMatch'; connId: string }
  | { t: 'disconnect'; connId: string };

export interface Outbound {
  to: 'all' | { connId: string };
  msg: ServerMsg;
}
export interface RoomStep {
  model: RoomModel;
  out: Outbound[];
}

export function roomInit(mode: GameMode, playerCount: number): RoomModel {
  const slots: Slot[] = SEAT_ORDER.slice(0, playerCount).map((playerId) => ({ playerId, connId: null, connected: false }));
  return { phase: 'lobby', mode, playerCount, slots, hostConnId: null, state: null };
}

function rosterEntries(model: RoomModel): RosterEntry[] {
  return model.slots.map((s) => ({
    playerId: s.playerId,
    color: COLORS[s.playerId],
    connected: s.connected,
    isHost: s.connId !== null && s.connId === model.hostConnId,
  }));
}
function rosterMsg(model: RoomModel): ServerMsg {
  return { type: 'roster', entries: rosterEntries(model), phase: model.phase, mode: model.mode, playerCount: model.playerCount };
}
function slotOf(model: RoomModel, connId: string): Slot | undefined {
  return model.slots.find((s) => s.connId === connId);
}
function err(connId: string, message: string): Outbound {
  return { to: { connId }, msg: { type: 'error', message } };
}

export function roomReduce(model: RoomModel, input: RoomInput): RoomStep {
  switch (input.t) {
    case 'connect':
      // Newcomer sees the current roster; actual seating waits for an explicit join.
      return { model, out: [{ to: { connId: input.connId }, msg: rosterMsg(model) }] };

    case 'join': {
      if (slotOf(model, input.connId)) {
        return { model, out: [{ to: 'all', msg: rosterMsg(model) }] };
      }
      // Paused game: reclaim the first disconnected (reserved) slot. Otherwise take the first empty slot.
      const target =
        model.phase === 'paused'
          ? model.slots.find((s) => !s.connected)
          : model.slots.find((s) => s.connId === null);
      if (!target) {
        return { model, out: [err(input.connId, 'Room is full.')] };
      }
      const isFirstSeat = model.slots.every((s) => s.connId === null);
      const slots = model.slots.map((s) => (s === target ? { ...s, connId: input.connId, connected: true } : s));
      let next: RoomModel = { ...model, slots, hostConnId: isFirstSeat ? input.connId : model.hostConnId };
      const out: Outbound[] = [{ to: { connId: input.connId }, msg: { type: 'assigned', playerId: target.playerId } }];
      if (next.phase === 'paused' && next.slots.every((s) => s.connected) && next.state) {
        next = { ...next, phase: 'playing' };
        out.push({ to: 'all', msg: { type: 'resumed', state: next.state } });
      }
      out.push({ to: 'all', msg: rosterMsg(next) });
      return { model: next, out };
    }

    case 'startGame': {
      if (input.connId !== model.hostConnId) return { model, out: [err(input.connId, 'Only the host can start.')] };
      if (model.phase !== 'lobby') return { model, out: [err(input.connId, 'The game has already started.')] };
      if (!model.slots.every((s) => s.connId !== null && s.connected)) return { model, out: [err(input.connId, 'The room is not full yet.')] };
      const state = createInitialGameState(model.mode, model.playerCount);
      const next: RoomModel = { ...model, phase: 'playing', state };
      return { model: next, out: [{ to: 'all', msg: { type: 'gameStart', state } }, { to: 'all', msg: rosterMsg(next) }] };
    }

    case 'action': {
      if (model.phase !== 'playing' || !model.state) return { model, out: [err(input.connId, 'The game is not active.')] };
      const slot = slotOf(model, input.connId);
      if (!slot) return { model, out: [err(input.connId, 'You are not seated in this room.')] };
      const res = applyAction(model.state, slot.playerId, input.request);
      if (!res.ok) return { model, out: [err(input.connId, res.error)] };
      const over = res.state.winner !== null;
      const next: RoomModel = { ...model, state: res.state, phase: over ? 'over' : 'playing' };
      const out: Outbound[] = [{ to: 'all', msg: { type: 'state', state: res.state, event: res.event } }];
      if (over) out.push({ to: 'all', msg: { type: 'over', state: res.state } });
      return { model: next, out };
    }

    case 'endMatch': {
      if (input.connId !== model.hostConnId) return { model, out: [err(input.connId, 'Only the host can end the match.')] };
      if (!model.state) return { model, out: [] };
      return { model: { ...model, phase: 'over' }, out: [{ to: 'all', msg: { type: 'over', state: model.state } }] };
    }

    case 'disconnect': {
      const slot = slotOf(model, input.connId);
      if (!slot) return { model, out: [] };
      // In the lobby a slot is freed for reuse; mid-game it stays reserved (connId kept) for reconnect.
      const freeSlot = model.phase === 'lobby';
      const slots = model.slots.map((s) =>
        s === slot ? { ...s, connId: freeSlot ? null : s.connId, connected: false } : s
      );
      let next: RoomModel = { ...model, slots };
      if (model.hostConnId === input.connId) {
        next = { ...next, hostConnId: slots.find((s) => s.connected)?.connId ?? null };
      }
      const out: Outbound[] = [];
      if (next.phase === 'playing') {
        next = { ...next, phase: 'paused' };
        out.push({ to: 'all', msg: { type: 'paused', disconnected: slot.playerId } });
      }
      out.push({ to: 'all', msg: rosterMsg(next) });
      return { model: next, out };
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/online/roomReducer.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Full suite + build + lint**

Run: `npm run test && npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/online/roomReducer.ts src/online/roomReducer.test.ts
git commit -m "feat: add pure room state machine (roomReducer) with tests"
```

---

## Task 2: Pure lobby registry (`lobbyReducer`)

**Files:**
- Create: `src/online/lobbyReducer.ts`
- Test: `src/online/lobbyReducer.test.ts`

**Interfaces:**
- Consumes: `LobbyRow`, `LobbyServerMsg` from `./protocol`.
- Produces: `LobbyModel`, `LobbyInput`, `LobbyOutbound`, `LobbyStep`, `lobbyInit(): LobbyModel`, `lobbyReduce(model, input): LobbyStep`. Task 3's adapter consumes these.

- [ ] **Step 1: Write the failing tests**

Create `src/online/lobbyReducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lobbyInit, lobbyReduce } from './lobbyReducer';
import type { LobbyRow } from './protocol';

const row = (code: string, filled = 1): LobbyRow => ({ code, mode: 'deathmatch', playerCount: 2, filled });

describe('lobbyReduce', () => {
  it('registers a room and lists it, replying only to the requesting connection', () => {
    let m = lobbyInit();
    m = lobbyReduce(m, { t: 'register', row: row('ABC123') }).model;
    const step = lobbyReduce(m, { t: 'list', connId: 'X' });
    expect(step.out).toEqual([{ to: { connId: 'X' }, msg: { type: 'rooms', rooms: [row('ABC123')] } }]);
  });

  it('re-registering the same code updates the row (e.g. filled count)', () => {
    let m = lobbyInit();
    m = lobbyReduce(m, { t: 'register', row: row('ABC123', 1) }).model;
    m = lobbyReduce(m, { t: 'register', row: row('ABC123', 2) }).model;
    const step = lobbyReduce(m, { t: 'list', connId: 'X' });
    expect((step.out[0].msg as { rooms: LobbyRow[] }).rooms).toEqual([row('ABC123', 2)]);
  });

  it('unregisters a room so it no longer lists', () => {
    let m = lobbyInit();
    m = lobbyReduce(m, { t: 'register', row: row('ABC123') }).model;
    m = lobbyReduce(m, { t: 'unregister', code: 'ABC123' }).model;
    const step = lobbyReduce(m, { t: 'list', connId: 'X' });
    expect((step.out[0].msg as { rooms: LobbyRow[] }).rooms).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/online/lobbyReducer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the reducer**

Create `src/online/lobbyReducer.ts`:

```ts
import type { LobbyRow, LobbyServerMsg } from './protocol';

export interface LobbyModel {
  rooms: Record<string, LobbyRow>; // keyed by room code
}

export type LobbyInput =
  | { t: 'register'; row: LobbyRow }
  | { t: 'unregister'; code: string }
  | { t: 'list'; connId: string };

export interface LobbyOutbound {
  to: 'all' | { connId: string };
  msg: LobbyServerMsg;
}
export interface LobbyStep {
  model: LobbyModel;
  out: LobbyOutbound[];
}

export function lobbyInit(): LobbyModel {
  return { rooms: {} };
}

export function lobbyReduce(model: LobbyModel, input: LobbyInput): LobbyStep {
  switch (input.t) {
    case 'register':
      return { model: { rooms: { ...model.rooms, [input.row.code]: input.row } }, out: [] };
    case 'unregister': {
      const rooms = { ...model.rooms };
      delete rooms[input.code];
      return { model: { rooms }, out: [] };
    }
    case 'list':
      return { model, out: [{ to: { connId: input.connId }, msg: { type: 'rooms', rooms: Object.values(model.rooms) } }] };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/online/lobbyReducer.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Full suite + build + lint**

Run: `npm run test && npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/online/lobbyReducer.ts src/online/lobbyReducer.test.ts
git commit -m "feat: add pure lobby registry reducer with tests"
```

---

## Task 3: `partyserver` adapters + wrangler bindings

**Files:**
- Modify (rewrite): `server/src/server.ts`
- Modify: `server/wrangler.jsonc`

**Interfaces:**
- Consumes: `roomInit`/`roomReduce`/`RoomModel` (Task 1), `lobbyInit`/`lobbyReduce`/`LobbyModel` (Task 2), `ClientMsg`/`LobbyClientMsg` from `src/online/protocol`, `GameMode` from `src/engine` — all via relative path `../../src/...`.
- Produces: exported DO classes `ScavengersServer` (party `scavengers-server`) and `LobbyServer` (party `lobby-server`), plus the default `fetch` handler. Task 4's client connects to these party namespaces.

The adapters hold the reducer model in memory (hibernation disabled) and translate socket lifecycle ↔ reducer inputs/outputs. All rules live in the reducers; these classes must contain no game logic.

- [ ] **Step 1: Rewrite the server**

Replace the entire contents of `server/src/server.ts` with:

```ts
import { Server, routePartykitRequest, type Connection, type ConnectionContext } from 'partyserver';
import type { GameMode } from '../../src/engine';
import type { ClientMsg, LobbyClientMsg } from '../../src/online/protocol';
import { roomInit, roomReduce, type RoomInput, type RoomModel } from '../../src/online/roomReducer';
import { lobbyInit, lobbyReduce, type LobbyModel } from '../../src/online/lobbyReducer';

function parse<T>(raw: string | ArrayBuffer | ArrayBufferView): T | null {
  try {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// The room party: one Durable Object per room id. Holds the authoritative RoomModel.
export class ScavengersServer extends Server<Record<string, unknown>> {
  static options = { hibernate: false };
  model: RoomModel | null = null;

  onConnect(conn: Connection, ctx: ConnectionContext) {
    if (!this.model) {
      // The creating client passes the room settings as query params on first connect.
      const url = new URL(ctx.request.url);
      const mode = (url.searchParams.get('mode') as GameMode) || 'lastStanding';
      const count = Number(url.searchParams.get('count')) || 2;
      this.model = roomInit(mode, count);
    }
    this.dispatch({ t: 'connect', connId: conn.id });
  }

  onMessage(conn: Connection, raw: string | ArrayBuffer | ArrayBufferView) {
    const msg = parse<ClientMsg>(raw);
    if (!msg) return;
    if (msg.type === 'join') this.dispatch({ t: 'join', connId: conn.id });
    else if (msg.type === 'startGame') this.dispatch({ t: 'startGame', connId: conn.id });
    else if (msg.type === 'action') this.dispatch({ t: 'action', connId: conn.id, request: msg.request });
    else if (msg.type === 'endMatch') this.dispatch({ t: 'endMatch', connId: conn.id });
  }

  onClose(conn: Connection) {
    this.dispatch({ t: 'disconnect', connId: conn.id });
  }

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
}

// The lobby party: a single Durable Object (room id "lobby") holding the public-room registry.
export class LobbyServer extends Server<Record<string, unknown>> {
  static options = { hibernate: false };
  model: LobbyModel = lobbyInit();

  onMessage(conn: Connection, raw: string | ArrayBuffer | ArrayBufferView) {
    const msg = parse<LobbyClientMsg>(raw);
    if (!msg) return;
    const input =
      msg.type === 'register'
        ? ({ t: 'register', row: msg.row } as const)
        : msg.type === 'unregister'
          ? ({ t: 'unregister', code: msg.code } as const)
          : ({ t: 'list', connId: conn.id } as const);
    const step = lobbyReduce(this.model, input);
    this.model = step.model;
    for (const o of step.out) {
      const payload = JSON.stringify(o.msg);
      if (o.to === 'all') this.broadcast(payload);
      else this.getConnection(o.to.connId)?.send(payload);
    }
  }
}

export default {
  async fetch(request: Request, env: Record<string, unknown>) {
    return (await routePartykitRequest(request, env)) || new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Record<string, unknown>>;
```

- [ ] **Step 2: Add the LobbyServer Durable Object binding + migration**

Edit `server/wrangler.jsonc` so `durable_objects.bindings` contains BOTH classes and a `v2` migration adds `LobbyServer`:

```jsonc
{
  "name": "scavengers-server",
  "main": "src/server.ts",
  "compatibility_date": "2026-07-09",
  "durable_objects": {
    "bindings": [
      { "name": "ScavengersServer", "class_name": "ScavengersServer" },
      { "name": "LobbyServer", "class_name": "LobbyServer" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["ScavengersServer"] },
    { "tag": "v2", "new_sqlite_classes": ["LobbyServer"] }
  ]
}
```

- [ ] **Step 3: Verify the worker boots and routes**

Run (from the `server/` directory): `npx wrangler dev --port 8787` in the background, then check it started without errors and responds. In a second shell:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/parties/scavengers-server/testroom
```

Expected: the process logs "Ready on http://127.0.0.1:8787" (or similar) with no build/type errors, and the curl prints `426` (Upgrade Required — the route matched a party and demanded a WebSocket upgrade). A `404` means routing/bindings are wrong. Stop the dev server afterward.

- [ ] **Step 4: Verify the client build is unaffected**

Run (from the repo root): `npm run build`
Expected: PASS (the server rewrite must not break the client typecheck; the server files are outside the client tsconfig but the shared `src/online/*` they import must still compile).

- [ ] **Step 5: Commit**

```bash
git add server/src/server.ts server/wrangler.jsonc
git commit -m "feat: partyserver room + lobby adapters over pure reducers"
```

---

## Task 4: Client socket hooks

**Files:**
- Create: `src/online/config.ts`
- Create: `src/online/useOnlineRoom.ts`
- Create: `src/online/useLobby.ts`
- Modify: `package.json` (add `partysocket` dependency)

**Interfaces:**
- Consumes: `partysocket/react`; `ClientMsg`, `ServerMsg`, `RoomPhase`, `RosterEntry`, `ActionEvent`, `LobbyRow`, `LobbyClientMsg`, `LobbyServerMsg` from `./protocol`; `GameState`, `GameMode`, `PlayerId` from `../engine`.
- Produces: `PARTY_HOST` (config); `useOnlineRoom(roomId, create?): OnlineRoom`; `useLobby(): { rooms: LobbyRow[]; refresh: () => void }` and `useLobbyRegistration(row, active): void`. Plan 2B's `OnlineGame`/`MenuFlow` consume these.

- [ ] **Step 1: Install partysocket in the root (client) package**

Run (from the repo root):

```bash
npm install partysocket
```

Expected: `partysocket` added to `dependencies` in the root `package.json`; `package-lock.json` updated.

- [ ] **Step 2: Add the host config**

Create `src/online/config.ts`:

```ts
// The origin (host:port, no protocol) of the partyserver worker. Defaults to the
// local `wrangler dev` address; override in production via VITE_PARTY_HOST.
export const PARTY_HOST: string =
  (import.meta.env.VITE_PARTY_HOST as string | undefined) ?? '127.0.0.1:8787';

export const ROOM_PARTY = 'scavengers-server';
export const LOBBY_PARTY = 'lobby-server';
export const LOBBY_ROOM = 'lobby';
```

- [ ] **Step 3: Implement the room hook**

Create `src/online/useOnlineRoom.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import usePartySocket from 'partysocket/react';
import type { GameState, GameMode, PlayerId } from '../engine';
import type { ClientMsg, ServerMsg, RoomPhase, RosterEntry, ActionEvent } from './protocol';
import { PARTY_HOST, ROOM_PARTY } from './config';

export interface OnlineRoom {
  connected: boolean;
  phase: RoomPhase;
  roster: RosterEntry[];
  mode: GameMode;
  playerCount: number;
  myPlayerId: PlayerId | null;
  state: GameState | null;
  lastEvent: ActionEvent | null;
  error: string | null;
  send: (msg: ClientMsg) => void;
}

// Connect to a room party. Pass `create` (mode + count) when creating a room so the
// server can initialise it; joiners omit it and inherit the room's settings.
export function useOnlineRoom(roomId: string, create?: { mode: GameMode; count: number }): OnlineRoom {
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<RoomPhase>('lobby');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [mode, setMode] = useState<GameMode>(create?.mode ?? 'lastStanding');
  const [playerCount, setPlayerCount] = useState<number>(create?.count ?? 2);
  const [myPlayerId, setMyPlayerId] = useState<PlayerId | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [lastEvent, setLastEvent] = useState<ActionEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socket = usePartySocket({
    host: PARTY_HOST,
    party: ROOM_PARTY,
    room: roomId,
    query: create ? { mode: create.mode, count: String(create.count) } : {},
    onOpen() {
      setConnected(true);
      socketRef.current?.send(JSON.stringify({ type: 'join' } satisfies ClientMsg));
    },
    onClose() {
      setConnected(false);
    },
    onMessage(evt: MessageEvent) {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(evt.data as string) as ServerMsg;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'assigned':
          setMyPlayerId(msg.playerId);
          break;
        case 'roster':
          setRoster(msg.entries);
          setPhase(msg.phase);
          setMode(msg.mode);
          setPlayerCount(msg.playerCount);
          break;
        case 'gameStart':
          setState(msg.state);
          setPhase('playing');
          setLastEvent(null);
          break;
        case 'state':
          setState(msg.state);
          setLastEvent(msg.event);
          setPhase(msg.state.winner !== null ? 'over' : 'playing');
          break;
        case 'paused':
          setPhase('paused');
          break;
        case 'resumed':
          setState(msg.state);
          setPhase('playing');
          break;
        case 'over':
          setState(msg.state);
          setPhase('over');
          break;
        case 'error':
          setError(msg.message);
          break;
      }
    },
  });

  const socketRef = useRef(socket);
  socketRef.current = socket;

  const send = useCallback((msg: ClientMsg) => {
    socketRef.current?.send(JSON.stringify(msg));
  }, []);

  return { connected, phase, roster, mode, playerCount, myPlayerId, state, lastEvent, error, send };
}
```

- [ ] **Step 4: Implement the lobby hooks**

Create `src/online/useLobby.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import usePartySocket from 'partysocket/react';
import type { LobbyRow, LobbyClientMsg, LobbyServerMsg } from './protocol';
import { PARTY_HOST, LOBBY_PARTY, LOBBY_ROOM } from './config';

// Subscribe to the public-room list. Sends `list` on open and whenever `refresh` is called.
export function useLobby(): { rooms: LobbyRow[]; refresh: () => void } {
  const [rooms, setRooms] = useState<LobbyRow[]>([]);
  const socket = usePartySocket({
    host: PARTY_HOST,
    party: LOBBY_PARTY,
    room: LOBBY_ROOM,
    onOpen() {
      socketRef.current?.send(JSON.stringify({ type: 'list' } satisfies LobbyClientMsg));
    },
    onMessage(evt: MessageEvent) {
      let msg: LobbyServerMsg;
      try {
        msg = JSON.parse(evt.data as string) as LobbyServerMsg;
      } catch {
        return;
      }
      if (msg.type === 'rooms') setRooms(msg.rooms);
    },
  });
  const socketRef = useRef(socket);
  socketRef.current = socket;

  const refresh = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: 'list' } satisfies LobbyClientMsg));
  }, []);

  return { rooms, refresh };
}

// Keep a public room registered in the lobby while `active` is true; unregister on
// teardown or when `active` goes false. Re-registers whenever `row` changes (e.g. filled count).
export function useLobbyRegistration(row: LobbyRow | null, active: boolean): void {
  const socket = usePartySocket({ host: PARTY_HOST, party: LOBBY_PARTY, room: LOBBY_ROOM });
  const socketRef = useRef(socket);
  socketRef.current = socket;

  useEffect(() => {
    if (!active || !row) return;
    const s = socketRef.current;
    s?.send(JSON.stringify({ type: 'register', row } satisfies LobbyClientMsg));
    return () => {
      s?.send(JSON.stringify({ type: 'unregister', code: row.code } satisfies LobbyClientMsg));
    };
  }, [active, row]);
}
```

- [ ] **Step 5: Verify the client typechecks and builds**

Run (from the repo root): `npm run build`
Expected: PASS. If `usePartySocket`'s import specifier or option names differ in the installed `partysocket` version, fix the import/usage to match the installed package's types (the hook is a documented default export of `partysocket/react`), then re-run until the build is clean.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/online/config.ts src/online/useOnlineRoom.ts src/online/useLobby.ts
git commit -m "feat: client socket hooks for room + lobby (partysocket)"
```

---

## Self-Review Notes

- **Spec coverage (this plan = spec steps 3 + 4, transport only):** `roomServer`/room lifecycle → `roomReducer` (Task 1) + adapter (Task 3); `lobbyServer` registry → `lobbyReducer` (Task 2) + adapter (Task 3); wrangler DO bindings → Task 3; client `useOnlineRoom`/lobby hooks → Task 4. Deferred to Plan 2B: `animation.ts` extraction, `OnlineGame`, `MenuFlow` wiring, and the disconnect/reconnect + host-end-match UI (the reducer already emits `paused`/`resumed`/`over`; 2B renders them).
- **Type consistency:** adapters feed `RoomInput`/`LobbyInput` and fan out `Outbound.msg` (a `ServerMsg`) / `LobbyOutbound.msg` (a `LobbyServerMsg`) exactly as the reducers define; hooks parse the same `ServerMsg`/`LobbyServerMsg`. `useOnlineRoom.send` takes `ClientMsg`; `create` query keys (`mode`, `count`) match what `ScavengersServer.onConnect` reads.
- **Routing:** client `party` values (`scavengers-server`, `lobby-server`) equal the kebab-cased DO binding names, per the verified `routePartykitRequest` rule.
- **Placeholder scan:** none — every step has full code/commands. The one flagged uncertainty (exact `partysocket/react` import/option shape) is handled by a concrete build-until-clean instruction in Task 4 Step 5, not a placeholder.
- **Testability seam:** all rules are in `roomReducer`/`lobbyReducer` with direct unit tests; the DO adapters and hooks are thin and verified by a `wrangler dev` boot/route smoke (Task 3) and the client build (Task 4). Full end-to-end play is verified in Plan 2B once the UI exists.
