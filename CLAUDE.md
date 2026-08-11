# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server (http://localhost:5180 via .claude/launch.json; bare `vite` still defaults to 5173)
npm run build      # tsc -b (typecheck) + vite build
npm run test       # Run the full Vitest suite once
npm run lint       # oxlint
npm run preview    # Serve the production build

npx vitest run src/engine/combat.test.ts          # Run one test file
npx vitest run -t "carries an active phantom"      # Run tests matching a name
npx vitest                                          # Watch mode
```

TypeScript is strict with `verbatimModuleSyntax` and `noUnusedLocals` on: type-only imports **must** use `import type`, and unused locals fail the build. `npm run build` is the real gate — run it, not just tests.

## What this is

Scavengers is a 2-player **hotseat** (same-device) tactical game on an 11×11 grid. Players share one screen and pass the device between turns, so hidden information and turn handoff are core concerns, not afterthoughts. No backend, no routing, no server — a single Vite + React 19 SPA.

## Architecture

Two layers with a hard boundary:

### `src/engine/` — pure, immutable game logic
Every function takes a `GameState` and returns a **new** `GameState` (or `AttackResult`); nothing mutates in place and there is no React here. This is the source of truth and is exhaustively unit-tested (each `*.ts` has a sibling `*.test.ts`). All public API is re-exported through the `src/engine/index.ts` barrel — import from `./engine`, not deep paths.

Key modules:
- `types.ts` — `GameState`, `PlayerState`, `Position`, `PlayerId` (`'p1' | 'p2'`), `GameMode` (`'lastStanding' | 'deathmatch'`).
- `constants.ts` — all tunables (energy/ammo caps and costs, `MAX_MOVE_TILES`, `VISION_RADIUS`, `CORNER_ZONES`, scoring). Change balance here.
- `movement.ts` — `movePlayer(state, id, path)` (path is 1–`MAX_MOVE_TILES` absolute tiles, adjacency-checked, auto-collects pickups), `restPlayer`.
- `phantom.ts` — `fakeMove` / `clearPhantom`. A phantom is a decoy shown to the opponent; its offset **accumulates** across fake moves and **follows the player** when they actually move (see `phantomDisplayPosition`).
- `combat.ts` — `punch` / `shoot` / `bomb`, each returning `AttackResult { state, killedPlayerIds }`.
- `turns.ts` — `resolveAttack(result, attackerId)` applies kill scoring + respawn + win check; `endTurn(state, actorId, gotKill)` flips `currentTurn` **unless** `gotKill` (a kill grants an extra turn).

The two-step attack contract matters: call a combat function → pass its `AttackResult` to `resolveAttack` → then `endTurn`. `movePlayer`/`fakeMove`/`restPlayer` do **not** end the turn; the caller invokes `endTurn` separately.

### `src/` — React presentation
- `App.tsx` — the entire orchestration layer (state machine, targeting UI, animation timing). See below.
- `components/` — presentational: `Board`, `PlayerToken`, `ControlPanel`, `ResourceBars`, `Leaderboard`.
- `theme.ts` — single dark-palette design token object (`theme`) plus `SPAWN_TINT`. All colors come from here; don't hardcode hex in components.

## App.tsx: the parts that require reading multiple files

**Hidden-information model.** The board is always drawn from one perspective: `viewerId = state.currentTurn`. `Board` takes `viewerId` and enforces vision (Euclidean circle of `VISION_RADIUS`) — out-of-range enemies aren't rendered, and enemy phantoms are shown at their fake position. Never render raw hidden state.

**`state` vs `display`.** `state` is logical truth; `display` is what's on screen. They diverge during the result window and during replay so animations can play against an older frame while the truth has already advanced.

**Phase machine** (`Phase = 'playing' | 'result' | 'handoff' | 'replaying'`):
- `playing` → player builds an action via the `Flow` union (`ControlPanel.tsx`) and clicks tiles.
- `result` → after confirm, the actor sees their own updated energy/ammo (`RESULT_MS`) before anything hands off.
- `handoff` → a no-information screen (only the public leaderboard) with a "Start turn" button, so the incoming player can look before the outgoing player looks away.
- `replaying` → on Start turn, the opponent's turn(s) are re-animated from the frame the viewer last saw, then control returns.

**Replay bookkeeping lives in refs, not state** (`actorLogRef`, `turnStartRef`, `replayRef`, `timersRef`) specifically because React StrictMode double-invokes render and state updaters. Mutate refs only inside event handlers / `setTimeout` callbacks — never in a render body or a `setState` updater, or frames get duplicated. `applyResult(acted, next, turnPasses)` is the single choke point that records the frame and drives the phase transition.

**`Flow` union** (in `ControlPanel.tsx`) models the multi-step action wizards (move path, fake move, and the weapon → optional-reposition → aim attack sequence). `App.tsx` computes tile highlights and the hypothetical resource `preview` by re-running the real engine on a clone of `state` — the previews are always exact because they use the same code path as the commit.

## Testing conventions
Engine logic is tested directly against pure functions (no React Testing Library). When adding an engine feature, add its behavior to the sibling `*.test.ts` in the same TDD style as the existing tests; UI wiring in `App.tsx` is verified via `npm run build` + the suite rather than component tests.
