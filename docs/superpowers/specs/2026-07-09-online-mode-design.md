# Online Mode (Server-Authoritative, Live) — Design

**Date:** 2026-07-09
**Status:** Approved for planning

## Goal

Add real-time online multiplayer to Scavengers over PartyKit. Two-to-four players
on separate devices join a room and play a live authoritative game. The defining
difference from hotseat: **there is no handoff and no replay** — each player sees
their own fixed perspective and watches opponents' actions animate live (within
vision) as they happen.

## Non-Goals (v1)

- Server-side fog enforcement / anti-cheat. The server is authoritative for
  *rules* but broadcasts the full `GameState`; each client renders its own fog.
  A determined client could read hidden state from the wire. Accepted for v1.
- Optimistic prediction. The acting client waits for the server echo before
  animating. Turn-based play makes round-trip latency acceptable.
- Matchmaking/ranking, chat, spectators, persistence of finished games.
- Bots.

## Decisions (locked)

- **Authority:** server-authoritative. The PartyKit server imports the existing
  pure engine (`src/engine`) and holds the one true `GameState`. It re-runs the
  engine for every action; it never trusts a client's computed result.
- **Transport:** full `GameState` broadcast (plain JSON — already serializable)
  plus a small `ActionEvent` describing what happened; clients fog locally.
- **Rooms:** each room is a `partyserver` Durable Object instance keyed by room
  id. Private room id = the 6-char code (no registry needed). Public rooms
  additionally register with a singleton `lobby` Durable Object so the Join list
  is real.
- **Framework:** the server uses `partyserver` (Cloudflare Workers + Durable
  Objects, run locally via `wrangler dev`), and the client uses `partysocket`.
  This replaces the earlier hosted-PartyKit assumption; the API differs
  (`Server` subclass, `onMessage(conn, msg)`, `this.broadcast(msg, exclude)`),
  and config lives in `server/wrangler.jsonc` as Durable Object bindings +
  migrations, not `partykit.json`.
- **Start rule:** host-only; enabled only when the room is full (2/2 or 4/4).
- **Disconnect:** pause the game and show a "waiting to reconnect" overlay;
  rejoining the same room/slot resumes; the host can end the match.
- **Code sharing:** the server imports the engine via relative path
  (`../../src/engine`). The engine is pure TS with no browser deps, so PartyKit's
  esbuild bundler pulls it in cleanly. No monorepo/workspace tooling.

## Architecture & Data Flow

```
Client (my device)                 PartyKit room party
─────────────────                  ───────────────────────────
ControlPanel action  ── send ──▶   validate: sender's turn? legal?
                                   apply engine fn → resolveAttack → endTurn
my fog view  ◀── broadcast ──      new GameState + ActionEvent
animate the event live             (to every connection in the room)
```

- Each client is one fixed player: `viewerId = myPlayerId` (not `currentTurn`).
- When an opponent acts, the client animates the broadcast `ActionEvent` live by
  reusing the same frame-building used by hotseat replay.
- No `handoff` / `replaying` phases exist online.

## Components

### Server

**`server/src/protocol.ts`** — shared wire types, imported by both server and
client so the format is typed on both ends:

- `RoomPhase = 'lobby' | 'playing' | 'paused' | 'over'`
- `RosterEntry = { playerId: PlayerId; color: PlayerColor; connected: boolean; isHost: boolean }`
- `ClientMsg` (discriminated union): `join`, `startGame`, `action`, `endMatch`.
- `ActionRequest` (inside `action`): mirrors the hotseat flows —
  `{ kind: 'move'; path: Position[] }`,
  `{ kind: 'rest' }`,
  `{ kind: 'fakeMove'; dir: Position }`,
  `{ kind: 'attack'; type: 'punch'|'shoot'|'bomb'; path: Position[]; target: Position }`.
- `ActionEvent`: `{ actorId: PlayerId; request: ActionRequest; killedPlayerIds: PlayerId[] }`
  — enough for any client to reconstruct animation frames.
- `ServerMsg` (discriminated union): `roster` (`{ entries: RosterEntry[]; phase; mode; playerCount }`),
  `gameStart` (`{ state: GameState }`),
  `state` (`{ state: GameState; event: ActionEvent }`),
  `paused` (`{ disconnected: PlayerId }`),
  `resumed` (`{ state: GameState }`),
  `over` (`{ state: GameState }`),
  `error` (`{ message: string }`),
  `assigned` (`{ playerId: PlayerId }`).
- `LobbyRow = { code: string; mode: GameMode; playerCount: number; filled: number }`
  and lobby messages: `register`, `unregister`, `list` (request) → `rooms`
  (`{ rooms: LobbyRow[] }`).

**`server/src/actionReducer.ts`** — a *pure* function, unit-testable without a
socket:
`applyAction(state: GameState, actorId: PlayerId, req: ActionRequest): { state: GameState; event: ActionEvent } | { error: string }`.
It rejects when `state.currentTurn !== actorId`, when the actor is eliminated,
or when the engine call throws / is illegal, and otherwise runs the exact
hotseat contract (move/rest/fakeMove or attack → `resolveAttack` → `endTurn`,
including the phantom-crush case from `App.tsx`). Returns the new state and the
`ActionEvent`.

**`server/src/roomServer.ts`** (the room `partyserver` `Server` subclass,
replaces the echo stub in `server/src/server.ts`):
holds `phase`, roster (connectionId → slot + host flag), `mode`, `playerCount`,
and `GameState`. Message handling:
- `onConnect`: send current `roster`.
- `join`: assign the next free slot (host = first joiner = `p1`), broadcast
  `roster`, send `assigned` to the joiner. If public, keep the `lobby`
  registration's `filled` count current.
- `startGame`: host-only; reject unless every slot is filled. Build
  `createInitialGameState(mode, playerCount)`, set `phase='playing'`, broadcast
  `gameStart`. Unregister from lobby (no longer joinable).
- `action`: look up sender's slot; call `applyAction`. On error, reply `error`
  to sender only. On success, set state, broadcast `state` (with the event); if
  `state.winner !== null`, set `phase='over'` and broadcast `over`.
- `onClose`: mark the slot disconnected. If `phase==='playing'`, set
  `phase='paused'` and broadcast `paused`. If a disconnected player's slot is
  re-joined while paused, restore `phase='playing'` and broadcast `resumed`
  with current state.
- `endMatch` (host-only): set `phase='over'`, broadcast `over`.

**`server/src/lobbyServer.ts`** — a singleton party (fixed id, e.g. `lobby`).
Maintains an in-memory map of open public rooms. Handles `register`,
`unregister`, heartbeat-on-`register` refresh, and `list` → `rooms`. Rooms that
start or empty out are removed.

`server/wrangler.jsonc` gains Durable Object bindings + migrations for both the
room server class and the lobby server class; `routePartykitRequest(request, env)`
routes `/parties/:party/:room` to the matching Durable Object namespace.

### Client

**`src/online/protocol.ts`** — re-exports the shared types from the server
`protocol.ts` via relative import (single source of truth for the wire format).

**`src/online/useOnlineRoom.ts`** — a hook wrapping the PartyKit client socket
(`partysocket`). Signature:
`useOnlineRoom(roomId: string): { phase: RoomPhase; roster: RosterEntry[]; myPlayerId: PlayerId | null; state: GameState | null; lastEvent: ActionEvent | null; error: string | null; send: (msg: ClientMsg) => void }`.
All socket I/O and message parsing lives here; components never touch the socket
directly. On mount it connects and sends `join`.

**`src/online/useLobbyList.ts`** — a hook that connects to the `lobby` party,
requests `list`, and returns `LobbyRow[]` (polled/refreshed while the Join
screen is open).

**`src/game/animation.ts`** — the one targeted refactor. The frame-building logic
currently inline in `App.tsx` (`computeHitTiles`, `rayTiles`, `neighbors`,
`buildRespawnFrames`, and the move/attack `AnimFrame[]` assembly) is extracted
into pure functions here:
`buildActionFrames(state: GameState, event: ActionEvent): { frames: AnimFrame[]; victims: VictimInfo[]; killNoticeDelayMs: number }`.
`App.tsx` (hotseat) is updated to consume it, removing the duplication. `AnimFrame`
and the tint/death types move here (or a shared `src/game/animationTypes.ts`) so
`Board` and both orchestrators share them.

**`src/online/OnlineGame.tsx`** — the live orchestrator (online analog of the
in-game portion of `App.tsx`, with **no** handoff/replay/ref machinery). Given a
`roomId` and the room hook, it:
- fixes `viewerId = myPlayerId`;
- renders the shared presentational components (`Board`, `ControlPanel`,
  `ResourceBars`, `Lives`/`Leaderboard`, the kill/notice stacks);
- enables action-building only when `state.currentTurn === myPlayerId`; otherwise
  shows "Waiting for [color]…" and a disabled panel;
- on confirm, translates the `Flow` into an `ActionRequest` and `send`s it, then
  waits (shows "Resolving…") for the echo;
- on each incoming `state`+`event`, calls `buildActionFrames` and animates live
  via a `playFrames` helper (shared or duplicated minimally), then settles;
- shows a `paused` overlay ("Waiting for [color] to reconnect") and, for the
  host, an "End match" button; shows the winner banner on `over`.

### Menu / lobby wiring

`MenuFlow` online path becomes real:
- **Create Private:** generate code → navigate into `OnlineGame`/room view bound
  to `roomId = code`, visibility private (code shown).
- **Create Public:** same, and the room registers with the `lobby` party.
- **Join list:** `useLobbyList` renders live `LobbyRow`s with `filled/max`;
  clicking one enters that room.
- **Enter code:** connect to `roomId = code`.
- **Room screen:** shows the **live roster** (real slots filling as players join);
  `Start Game` is host-only and disabled until full.

The room/lobby screens read presence from `useOnlineRoom`/`useLobbyList` instead
of mock slots. Hotseat (In Person / Bots) paths are unchanged.

## Error Handling

- Illegal/out-of-turn action → server replies `error` to the sender only; the
  client surfaces it as an action notice and re-enables the panel. Authoritative
  state is never mutated.
- Malformed message → server ignores and optionally replies `error`.
- Host disconnect while in lobby → the room is effectively dead; joiners see a
  disconnected roster and can leave. (No host migration in v1.)
- Lobby registry loss (party restart) → public list may briefly miss rooms;
  code-join still works. Acceptable.

## Testing

- **Engine:** unchanged, still fully unit-tested.
- **`server/src/actionReducer.ts`:** unit-tested directly as a pure function —
  out-of-turn rejection, each action kind, the phantom-crush path, kill →
  extra-turn, win detection. No socket required. (Tested from the root Vitest
  suite via relative import, mirroring the engine tests.)
- **`src/game/animation.ts`:** unit-tested — `buildActionFrames` produces the
  expected frame counts / victim records for move, each attack type, and a
  crush, matching what `App.tsx` produced before extraction (guards the refactor).
- **Wire + UI:** verified via `npm run build` and a manual two-client playtest
  (two browser tabs against `partykit dev`): create → join fills roster → start
  when full → alternating live turns animate on both clients → a kill grants an
  extra turn → disconnect pauses → rejoin resumes → win ends the match.

## Rollout / Sequencing (for the plan)

1. Shared `protocol.ts` + `actionReducer.ts` (pure, tested) — no wire yet.
2. Extract `src/game/animation.ts` from `App.tsx`; keep hotseat green.
3. `roomServer.ts` room lifecycle + `lobbyServer.ts` registry; `partykit.json`.
4. Client `useOnlineRoom` / `useLobbyList` hooks.
5. `OnlineGame.tsx` live orchestrator.
6. `MenuFlow` real online wiring (roster, list, code, start-when-full).
7. Disconnect/reconnect overlay + host end-match.

Each step is independently buildable; steps 1–2 land with unit tests before any
networking exists.
