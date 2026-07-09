# Online Mode — Plan 2B-1: Shared animation primitives + online frame builder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the stateless animation primitives currently inlined in `App.tsx` into a shared `src/game/animation.ts`, and add a pure, unit-tested `buildOnlineFrames(before, after, event)` that produces the live animation frames the online game (Plan 2B-2) will play — without touching the hotseat `handleConfirm` frame-assembly (kept green).

**Architecture:** `src/game/animation.ts` holds the frame type, timing constants, and pure tile/frame helpers (`DIRS8`, `eq`, `neighbors`, `rayTiles`, `computeHitTiles`, `plainFrame`). `App.tsx` imports them instead of defining them locally (zero behavior change). A new `src/online/buildOnlineFrames.ts` reuses those primitives + the engine to turn an authoritative `(before, after, ActionEvent)` into an `AnimFrame[]` (move steps, attack ripple, death/respawn fades), so both hotseat and online animate from the same primitives. Online-specific frame assembly lives with the online code; the hotseat assembly stays in `App.tsx`.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`, `noUnusedLocals`), Vitest, the existing pure engine and Plan 1 `applyAction`.

## Global Constraints

- Strict TypeScript: type-only imports MUST use `import type`; unused locals fail the build. `npm run build` is the real gate.
- No engine changes. No behavior change to hotseat play (Task 1 is a pure move-and-import refactor; verify by full test suite + manual hotseat playtest).
- `src/game/animation.ts` must be pure/stateless (no React, no DOM beyond the `Position`/`GameState` data types). `src/online/buildOnlineFrames.ts` must be pure (no React/DOM/network) so it can be unit-tested and reused; its tests are `src/online/*.test.ts` (Vitest scans `src/**/*.test.ts`).
- `AnimFrame`, `RedTint`, `DeathAnim` are the existing types; `RedTint`/`DeathAnim` are exported from `src/components/Board.tsx` and must be imported from there (do not redefine them).

## Reference: current locations in `src/App.tsx` (to be moved in Task 1)

- Timing constants (lines ~37–46): `RESULT_MS = 1200`, `REPLAY_START_MS = 300`, `REPLAY_END_MS = 300`, `MOVE_STEP_MS = 550`, `DEATH_OUT_MS = 1100`, `DEATH_IN_MS = 600`, `TINT_FADE_MS = 170`, `TINT_STEP = 110`, `TINT_HOLD_MS = 1400`. Move the animation-shared ones (`RESULT_MS`, `MOVE_STEP_MS`, `DEATH_OUT_MS`, `DEATH_IN_MS`, `TINT_FADE_MS`, `TINT_STEP`, `TINT_HOLD_MS`) to `animation.ts`. `REPLAY_START_MS`/`REPLAY_END_MS` are hotseat-only — leave them in `App.tsx`.
- `interface AnimFrame` (lines ~55–62), `plainFrame` (line ~75), `DIRS8` (77–80), `eq` (82), `neighbors` (84–88), `rayTiles` (90–100), `computeHitTiles` (105–129). Move all of these to `animation.ts`.
- `App.tsx` uses all of the above in its body (`highlights`, `handleConfirm`, `handleTileClick`, `startTurn`), so after moving it must import them.
- `computeHitTiles`'s `type` param is `AttackType` (from `ControlPanel`, = `'punch' | 'shoot' | 'bomb'`). In `animation.ts` type the param structurally as `'punch' | 'shoot' | 'bomb'` so no component import is needed; `App.tsx`'s `AttackType` value is assignable to it.

---

## Task 1: Extract stateless animation primitives to `src/game/animation.ts`

**Files:**
- Create: `src/game/animation.ts`
- Modify: `src/App.tsx` (remove the moved definitions; import them instead)

**Interfaces:**
- Produces: `AnimFrame`; constants `RESULT_MS`, `MOVE_STEP_MS`, `DEATH_OUT_MS`, `DEATH_IN_MS`, `TINT_FADE_MS`, `TINT_STEP`, `TINT_HOLD_MS`; `DIRS8`, `eq(a,b)`, `neighbors(board, from)`, `rayTiles(from)`, `computeHitTiles(board, type, from, target)`, `plainFrame(display, holdMs)`. Task 2 and Plan 2B-2 consume these.

- [ ] **Step 1: Create the shared module**

Create `src/game/animation.ts`:

```ts
import type { GameState, Position, PlayerId } from '../engine';
import { isInBounds, isWall, traceLine } from '../engine';
import type { RedTint, DeathAnim } from '../components/Board';

// ---- Timing (ms) shared by live 'result' play and opponent replays/live online play ----
export const RESULT_MS = 1200;     // how long an actor sees their own outcome before handoff
export const MOVE_STEP_MS = 550;   // hold time for an intermediate step of a 2-tile move
export const DEATH_OUT_MS = 1100;  // hold time for the death fade-out frame
export const DEATH_IN_MS = 600;    // hold time for the death fade-in (respawn) frame
export const TINT_FADE_MS = 170;   // per-tile fade-in duration (matches Board's redTintOn)
export const TINT_STEP = 110;      // per-tile stagger for the attack ripple
export const TINT_HOLD_MS = 1400;  // dwell with every tile lit before they clear

// A single step of an animated sequence: the board/player state to show, the tint
// overlays and death-fade info active during this step, and how long to hold it.
export interface AnimFrame {
  display: GameState;
  redTints: RedTint[];
  death: DeathAnim[];
  holdMs: number;
  // Which player's turn produced this frame (used to label hotseat replays by color).
  actorId?: PlayerId;
}

export const plainFrame = (display: GameState, holdMs: number): AnimFrame => ({ display, redTints: [], death: [], holdMs });

export const DIRS8: Position[] = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
];

export const eq = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

export function neighbors(board: GameState['board'], from: Position): Position[] {
  return DIRS8.map((d) => ({ x: from.x + d.x, y: from.y + d.y })).filter(
    (p) => isInBounds(p) && !isWall(board, p)
  );
}

export function rayTiles(from: Position): Position[] {
  const tiles: Position[] = [];
  for (const d of DIRS8) {
    let c = { x: from.x + d.x, y: from.y + d.y };
    while (isInBounds(c)) {
      tiles.push(c);
      c = { x: c.x + d.x, y: c.y + d.y };
    }
  }
  return tiles;
}

// The tiles a punch/shoot/bomb would actually hit from `from`, aimed at `target`.
export function computeHitTiles(
  board: GameState['board'],
  type: 'punch' | 'shoot' | 'bomb',
  from: Position,
  target: Position
): Position[] {
  if (type === 'shoot') {
    const dir = { x: target.x - from.x, y: target.y - from.y };
    return traceLine(board, from, dir);
  }
  if (type === 'bomb') {
    const tiles: Position[] = [{ x: target.x, y: target.y }];
    for (const d of DIRS8) {
      const p = { x: target.x + d.x, y: target.y + d.y };
      if (isInBounds(p)) tiles.push(p);
    }
    return tiles;
  }
  // punch: the targeted ring tile plus its two neighbors in the ring of 8 around the origin.
  const ringIdx = DIRS8.findIndex((d) => eq({ x: from.x + d.x, y: from.y + d.y }, target));
  const idxs = ringIdx === -1 ? [] : [(ringIdx - 1 + 8) % 8, ringIdx, (ringIdx + 1) % 8];
  const tiles: Position[] = [];
  for (const k of idxs) {
    const d = DIRS8[k];
    const p = { x: from.x + d.x, y: from.y + d.y };
    if (isInBounds(p)) tiles.push(p);
  }
  return tiles;
}
```

- [ ] **Step 2: Update `App.tsx` to import from the shared module**

In `src/App.tsx`:

1. Add this import near the other component/local imports (after the `theme` import line):

```ts
import {
  type AnimFrame,
  RESULT_MS,
  MOVE_STEP_MS,
  DEATH_OUT_MS,
  DEATH_IN_MS,
  TINT_FADE_MS,
  TINT_STEP,
  TINT_HOLD_MS,
  DIRS8,
  eq,
  neighbors,
  rayTiles,
  computeHitTiles,
  plainFrame,
} from './game/animation';
```

2. DELETE the now-duplicated definitions from `App.tsx`:
   - the constant declarations `RESULT_MS`, `MOVE_STEP_MS`, `DEATH_OUT_MS`, `DEATH_IN_MS`, `TINT_FADE_MS`, `TINT_STEP`, `TINT_HOLD_MS` (keep `REPLAY_START_MS` and `REPLAY_END_MS` — they are hotseat-only and still defined in `App.tsx`).
   - `interface AnimFrame { ... }`
   - `const plainFrame = ...`
   - `const DIRS8: Position[] = [...]`
   - `const eq = ...`
   - `function neighbors(...) { ... }`
   - `function rayTiles(...) { ... }`
   - `function computeHitTiles(...) { ... }`

3. If `traceLine`, `isWall`, or `isInBounds` become unused in `App.tsx` after the move, remove them from the `./engine` import to satisfy `noUnusedLocals`. (`isInBounds` is still used directly in `App.tsx`'s `attackTarget` highlight branch — keep it if so; verify against the build error, which names any unused import.)

- [ ] **Step 3: Verify the build (catches any missed usage / unused import)**

Run: `npm run build`
Expected: PASS. If it fails on an unused import (`traceLine`/`isWall`/`isInBounds`) or a missing symbol, adjust the `./engine` and `./game/animation` imports until clean — do NOT change any logic.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS (unchanged — this is a pure refactor; the engine/reducer suites are unaffected).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Manual hotseat verification (no behavior change)**

Run `npm run dev`; start a local 2-player game and confirm animations are IDENTICAL to before: a 2-tile move steps tile-by-tile; an attack shows the staggered red ripple; a kill shows the death fade-out then respawn fade-in. (This guards the refactor since there are no component tests.)

- [ ] **Step 7: Commit**

```bash
git add src/game/animation.ts src/App.tsx
git commit -m "refactor: extract shared animation primitives to game/animation"
```

---

## Task 2: Pure online frame builder (`buildOnlineFrames`)

**Files:**
- Create: `src/online/buildOnlineFrames.ts`
- Test: `src/online/buildOnlineFrames.test.ts`

**Interfaces:**
- Consumes: `AnimFrame`, timing constants, `computeHitTiles`, `plainFrame` from `../game/animation`; `movePlayer` and types from `../engine`; `ActionEvent` from `./protocol`; `RedTint`/`DeathAnim` types from `../components/Board`.
- Produces: `buildOnlineFrames(before: GameState, after: GameState, event: ActionEvent): AnimFrame[]`. Plan 2B-2's `OnlineGame` consumes it to animate every incoming authoritative action.

`before` is the state the client currently shows; `after` is the authoritative post-action state from the server; `event` says what happened. The builder reconstructs the visual sequence (move steps, attack ripple, death/respawn fades) using the shared primitives, ending on `after`.

- [ ] **Step 1: Write the failing tests**

Create `src/online/buildOnlineFrames.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../engine';
import type { GameState, PlayerId, Position } from '../engine';
import { applyAction } from './actionReducer';
import type { ActionRequest, ActionEvent } from './protocol';
import { buildOnlineFrames } from './buildOnlineFrames';

function withPlayerAt(s: GameState, id: PlayerId, pos: Position): GameState {
  return { ...s, players: { ...s.players, [id]: { ...s.players[id], position: pos } } };
}
function withEmptyTile(s: GameState, pos: Position): GameState {
  const board = s.board.map((r) => r.slice());
  board[pos.y][pos.x] = { type: 'empty' };
  return { ...s, board };
}
// Run the reducer to get the authoritative `after` + a matching ActionEvent, like the server does.
function apply(before: GameState, actor: PlayerId, req: ActionRequest): { after: GameState; event: ActionEvent } {
  const res = applyAction(before, actor, req);
  if (!res.ok) throw new Error(res.error);
  return { after: res.state, event: res.event };
}

describe('buildOnlineFrames', () => {
  it('a rest produces a single settle frame on the after-state', () => {
    const before = createInitialGameState('deathmatch', 2);
    const { after, event } = apply(before, 'p1', { kind: 'rest' });
    const frames = buildOnlineFrames(before, after, event);
    expect(frames).toHaveLength(1);
    expect(frames[0].display).toBe(after);
    expect(frames[0].redTints).toEqual([]);
    expect(frames[0].death).toEqual([]);
  });

  it('a 2-tile move produces stepped frames ending on the after-state', () => {
    let before = createInitialGameState('deathmatch', 2);
    before = withPlayerAt(before, 'p1', { x: 5, y: 5 });
    before = withEmptyTile(before, { x: 6, y: 5 });
    before = withEmptyTile(before, { x: 7, y: 5 });
    const { after, event } = apply(before, 'p1', { kind: 'move', path: [{ x: 6, y: 5 }, { x: 7, y: 5 }] });
    const frames = buildOnlineFrames(before, after, event);
    // one snap-back + one intermediate step + settle
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames[frames.length - 1].display).toBe(after);
  });

  it('an attack with no kill produces a ripple frame carrying red tints', () => {
    let before = createInitialGameState('deathmatch', 2);
    before = withPlayerAt(before, 'p1', { x: 5, y: 5 });
    // p2 far away so the punch hits nothing
    before = withPlayerAt(before, 'p2', { x: 0, y: 0 });
    const { after, event } = apply(before, 'p1', { kind: 'attack', type: 'punch', path: [], target: { x: 5, y: 4 } });
    const frames = buildOnlineFrames(before, after, event);
    expect(frames.some((f) => f.redTints.length > 0)).toBe(true);
    expect(frames[frames.length - 1].display).toBe(after);
  });

  it('an attack that kills carries a death fade-out for the victim and reports the victim in the event', () => {
    let before = createInitialGameState('deathmatch', 2);
    before = withPlayerAt(before, 'p1', { x: 5, y: 5 });
    before = withPlayerAt(before, 'p2', { x: 5, y: 4 }); // adjacent, punchable
    const { after, event } = apply(before, 'p1', { kind: 'attack', type: 'punch', path: [], target: { x: 5, y: 4 } });
    expect(event.killedPlayerIds).toContain('p2');
    const frames = buildOnlineFrames(before, after, event);
    const outFrame = frames.find((f) => f.death.some((d) => d.playerId === 'p2' && d.stage === 'out'));
    expect(outFrame).toBeDefined();
    // death fade-out uses the victim's pre-death position from `before`
    expect(outFrame!.death.find((d) => d.playerId === 'p2')!.deathPos).toEqual({ x: 5, y: 4 });
  });

  it('a fake move produces a single settle frame', () => {
    const before = createInitialGameState('deathmatch', 2);
    const { after, event } = apply(before, 'p1', { kind: 'fakeMove', dir: { x: 1, y: 0 } });
    const frames = buildOnlineFrames(before, after, event);
    expect(frames).toHaveLength(1);
    expect(frames[0].display).toBe(after);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/online/buildOnlineFrames.test.ts`
Expected: FAIL — module `./buildOnlineFrames` not found.

- [ ] **Step 3: Implement the builder**

Create `src/online/buildOnlineFrames.ts`:

```ts
import { movePlayer } from '../engine';
import type { GameState, PlayerId, Position } from '../engine';
import type { RedTint, DeathAnim } from '../components/Board';
import type { ActionEvent } from './protocol';
import {
  type AnimFrame,
  RESULT_MS,
  MOVE_STEP_MS,
  DEATH_OUT_MS,
  DEATH_IN_MS,
  TINT_FADE_MS,
  TINT_STEP,
  TINT_HOLD_MS,
  computeHitTiles,
  plainFrame,
} from '../game/animation';

interface Victim {
  playerId: PlayerId;
  deathPos: Position;
  respawnPos: Position | null;
}

// Death fade-out frame(s) + respawn fade-in frame for the victims of an action.
// `after` already reflects each victim's resolved (respawned or eliminated) position,
// so the 'out' frame must carry the fade from the start (mirrors App.tsx).
function victimsOf(before: GameState, after: GameState, killed: PlayerId[]): Victim[] {
  return killed.map((id) => ({
    playerId: id,
    deathPos: before.players[id].position,
    respawnPos: after.players[id].eliminated ? null : after.players[id].position,
  }));
}
function respawnFrame(after: GameState, victims: Victim[]): AnimFrame[] {
  const respawning = victims.filter((v) => v.respawnPos !== null);
  if (!respawning.length) return [];
  return [
    {
      display: after,
      redTints: [],
      death: respawning.map((v) => ({ playerId: v.playerId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'in' as const })),
      holdMs: DEATH_IN_MS,
    },
  ];
}

// Turn an authoritative (before -> after) transition into the live animation frames.
export function buildOnlineFrames(before: GameState, after: GameState, event: ActionEvent): AnimFrame[] {
  const req = event.request;
  const actorId = event.actorId;

  if (req.kind === 'rest' || req.kind === 'fakeMove') {
    return [plainFrame(after, RESULT_MS)];
  }

  if (req.kind === 'move') {
    // Step the mover tile-by-tile: snap to the start, then show each intermediate tile.
    const frames: AnimFrame[] = [plainFrame(before, MOVE_STEP_MS)];
    if (req.path.length === 2) {
      frames.push(plainFrame(movePlayer(before, actorId, [req.path[0]]), MOVE_STEP_MS));
    }
    if (event.killedPlayerIds.length) {
      // Phantom-crush: no ripple, just the death fade on the after-state.
      const victims = victimsOf(before, after, event.killedPlayerIds);
      frames.push({
        display: after,
        redTints: [],
        death: victims.map((v) => ({ playerId: v.playerId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'out' as const })),
        holdMs: Math.max(MOVE_STEP_MS, DEATH_OUT_MS),
      });
      frames.push(...respawnFrame(after, victims));
    } else {
      frames.push(plainFrame(after, RESULT_MS));
    }
    return frames;
  }

  // attack (with optional reposition path)
  const from: Position = req.path.length ? req.path[req.path.length - 1] : before.players[actorId].position;
  const frames: AnimFrame[] = [];
  if (req.path.length) {
    frames.push(plainFrame(before, MOVE_STEP_MS));
    frames.push(plainFrame(movePlayer(before, actorId, req.path), MOVE_STEP_MS));
  }
  const hitTiles = computeHitTiles(before.board, req.type, from, req.target);
  const tints: RedTint[] = hitTiles.map((p, i) => ({ x: p.x, y: p.y, delayMs: i * TINT_STEP }));
  const maxTintDelay = tints.reduce((m, t) => Math.max(m, t.delayMs), 0);

  if (event.killedPlayerIds.length) {
    const victims = victimsOf(before, after, event.killedPlayerIds);
    const death: DeathAnim[] = victims.map((v) => ({ playerId: v.playerId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'out' as const }));
    frames.push({
      display: after,
      redTints: tints,
      death,
      holdMs: Math.max(maxTintDelay + TINT_FADE_MS + TINT_HOLD_MS, DEATH_OUT_MS),
    });
    frames.push(...respawnFrame(after, victims));
  } else {
    frames.push({
      display: after,
      redTints: tints,
      death: [],
      holdMs: Math.max(RESULT_MS, maxTintDelay + TINT_FADE_MS + TINT_HOLD_MS),
    });
  }
  return frames;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/online/buildOnlineFrames.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Full suite + build + lint**

Run: `npm run test && npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/online/buildOnlineFrames.ts src/online/buildOnlineFrames.test.ts
git commit -m "feat: pure online frame builder (buildOnlineFrames) with tests"
```

---

## Self-Review Notes

- **Spec coverage:** this plan delivers the spec's `animation.ts` extraction (Task 1) and the reusable frame-building the spec's `OnlineGame` needs (Task 2, as `buildOnlineFrames`). It deliberately does NOT refactor hotseat `handleConfirm` to consume `buildOnlineFrames` — the hotseat replay assembly (with its notice scheduling and per-frame `actorId` tagging) stays as-is to avoid risk; the shared PRIMITIVES are what both use. Plan 2B-2 (OnlineGame + MenuFlow wiring + pause/reconnect/end-match overlays) consumes both modules.
- **Type consistency:** `buildOnlineFrames` returns `AnimFrame[]` from `game/animation`; `RedTint`/`DeathAnim` come from `Board`; `deathPos`/`respawnPos`/`stage` match the `DeathAnim` shape used by `App.tsx` (`stage: 'out' | 'in'`). The victim death position is read from `before` (pre-death), matching hotseat.
- **Placeholder scan:** none — full code and exact commands throughout.
- **Risk:** Task 1 is a mechanical move guarded by the full suite + a manual hotseat check (no behavior change). Task 2 is new, pure, and unit-tested. Neither can regress the server/transport (Plan 2A) since they don't touch it.
