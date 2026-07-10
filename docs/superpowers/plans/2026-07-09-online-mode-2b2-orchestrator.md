# Online Mode — Plan 2B-2 (Live Orchestrator + Menu Wiring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tested online building blocks (transport hooks from 2A, `buildOnlineFrames` from 2B-1) into a playable online game: a live `OnlineGame` orchestrator, an `OnlineSession` wrapper that owns the socket for both the room-lobby and the in-game phases, real `MenuFlow` create/join wiring, and pause/reconnect/end-match overlays.

**Architecture:** One socket per online session. `App` routes to an `OnlineSession` for the online path; `OnlineSession` calls `useOnlineRoom(roomId, create?)` once and renders the room-lobby screen while `phase==='lobby'`, then `OnlineGame` for `playing`/`paused`/`over`. `OnlineGame` fixes `viewerId = myPlayerId`, gates the `ControlPanel` to the local player's turn, translates the `Flow` into an `ActionRequest` via a pure `flowToRequest`, `send`s it, and animates every incoming `(before → after, event)` transition with `buildOnlineFrames` + a local `playFrames`. There is **no** handoff/replay/ref machinery. The public lobby list uses a separate short-lived `useLobby` socket on the Join screen only.

**Tech Stack:** React 19, TypeScript strict (`verbatimModuleSyntax`, `noUnusedLocals`), Vitest, `partysocket`, the existing pure engine + `src/online/*` + `src/game/animation.ts`.

## Global Constraints

- Type-only imports **must** use `import type` (verbatimModuleSyntax).
- No unused locals/imports — `npm run build` (tsc -b + vite build) is the gate, not just tests.
- All colors come from `src/theme.ts` (`theme`) — never hardcode hex in components.
- Import engine symbols from the `./engine` barrel, never deep paths. Import online symbols from `src/online/*`.
- The engine and reducers are the source of truth; the client never recomputes authoritative results — it only renders and animates what the server broadcasts.
- UI components in this codebase are verified via `npm run build` + a manual preview playtest, **not** React component tests (project convention). Only pure logic gets Vitest coverage.

---

## File Structure

- `src/online/flowToRequest.ts` (create) — pure `Flow → ActionRequest | null` translation; the one correctness-critical, unit-tested piece of the client.
- `src/online/flowToRequest.test.ts` (create) — its tests.
- `src/online/OnlineGame.tsx` (create) — the live in-game orchestrator.
- `src/online/OnlineSession.tsx` (create) — owns `useOnlineRoom` for a room id; renders room-lobby screen or `OnlineGame`; registers public rooms with the lobby.
- `src/components/menu/MenuFlow.tsx` (modify) — real create/join wiring; replace mock room/slot screens; new `onEnterRoom` prop; Join screen uses `useLobby`.
- `src/App.tsx` (modify) — add an `online` route that renders `OnlineSession`.

---

## Task 1: `flowToRequest` — pure Flow → ActionRequest translation

**Files:**
- Create: `src/online/flowToRequest.ts`
- Test: `src/online/flowToRequest.test.ts`

**Interfaces:**
- Consumes: `Flow`, `AttackType` from `../components/ControlPanel`; `PlayerState`, `Position` from `../engine`; `ActionRequest` from `./protocol`.
- Produces: `flowToRequest(flow: Flow, player: PlayerState): ActionRequest | null`. Returns `null` when the flow is incomplete (no path/target chosen). `OnlineGame` (Task 2) calls this on Confirm and sends the result.

**Background — mirror `App.tsx` `handleConfirm` exactly (App.tsx:473–639):**
- `move` → `{ kind: 'move', path: flow.path }` (null if `path.length === 0`).
- `rest` → `{ kind: 'rest' }`.
- `fakeMove` with a `target` → `dir = target − phantomBase`, `{ kind: 'fakeMove', dir }`. `phantomBase = player.isPhantom && player.phantomDisplayPosition ? player.phantomDisplayPosition : player.position` (App.tsx:217). Null if no `target`.
- `attackTarget` with a `target` → `{ kind: 'attack', type: flow.type, path: flow.path, target: flow.target }`. Null if no `target`. (The server reducer derives the shoot direction as `target − from` itself, so we forward `path` + `target` raw — do **not** pre-compute a direction here.)
- Any other flow kind (`menu`, `attackReposition`, `attackSelect`) → `null`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { flowToRequest } from './flowToRequest';
import type { PlayerState } from '../engine';

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1',
    color: 'red',
    position: { x: 3, y: 3 },
    energy: 10,
    ammo: 5,
    score: 0,
    lives: 3,
    alive: true,
    eliminated: false,
    immuneTurns: 0,
    isPhantom: false,
    phantomDisplayPosition: null,
    ...overrides,
  } as PlayerState;
}

describe('flowToRequest', () => {
  it('translates a move flow to a move request', () => {
    const req = flowToRequest({ kind: 'move', path: [{ x: 3, y: 4 }, { x: 3, y: 5 }] }, player());
    expect(req).toEqual({ kind: 'move', path: [{ x: 3, y: 4 }, { x: 3, y: 5 }] });
  });

  it('returns null for an empty move path', () => {
    expect(flowToRequest({ kind: 'move', path: [] }, player())).toBeNull();
  });

  it('translates rest', () => {
    expect(flowToRequest({ kind: 'rest' }, player())).toEqual({ kind: 'rest' });
  });

  it('translates a fake move to a dir relative to the real position when no phantom', () => {
    const req = flowToRequest({ kind: 'fakeMove', target: { x: 4, y: 3 } }, player({ position: { x: 3, y: 3 } }));
    expect(req).toEqual({ kind: 'fakeMove', dir: { x: 1, y: 0 } });
  });

  it('projects a fake move from the accumulated phantom display position', () => {
    const p = player({ position: { x: 3, y: 3 }, isPhantom: true, phantomDisplayPosition: { x: 5, y: 3 } });
    const req = flowToRequest({ kind: 'fakeMove', target: { x: 6, y: 3 } }, p);
    expect(req).toEqual({ kind: 'fakeMove', dir: { x: 1, y: 0 } });
  });

  it('returns null for a fake move with no target', () => {
    expect(flowToRequest({ kind: 'fakeMove', target: null }, player())).toBeNull();
  });

  it('translates an attack, forwarding raw path + target', () => {
    const req = flowToRequest(
      { kind: 'attackTarget', type: 'shoot', path: [{ x: 3, y: 4 }], target: { x: 3, y: 7 } },
      player()
    );
    expect(req).toEqual({ kind: 'attack', type: 'shoot', path: [{ x: 3, y: 4 }], target: { x: 3, y: 7 } });
  });

  it('returns null for an attack with no target', () => {
    expect(flowToRequest({ kind: 'attackTarget', type: 'punch', path: [], target: null }, player())).toBeNull();
  });

  it('returns null for intermediate flows', () => {
    expect(flowToRequest({ kind: 'menu' }, player())).toBeNull();
    expect(flowToRequest({ kind: 'attackReposition', path: [] }, player())).toBeNull();
    expect(flowToRequest({ kind: 'attackSelect', path: [], type: null }, player())).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/online/flowToRequest.test.ts`
Expected: FAIL — "Cannot find module './flowToRequest'".

- [ ] **Step 3: Write the implementation**

```ts
import type { Flow } from '../components/ControlPanel';
import type { PlayerState } from '../engine';
import type { ActionRequest } from './protocol';

// Translate a completed ControlPanel Flow into the wire ActionRequest, mirroring
// App.tsx handleConfirm. Returns null when the flow is not yet a committable action
// (no path/target chosen, or an intermediate wizard step). The server reducer
// derives the shoot direction from path+target itself, so attacks forward raw.
export function flowToRequest(flow: Flow, player: PlayerState): ActionRequest | null {
  switch (flow.kind) {
    case 'move':
      return flow.path.length ? { kind: 'move', path: flow.path } : null;
    case 'rest':
      return { kind: 'rest' };
    case 'fakeMove': {
      if (!flow.target) return null;
      const base = player.isPhantom && player.phantomDisplayPosition ? player.phantomDisplayPosition : player.position;
      return { kind: 'fakeMove', dir: { x: flow.target.x - base.x, y: flow.target.y - base.y } };
    }
    case 'attackTarget':
      return flow.target ? { kind: 'attack', type: flow.type, path: flow.path, target: flow.target } : null;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/online/flowToRequest.test.ts`
Expected: PASS (all cases). If `PlayerState` field names differ, fix the test fixture to match `src/engine/types.ts` — do not change the production signature.

- [ ] **Step 5: Build gate**

Run: `npm run build`
Expected: typecheck + build PASS.

- [ ] **Step 6: Commit**

```bash
git add src/online/flowToRequest.ts src/online/flowToRequest.test.ts
git commit -m "feat: pure Flow -> ActionRequest translation for online play"
```

---

## Task 2: `OnlineGame.tsx` — live in-game orchestrator

**Files:**
- Create: `src/online/OnlineGame.tsx`

**Interfaces:**
- Consumes: `OnlineRoom` (the return of `useOnlineRoom`, from `./useOnlineRoom`); `flowToRequest` (Task 1); `buildOnlineFrames` (`./buildOnlineFrames`); `AnimFrame`, `plainFrame` (`../game/animation`); the shared presentational components (`Board`, `ResourceBars`, `Lives`, `Leaderboard`, `ControlPanel`) and their exported types; `theme`.
- Produces: `OnlineGame({ room, onLeave }: { room: OnlineRoom; onLeave: () => void })`. Rendered by `OnlineSession` (Task 3) whenever `room.phase` is `playing` | `paused` | `over`.

**Design (adapts the in-game half of `App.tsx`, minus handoff/replay):**
- `viewerId = room.myPlayerId` (fixed for the whole match). If `state` or `myPlayerId` is null, render a "Connecting…" placeholder.
- Local animation state: `display` (GameState shown on the board), `redTints`, `deathAnims`, plus a `animating` boolean. Reuse the exact highlight/targeting/preview/flow logic from `App.tsx` but bound to `viewerId` (which here is the local player, not `currentTurn`).
- `myTurn = state.currentTurn === viewerId`. `interactive = myTurn && !animating && room.phase === 'playing' && state.winner === null`.
- **Sending:** on Confirm, `req = flowToRequest(flow, state.players[viewerId])`; if `req`, `room.send({ type: 'action', request: req })`, set `flow = { kind: 'menu' }` and a local `sending` flag (shows "Resolving…"). Do **not** mutate `state` locally — wait for the echo.
- **Animating incoming transitions:** keep `prevStateRef = useRef<GameState | null>(null)` holding the last *settled* state (the `before` for the next event). A `processedEventRef = useRef<ActionEvent | null>(null)` guards against re-processing. In a `useEffect` on `[room.state, room.lastEvent]`:
  - If `room.state` is null → nothing.
  - If `room.lastEvent` is null (initial `gameStart` or a `resumed` snapshot) → snap: `setDisplay(room.state)`, `prevStateRef.current = room.state`, clear tints/deaths, `setAnimating(false)`.
  - Else if `room.lastEvent !== processedEventRef.current` (new event): `processedEventRef.current = room.lastEvent`; `before = prevStateRef.current ?? room.state`; `frames = buildOnlineFrames(before, room.state, room.lastEvent)`; `setAnimating(true)`; `playFrames(frames, () => { prevStateRef.current = room.state; setDisplay(room.state); setAnimating(false); setSending(false); })`. Push a kill notice for each `room.lastEvent.killedPlayerIds` (see below).
- **`playFrames`** — copy the helper from `App.tsx:337–361` verbatim, but drive local `setDisplay/setRedTints/setDeathAnims` and a local `schedule/clearTimers` pair (App.tsx:139–146) kept in a `timersRef`; clear timers on unmount.
- **Kills panel + notices:** keep a lean version — a `notifications` list (killer/victim colors + verb) appended on each event with kills, and the ephemeral toast stack. Derive killer = `event.actorId`, verb from `event.request` (`move`→'crushed', attack→`{punch:'punched',shoot:'shot',bomb:'bombed'}[type]`, else skip). Reuse `renderColoredText` — copy it from `App.tsx:58–66` into this file (small, and the two orchestrators are independent). Victim colors come from `room.state.players[id].color`.
- **Turn banner:** when `!myTurn` and playing, show "Waiting for {opponent color}…" where opponent = `state.players[state.currentTurn].color`; the ControlPanel area shows a disabled/hidden panel (render the "Resolving…" style box instead of `ControlPanel`).
- **Winner (`phase==='over'` or `state.winner!==null`):** show "Player {color} wins!" banner + a "Back to Menu" button calling `onLeave`.
- **Paused / end-match overlays** are added in Task 3 — leave a `TODO(Task 3)` comment where the `room.phase === 'paused'` branch will go, and render nothing special for `paused` yet (Task 3 fills it).

- [ ] **Step 1: Write the component**

Create `src/online/OnlineGame.tsx`. Port the following from `App.tsx`, rebound to `viewerId = room.myPlayerId`:
- imports (engine symbols used by highlight/targeting/preview logic, Board/ResourceBars/Lives/Leaderboard/ControlPanel + types, theme, animation helpers, `flowToRequest`, `buildOnlineFrames`);
- `simulateEnergyAfterPath` (App.tsx:72–82) and `useCellSize` (App.tsx:84–94) — copy verbatim;
- `renderColoredText` (App.tsx:58–66) — copy verbatim;
- the highlight/targeting/preview/`boardState`/`handleTileClick`/capabilities/`phantomBase`/`confirmEnabled` blocks (App.tsx:202–333, 736–781) — copy, replacing every `state.currentTurn` viewer reference with the fixed `viewerId`, and gating on the `interactive` defined above;
- `handleSelectAction` / `handleSelectAttackType` / `handleNext` / `handleBack` / `handleCancel` (App.tsx:698–734) — copy, using `viewerId`;
- `playFrames` + `schedule`/`clearTimers`/`timersRef` + the notice helpers;
- the incoming-transition `useEffect` described above;
- `handleConfirm` reduced to: `const req = flowToRequest(flow, state.players[viewerId]); if (!req) return; room.send({ type: 'action', request: req }); setFlow({ kind: 'menu' }); setSending(true);`
- the render: reuse the `App.tsx` in-game JSX (App.tsx:909–1050) — the header (with a "Leave" button calling `onLeave` instead of `backToMenu`), Lives/Leaderboard, ResourceBars (of `state.players[viewerId]`, with `preview`), Board (`viewerId`, `visionCenter={interactive ? state.players[viewerId].position : undefined}`), the ControlPanel-or-status box (status = "Resolving…" when `sending`/`animating`, "Waiting for {color}…" when `!myTurn`), the Kills panel, and the winner banner. Handle `room.error` by surfacing it as a toast (push into `actionNotices` in a `useEffect` on `[room.error]`).

> The full ported component is large but mechanical — it is the App.tsx in-game body with `viewerId` fixed and the replay/handoff/`applyResult` machinery replaced by the send + incoming-`useEffect` flow above. Keep behavior identical for the shared sub-blocks so the board, highlights, and previews match hotseat exactly.

- [ ] **Step 2: Build gate**

Run: `npm run build`
Expected: PASS. Fix any `noUnusedLocals` / `import type` errors (e.g. drop engine imports only hotseat needed like `createInitialGameState`, `resolveAttack`, `endTurn`).

- [ ] **Step 3: Full suite**

Run: `npm run test`
Expected: all existing tests still PASS (this task adds no engine/reducer changes).

- [ ] **Step 4: Commit**

```bash
git add src/online/OnlineGame.tsx
git commit -m "feat: OnlineGame live orchestrator (send actions, animate broadcasts)"
```

---

## Task 3: `OnlineSession.tsx` — socket owner, room-lobby screen, pause/reconnect/end-match

**Files:**
- Create: `src/online/OnlineSession.tsx`
- Modify: `src/online/OnlineGame.tsx` (fill the pause/end-match overlays left as TODO in Task 2)

**Interfaces:**
- Consumes: `useOnlineRoom` (`./useOnlineRoom`), `useLobbyRegistration` (`./useLobby`), `OnlineGame` (Task 2), `LobbyRow` (`./protocol`), `GameMode` (`../engine`), `theme`.
- Produces: `OnlineSession({ roomId, create, onLeave }: { roomId: string; create?: { mode: GameMode; count: number; visibility: 'public' | 'private' }; onLeave: () => void })`. Rendered by `App` (Task 4) for the online route.

**Design:**
- `const room = useOnlineRoom(roomId, create ? { mode: create.mode, count: create.count } : undefined);`
- Public-room registration: build `row: LobbyRow | null = create?.visibility === 'public' ? { code: roomId, mode: room.mode, playerCount: room.playerCount, filled: room.roster.length } : null;` and call `useLobbyRegistration(row, room.phase === 'lobby');` (registers while in lobby, re-registers as `filled` changes, unregisters on start/teardown — matching `useLobby.ts:39–52`).
- `isHost = room.roster.find((r) => r.playerId === room.myPlayerId)?.isHost ?? false;`
- **`phase === 'lobby'` → room-lobby screen:** BackArrow (calls `onLeave`), title (`create?.visibility === 'private' ? 'Private Room' : create ? 'Public Room' : 'Room'`), a live slot list of length `room.playerCount` — each filled slot shows its color (`room.roster[i]?.color` uppercased, "(you)" if `=== room.myPlayerId`, "(host)" if that entry `isHost`), empty slots show "Waiting for player…". Show the room code (`roomId`) when `create?.visibility === 'private'` **or** when joining (`!create`) so a joiner can share it. Host sees a `Start Game` button `disabled={room.roster.length < room.playerCount}` that calls `room.send({ type: 'startGame' })`; non-host sees "Waiting for host to start…". Reuse the card/slot styles from the current `MenuFlow` room screen (MenuFlow.tsx:164–195).
- **`phase` playing/paused/over → `<OnlineGame room={room} onLeave={onLeave} />`.**

**OnlineGame pause/end-match overlay (fill the Task 2 TODO):**
- When `room.phase === 'paused'`, render a full-screen dimmed overlay above the board: "Waiting for a player to reconnect…". If `isHost` (pass `isHost` into `OnlineGame` as a prop, or recompute from `room.roster`/`room.myPlayerId` inside it), also show an "End Match" button calling `room.send({ type: 'endMatch' })`. The server broadcasts `over` in response, flipping `room.phase` to `over` → the winner/back-to-menu banner shows.
- The board underneath keeps its last `display`; the overlay just blocks interaction (which is already gated by `interactive`).

- [ ] **Step 1: Add `isHost` prop to OnlineGame and the paused overlay**

In `OnlineGame.tsx`, extend the props to `{ room; onLeave; isHost }`. Replace the Task 2 `TODO(Task 3)` with a paused-overlay element rendered (conditionally on `room.phase === 'paused'`) as a `position: fixed` dim layer with the message and, when `isHost`, an "End Match" button (`room.send({ type: 'endMatch' })`). Style with `theme` tokens.

- [ ] **Step 2: Write `OnlineSession.tsx`**

Implement per the design above: the hook wiring, lobby registration, the lobby-phase screen, and the `OnlineGame` render for the in-game phases (passing `isHost`).

- [ ] **Step 3: Build gate**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/online/OnlineSession.tsx src/online/OnlineGame.tsx
git commit -m "feat: OnlineSession room-lobby + pause/reconnect/end-match overlays"
```

---

## Task 4: `MenuFlow` real online wiring + `App` online route

**Files:**
- Modify: `src/components/menu/MenuFlow.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useLobby` (`../../online/useLobby`), `LobbyRow` (`../../online/protocol`), `GameMode` (`../../engine`).
- Produces (MenuFlow): a new prop `onEnterRoom(config: { roomId: string; create?: { mode: GameMode; count: number; visibility: 'public' | 'private' } }): void`, alongside the existing `onStartGame` (hotseat, unchanged). App passes both.
- Produces (App): an `online` route rendering `OnlineSession`.

**Design — MenuFlow:**
- Keep the `gameType` and `settings` screens as-is. The online branch of `settings` (MenuFlow.tsx:144–158) stays: Join / Create Game, then Create Public / Create Private.
- **Create Public** → `onEnterRoom({ roomId: generateRoomCode(), create: { mode, count: playerCount, visibility: 'public' } })`.
- **Create Private** → same with `visibility: 'private'`.
  (The room-lobby screen now lives in `OnlineSession`, so MenuFlow no longer renders its own `room` screen. Delete the `screen === 'room'` block, MenuFlow.tsx:163–196, and the `roomCode`/`visibility`/`creating`-driven mock room state that only fed it — keep `creating` since it toggles the Create buttons.)
- **Join screen** (`screen === 'join'`): replace the mock "No rooms available" with a live list from `useLobby()`. Because hooks can't be called conditionally, render the Join screen as its own child component `JoinScreen({ onBack, onEnterRoom })` that calls `useLobby()` at its top. It shows:
  - an "Enter code" button → `window.prompt` → `onEnterRoom({ roomId: code.trim().toUpperCase() })` (no `create` — joiner inherits room settings);
  - the live `rooms` list: each `LobbyRow` as a clickable row showing `code`, mode, and `filled/playerCount`; click → `onEnterRoom({ roomId: row.code })`; disable/skip rows where `filled >= playerCount`;
  - a "Refresh" affordance calling `refresh()` (optional; `useLobby` also lists on open);
  - "No public rooms" when empty.

**Design — App:**
- Replace the `screen: 'menu' | 'game'` state with a `route` union: `{ kind: 'menu' } | { kind: 'game' } | { kind: 'online'; roomId: string; create?: {...} }`. (Or add an `online` case alongside the existing screen state — either is fine; keep the hotseat `game` path byte-identical.)
- `MenuFlow` gets `onStartGame` (→ existing `startGame` + go to `game`) and `onEnterRoom` (→ go to `online` route with the config).
- The `online` route renders `<OnlineSession roomId={...} create={...} onLeave={() => setRoute({ kind: 'menu' })} />`.
- Hotseat (In Person / Bots) is unchanged.

- [ ] **Step 1: Add the `online` route to App**

Modify `App.tsx`: introduce the online route/state, import `OnlineSession`, render it for the online route, and pass `onEnterRoom` to `MenuFlow`. Leave the entire hotseat flow untouched.

- [ ] **Step 2: Wire MenuFlow — Create buttons + `onEnterRoom` prop**

Add the `onEnterRoom` prop; point Create Public/Private at it; delete the mock `room` screen and its now-unused state.

- [ ] **Step 3: Wire MenuFlow — live Join screen**

Extract `JoinScreen` as a child component using `useLobby()`; render the live room list, "Enter code", and click-to-join per the design.

- [ ] **Step 4: Build gate**

Run: `npm run build`
Expected: PASS. Resolve any unused-state warnings from the deleted mock room screen.

- [ ] **Step 5: Full suite**

Run: `npm run test`
Expected: all PASS.

- [ ] **Step 6: Manual two-client playtest (controller / user)**

Start the server (`wrangler dev` in `server/`) and the app (`npm run dev`), open two browser tabs:
1. Tab A: Online → settings → Create → Create Public. Lands on the room-lobby screen, roster shows 1/2, code visible.
2. Tab B: Online → Join → the public room appears with `1/2` → click it. Both tabs now show 2/2; host (Tab A) `Start Game` enables.
3. Host clicks Start → both tabs enter `OnlineGame` on their own fixed perspective.
4. Take alternating turns: the acting tab sends and sees "Resolving…", both tabs animate the action live within vision; a kill grants the actor an extra turn.
5. Close Tab B mid-game → Tab A shows the paused overlay; reopen/rejoin the same room → resumes.
6. Play to a win → both tabs show the winner banner + Back to Menu.

Record the result (pass/fail per step) in the progress ledger. Expected: all steps pass; no console errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/menu/MenuFlow.tsx src/App.tsx
git commit -m "feat: wire MenuFlow to live rooms + App online route"
```

---

## Self-Review Notes (checked against the design doc)

- **Design coverage:** OnlineGame live orchestrator (Task 2), fixed `viewerId` + turn-gated panel + live animation via `buildOnlineFrames` (Task 2), pause/reconnect/end-match + winner (Tasks 2–3), MenuFlow real create/join/roster/list/code/start-when-full (Tasks 3–4). Server (2A) and animation (2B-1) are already merged; this plan is client-only assembly.
- **Type consistency:** `flowToRequest(flow, player)` (Task 1) is consumed with `state.players[viewerId]` in Task 2. `OnlineSession` passes `room: OnlineRoom` + `isHost` + `onLeave` into `OnlineGame` (Tasks 2–3 agree). `onEnterRoom` config shape is identical in MenuFlow (Task 4) and OnlineSession props (Task 3).
- **Convention deviation (intentional):** Tasks 2–4 are UI and are gated by `npm run build` + a manual two-client playtest rather than component unit tests, per the project's stated testing convention. Only `flowToRequest` (pure) gets Vitest coverage.
- **Known limitation carried from design:** full-GameState broadcast means clients technically receive hidden state (v1 accepts no anti-cheat); the fog is client-side in `Board`.
