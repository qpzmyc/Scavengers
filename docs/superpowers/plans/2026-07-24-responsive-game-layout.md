# Responsive Game Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Scavengers lay out correctly at desktop, tablet and phone sizes, with the action controls always reachable, driven by one shared layout component instead of two copies.

**Architecture:** CSS grid areas in `src/index.css` decide *where* panels go at three breakpoints. A single `ResizeObserver` hook decides *only* the board's integer pixel cell size. A new `GameLayout` component holds the slots and is used by both local play (`App.tsx`) and online play (`OnlineGame.tsx`), so the rules are written once.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`, `noUnusedLocals`), Vite 8, Vitest 4 (node environment), plain CSS.

**Design spec:** [docs/superpowers/specs/2026-07-24-responsive-game-layout-design.md](../specs/2026-07-24-responsive-game-layout-design.md)

## Global Constraints

- **`npm run build` is the real gate**, not just the test suite. It runs `tsc -b` with strict mode, `verbatimModuleSyntax` (type-only imports **must** use `import type`) and `noUnusedLocals` (an unused local fails the build).
- **No engine changes.** Nothing under `src/engine/` is touched by any task in this plan. If a task appears to need one, stop and re-open the design.
- **No colour changes.** All colours come from `theme.ts`; never hardcode a hex in a component.
- **No behaviour changes.** No game rule, cost, score, animation timing, or phase-machine change. This is layout only.
- **Breakpoints:** phone `< 768px`, tablet `768–1199px`, desktop `≥ 1200px`. The 768px figure is a starting point to verify in Task 9, not a constant to defend — see the spec's tablet-portrait note.
- **`dvh` not `vh`** for full-height layout, so a mobile address bar cannot cut off the controls.
- **Board cell size:** floor to an integer, minimum 28px, **no maximum** (the old 68px cap is removed).
- **Collapse priority:** kills feed collapses first, then standings. Board and controls are never sacrificed.
- **No DOM tests.** The project has no jsdom and no testing-library, and `CLAUDE.md` states UI wiring is verified via `npm run build` + the suite rather than component tests. Only pure functions get unit tests here.

## File Structure

| Path | Responsibility |
|---|---|
| `src/layout/boardSize.ts` | **Create.** Pure `boardCellSize(availW, availH)` math. No React, no DOM. |
| `src/layout/boardSize.test.ts` | **Create.** Unit tests for the above. |
| `src/layout/useBoardColumn.ts` | **Create.** `ResizeObserver` hook returning `{ cellSize, columnWidth }`. |
| `src/components/GameLayout.tsx` | **Create.** Slot-based layout shell. Class names only, no game state. |
| `src/components/ScoreStrip.tsx` | **Create.** One-line phone score strip. |
| `src/index.css` | **Modify.** Add the `.game-layout` grid + three breakpoints. |
| `src/App.css` | **Delete.** Dead Vite template CSS, imported nowhere. |
| `src/App.tsx` | **Modify.** In-game, handoff and win screens render through `GameLayout`; local `useCellSize` removed. |
| `src/online/OnlineGame.tsx` | **Modify.** Same wiring; duplicate `useCellSize` removed. |

---

### Task 1: Pure board-sizing math

The only genuinely unit-testable piece. Isolating it means the sizing rules are pinned by tests even though the hook that calls it can't be.

**Files:**
- Create: `src/layout/boardSize.ts`
- Test: `src/layout/boardSize.test.ts`

**Interfaces:**
- Consumes: `GRID_SIZE` from `../engine` (already exported through the barrel).
- Produces: `boardCellSize(availW: number, availH: number): number` and `MIN_CELL_PX: number`.

- [ ] **Step 1: Write the failing test**

Create `src/layout/boardSize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { boardCellSize, MIN_CELL_PX } from './boardSize';
import { GRID_SIZE } from '../engine';

describe('boardCellSize', () => {
  it('divides the limiting dimension by the grid size', () => {
    // 660 / 11 = 60 exactly, and height is not the constraint.
    expect(boardCellSize(660, 900)).toBe(60);
  });

  it('is limited by height when height is smaller', () => {
    expect(boardCellSize(900, 660)).toBe(60);
  });

  it('floors to a whole pixel so gridlines do not seam', () => {
    // 665 / 11 = 60.45...
    expect(boardCellSize(665, 900)).toBe(60);
  });

  it('has no upper cap, so large displays get a bigger board', () => {
    // The old implementation capped this at 68.
    expect(boardCellSize(1650, 1650)).toBeGreaterThan(68);
    expect(boardCellSize(1650, 1650)).toBe(150);
  });

  it('never returns less than the minimum, even in a tiny space', () => {
    expect(boardCellSize(100, 100)).toBe(MIN_CELL_PX);
  });

  it('returns the minimum for zero or negative space, rather than 0 or NaN', () => {
    // A ResizeObserver fires once with 0x0 before first layout.
    expect(boardCellSize(0, 0)).toBe(MIN_CELL_PX);
    expect(boardCellSize(-50, 400)).toBe(MIN_CELL_PX);
  });

  it('scales with GRID_SIZE rather than assuming 11', () => {
    expect(boardCellSize(GRID_SIZE * 40, GRID_SIZE * 40)).toBe(40);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/layout/boardSize.test.ts
```

Expected: FAIL — cannot resolve `./boardSize`.

- [ ] **Step 3: Write the implementation**

Create `src/layout/boardSize.ts`:

```ts
import { GRID_SIZE } from '../engine';

// Below this the tiles stop being tappable, so the board is allowed to overflow
// its container instead of shrinking further.
export const MIN_CELL_PX = 28;

/**
 * The pixel size of one board tile, given the space the board has to work with.
 *
 * Floored to a whole pixel: fractional tile sizes make the 1px gridlines land on
 * half-pixels and seam visibly. Deliberately has no upper bound — the previous
 * implementation capped this at 68px, which left large displays with a small
 * board floating in empty space.
 */
export function boardCellSize(availW: number, availH: number): number {
  const limiting = Math.min(availW, availH);
  if (!Number.isFinite(limiting) || limiting <= 0) return MIN_CELL_PX;
  return Math.max(MIN_CELL_PX, Math.floor(limiting / GRID_SIZE));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/layout/boardSize.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full gate**

```bash
npm run build && npm run test
```

Expected: build succeeds; 193 tests pass (186 existing + 7 new).

- [ ] **Step 6: Commit**

```bash
git add src/layout/boardSize.ts src/layout/boardSize.test.ts
git commit -m "feat: pure board cell-size math with no upper cap"
```

---

### Task 2: The measurement hook

**Files:**
- Create: `src/layout/useBoardColumn.ts`

**Interfaces:**
- Consumes: `boardCellSize`, `MIN_CELL_PX` from `./boardSize`.
- Produces: `useBoardColumn(): { ref, cellSize, columnWidth }` where `ref` is a `RefObject<HTMLDivElement | null>` to attach to the measured wrapper, `cellSize: number`, `columnWidth: number`.

`columnWidth` exists because `ControlPanel` scales its button font size and padding from a numeric width ([ControlPanel.tsx:117](../../../src/components/ControlPanel.tsx#L117)) and `ResourceBars` takes a numeric width — neither can consume a percentage. One measurement, two consumers.

No unit test: this needs a real DOM and the project has no jsdom. It is verified by `npm run build` here and in the browser from Task 5 onward.

- [ ] **Step 1: Write the implementation**

Create `src/layout/useBoardColumn.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { boardCellSize, MIN_CELL_PX } from './boardSize';

/**
 * Measures the board's wrapper and derives the board's tile size from it.
 *
 * IMPORTANT: the observed element must get its size from the layout around it,
 * never from the board inside it. If the wrapper sizes to its content then the
 * board grows the wrapper, which grows the board, and the layout oscillates or
 * runs away. The CSS in index.css guarantees this — `.game-layout__board` is a
 * flex child with `min-height: 0` inside a definite-height column (desktop and
 * tablet) or a square driven by `aspect-ratio` (phone). Do not give it
 * height:auto with content-driven sizing.
 */
export function useBoardColumn() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ cellSize: MIN_CELL_PX, columnWidth: 320 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      const next = {
        cellSize: boardCellSize(box.width, box.height),
        columnWidth: Math.max(320, Math.round(box.width)),
      };
      // Bail out when nothing changed: ResizeObserver fires on sub-pixel jitter
      // and an unconditional setState would re-render the whole game every tick.
      setSize((prev) =>
        prev.cellSize === next.cellSize && prev.columnWidth === next.columnWidth ? prev : next
      );
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: build succeeds. (`noUnusedLocals` will fail this if anything is left dangling.)

- [ ] **Step 3: Commit**

```bash
git add src/layout/useBoardColumn.ts
git commit -m "feat: ResizeObserver hook for board column sizing"
```

---

### Task 3: Layout CSS, and remove the dead stylesheet

**Files:**
- Modify: `src/index.css` (append; leave `:root`, the resets and every `@keyframes` untouched)
- Delete: `src/App.css`

`src/App.css` is leftover Vite template CSS imported nowhere — verify with `grep -rn "App.css" src/` before deleting, which should return nothing. Leaving a file full of media queries that do nothing, next to new layout CSS that does, misleads the next reader.

- [ ] **Step 1: Confirm App.css really is dead**

```bash
grep -rn "App.css" src/ index.html
```

Expected: no output. If anything is returned, stop — the file is live and the design's assumption was wrong.

- [ ] **Step 2: Append the layout CSS to `src/index.css`**

```css
/* ---- Game layout --------------------------------------------------------
   CSS owns WHERE the panels go; JS owns only the board's pixel cell size
   (src/layout/useBoardColumn.ts). Three arrangements:

     >= 1200px   standings | bars+board+controls | kills      no page scroll
     768-1199px  standings | bars+board+controls,             no page scroll
                 kills beneath standings
     < 768px     single column, score strip replaces the       scrolls
                 panels, which move into modals

   Collapse priority is kills first, then standings; the board and the action
   controls are never sacrificed. */

.game-layout {
  display: grid;
  gap: 24px;
  padding: 24px;
  height: 100dvh;
  overflow: hidden;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    'title title  title'
    'stand center kills';
}

.game-layout__title { grid-area: title; }
.game-layout__standings { grid-area: stand; }
.game-layout__kills { grid-area: kills; }
.game-layout__strip { display: none; }

.game-layout__center {
  grid-area: center;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* The measured element. It takes its size from the flex column above it and
   never from the board inside it — see the warning in useBoardColumn.ts. */
.game-layout__board {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 1199px) {
  .game-layout {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    grid-template-areas:
      'title title'
      'stand center'
      'kills center';
  }
}

@media (max-width: 767px) {
  .game-layout {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
    gap: 16px;
    padding: 16px;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    grid-template-areas:
      'title'
      'strip'
      'center';
  }

  .game-layout__standings,
  .game-layout__kills {
    display: none;
  }

  .game-layout__strip {
    grid-area: strip;
    display: block;
  }

  /* A square driven by its own width, so it stays a definite size the board
     cannot feed back into. */
  .game-layout__board {
    flex: none;
    aspect-ratio: 1;
    height: auto;
  }
}
```

- [ ] **Step 3: Delete the dead stylesheet**

```bash
git rm src/App.css
```

- [ ] **Step 4: Verify the build still passes**

```bash
npm run build && npm run test
```

Expected: build succeeds, 193 tests pass. Nothing renders differently yet — no component uses these classes until Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat: responsive game layout CSS; remove dead App.css"
```

---

### Task 4: The `GameLayout` shell

**Files:**
- Create: `src/components/GameLayout.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (the hook is attached by the *caller*, which owns the ref).
- Produces: `GameLayout` with props `{ title, standings, scoreStrip, bars, board, boardRef, controls, killsFeed }`, all `ReactNode` except `boardRef: Ref<HTMLDivElement>`.

`GameLayout` owns class names and slot placement only — no game state, no phase machine, no decision about *what* goes in a slot. That keeps it readable at a glance and reusable by both local and online play.

- [ ] **Step 1: Write the component**

Create `src/components/GameLayout.tsx`:

```tsx
import type { ReactNode, Ref } from 'react';

interface GameLayoutProps {
  title: ReactNode;
  /** Leaderboard (deathmatch) or Lives (survival). Hidden under the phone breakpoint. */
  standings: ReactNode;
  /** Compact per-player score line. Shown only under the phone breakpoint. */
  scoreStrip: ReactNode;
  /** ResourceBars, or the replay banner that replaces it. */
  bars: ReactNode;
  board: ReactNode;
  /** Attach the ref from useBoardColumn — this wrapper is the measured element. */
  boardRef: Ref<HTMLDivElement>;
  /** ControlPanel, or its "Resolving…" / replay placeholder. */
  controls: ReactNode;
  /** Kills notification panel. Hidden under the phone breakpoint. */
  killsFeed: ReactNode;
}

export function GameLayout({
  title,
  standings,
  scoreStrip,
  bars,
  board,
  boardRef,
  controls,
  killsFeed,
}: GameLayoutProps) {
  return (
    <div className="game-layout">
      <div className="game-layout__title">{title}</div>
      <div className="game-layout__standings">{standings}</div>
      <div className="game-layout__strip">{scoreStrip}</div>
      <div className="game-layout__center">
        {bars}
        <div className="game-layout__board" ref={boardRef}>
          {board}
        </div>
        {controls}
      </div>
      <div className="game-layout__kills">{killsFeed}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/GameLayout.tsx
git commit -m "feat: slot-based GameLayout shell"
```

---

### Task 5: Wire the local in-game screen through `GameLayout`

The first task with a visible result. After this, the desktop and tablet arrangements are real and the board grows on large screens.

**Files:**
- Modify: `src/App.tsx` — delete `useCellSize` (lines 93–103), change `const cellSize = useCellSize()` (line 122), replace the layout JSX (lines 1211–1313)

**Interfaces:**
- Consumes: `useBoardColumn` from `../layout/useBoardColumn`, `GameLayout` from `./components/GameLayout`.
- Produces: nothing new.

- [ ] **Step 1: Delete the old sizing hook**

Remove the whole `useCellSize` function from `src/App.tsx` (lines 93–103), including its `window.addEventListener('resize', ...)` effect. `noUnusedLocals` will catch it if any part is left behind.

- [ ] **Step 2: Swap in the new hook**

Replace line 122:

```tsx
const cellSize = useCellSize();
```

with:

```tsx
const { ref: boardRef, cellSize, columnWidth } = useBoardColumn();
```

and add the import at the top:

```tsx
import { useBoardColumn } from './layout/useBoardColumn';
import { GameLayout } from './components/GameLayout';
```

- [ ] **Step 3: Delete the now-derived width locals**

Remove lines 1006–1007:

```tsx
const boardWidth = GRID_SIZE * cellSize + 12;
const columnWidth = Math.max(boardWidth, 320);
```

`columnWidth` now comes from the hook. If `GRID_SIZE` becomes unused in `App.tsx` as a result, remove it from the import — `noUnusedLocals` will fail the build otherwise.

- [ ] **Step 4: Replace the layout JSX**

Replace everything from the title row (line 1211) through the closing of the kills panel (line 1312) with:

```tsx
<GameLayout
  boardRef={boardRef}
  title={
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <h1 style={{ fontSize: 26 }}>Scavengers</h1>
      <span style={{ color: theme.textMuted, fontSize: 13 }}>
        {mode === 'lastStanding' ? 'Survival' : 'Deathmatch'}
      </span>
    </div>
  }
  standings={state.mode === 'lastStanding' ? <Lives state={state} /> : <Leaderboard state={state} />}
  scoreStrip={null}
  bars={
    phase === 'replaying' ? (
      <div style={{ width: columnWidth, boxSizing: 'border-box', padding: '12px 16px', borderRadius: theme.radius, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.textMuted, textAlign: 'center' }}>
        {(() => {
          if (!replayActorId) return 'Replaying…';
          const label = state.players[replayActorId].color.toUpperCase();
          return <>Replaying {renderColoredText(label, colorSet)}'s turn…</>;
        })()}
      </div>
    ) : (
      <ResourceBars player={barsPlayer} width={columnWidth} preview={preview} />
    )
  }
  board={
    <Board
      state={boardState}
      viewerId={viewerId}
      cellPixelSize={cellSize}
      highlights={interactive ? dedupedHighlights : []}
      onTileClick={interactive ? handleTileClick : undefined}
      redTints={redTints}
      deathAnims={deathAnims}
      previewTints={interactive ? previewHitTiles : []}
      attackPreparing={
        interactive &&
        (flow.kind === 'attackReposition' || flow.kind === 'attackSelect' || flow.kind === 'attackTarget')
      }
      visionCenter={interactive ? me.position : undefined}
    />
  }
  controls={
    <div style={{ ...card, width: columnWidth, boxSizing: 'border-box' }}>
      {phase === 'result' ? (
        <div style={{ padding: 16, color: theme.textMuted, fontStyle: 'italic' }}>Resolving…</div>
      ) : phase === 'replaying' ? (
        <div style={{ padding: 16, color: theme.textMuted, fontStyle: 'italic' }}>Watch the replay, then it's your move.</div>
      ) : (
        <ControlPanel
          flow={flow}
          gameOver={gameOver}
          can={can}
          confirmEnabled={confirmEnabled}
          onSelectAction={handleSelectAction}
          onSelectAttackType={handleSelectAttackType}
          onNext={handleNext}
          onConfirm={handleConfirm}
          onBack={handleBack}
          onCancel={handleCancel}
          width={columnWidth}
          maxMoveTiles={maxMoveTiles}
        />
      )}
    </div>
  }
  killsFeed={
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, boxShadow: theme.shadow, padding: 16, minWidth: 240, boxSizing: 'border-box' }}>
      <h3 style={{ marginBottom: 10, fontSize: 15 }}>Kills</h3>
      {notifications.length === 0 ? (
        <div style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic' }}>No kills yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map((n) => (
            <div key={n.id} style={{ fontSize: 14, fontWeight: 600, color: theme.heading, animation: 'notificationIn 0.25s ease' }}>
              <span style={{ color: n.killerColor }}>{n.killerName.toUpperCase()}</span>
              {` ${n.verb} `}
              <span style={{ color: n.victimColor }}>{n.victimName.toUpperCase()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  }
/>
```

The outer wrapper on line 1147 (`<div style={{ minHeight: '100vh', padding: 24, boxSizing: 'border-box' }}>`) loses its `padding: 24` and `minHeight` — `GameLayout` owns both now. Keep the wrapper for `menuChrome`, `noticeStack` and the game-over overlay, but reduce it to `<div>`.

- [ ] **Step 5: Verify the build and suite**

```bash
npm run build && npm run test
```

Expected: build succeeds, 193 tests pass.

- [ ] **Step 6: Verify in the browser — this is the task's real test**

Start the dev server (`.claude/launch.json` config `scavengers-dev`), start a 4-player deathmatch, and check at **1680×1000**:

- The action buttons are visible without scrolling. Confirm with `document.documentElement.scrollHeight <= window.innerHeight`.
- The board is visibly larger than before (tile size above the old 68px cap). Confirm the rendered board element's width is greater than `11 * 68 + 12 = 760`.
- Then check **1024×768**: the kills panel has moved beneath the standings, and there is still no page scroll.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: render local game through GameLayout with measured board sizing"
```

---

### Task 6: Phone arrangement — score strip and modal panels

**Files:**
- Create: `src/components/ScoreStrip.tsx`
- Modify: `src/App.tsx` (pass `scoreStrip`, add the two modals)

**Interfaces:**
- Consumes: `GameState` from `../engine`; `theme` from `../theme`; `Modal` from `./Modal`.
- Produces: `ScoreStrip` with props `{ state: GameState; onOpenStandings: () => void; onOpenKills: () => void; killCount: number }`.

`displayName` matches the existing `Leaderboard` convention — online play passes a custom name resolver, hotseat omits it and falls back to the colour. The strip itself shows only a colour dot and a number, so it does not read `displayName`; the prop exists because the strip and the standings modal are configured together and the modal does need it.

**Survival has no `lives` field.** `PlayerState` has `score`, `deaths` and `eliminated` but not `lives` — remaining lives are derived as `state.deathCap - p.deaths`, exactly as [Lives.tsx:28](../../../src/components/Lives.tsx#L28) does it. The code below uses that derivation; do not invent a `lives` field.

Since the strip does not use `displayName`, drop it from the props rather than accepting an unused one — `noUnusedLocals` does not flag unused props, but an unused prop is a lie about the interface. Final props: `{ state, onOpenStandings, onOpenKills, killCount }`.

- [ ] **Step 1: Write the component**

Create `src/components/ScoreStrip.tsx`:

```tsx
import type { GameState } from '../engine';
import { theme } from '../theme';

interface ScoreStripProps {
  state: GameState;
  onOpenStandings: () => void;
  onOpenKills: () => void;
  killCount: number;
}

/**
 * Phone-only summary line. In deathmatch the score is the number a player
 * glances at constantly, so it stays on screen rather than going behind a tap;
 * the full standings and the kills feed open as modals.
 */
export function ScoreStrip({ state, onOpenStandings, onOpenKills, killCount }: ScoreStripProps) {
  const showScore = state.mode === 'deathmatch';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, padding: '8px 10px' }}>
      <button
        onClick={onOpenStandings}
        aria-label="Open standings"
        style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, overflowX: 'auto', background: 'none', border: 'none', padding: 0 }}
      >
        {state.turnOrder.map((id) => {
          const p = state.players[id];
          return (
            <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: p.eliminated ? 0.4 : 1 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
              <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: theme.text }}>
                {showScore ? p.score : Math.max(0, state.deathCap - p.deaths)}
              </span>
            </span>
          );
        })}
      </button>
      <button onClick={onOpenKills} aria-label="Open kills feed" style={{ flexShrink: 0, fontSize: 12, padding: '4px 10px' }}>
        Kills {killCount > 0 ? killCount : ''}
      </button>
    </div>
  );
}
```

Before writing this, confirm the survival-mode field name: run `grep -n "lives" src/engine/types.ts`. If `PlayerState` does not have a `lives` field, use whatever field `Lives.tsx` reads instead — do not invent one.

- [ ] **Step 2: Add the modal state to `App.tsx`**

Next to the other `useState` calls:

```tsx
const [phonePanel, setPhonePanel] = useState<'standings' | 'kills' | null>(null);
```

- [ ] **Step 3: Pass the strip into `GameLayout`**

Replace `scoreStrip={null}` from Task 5 with:

```tsx
scoreStrip={
  <ScoreStrip
    state={state}
    onOpenStandings={() => setPhonePanel('standings')}
    onOpenKills={() => setPhonePanel('kills')}
    killCount={notifications.length}
  />
}
```

- [ ] **Step 4: Extract the kills markup so the panel and the modal share it**

The kills list is now needed in two places. Extract it to a local just above the `return`, and change the `killsFeed` slot from Task 5 to use it rather than repeating the markup:

```tsx
const killsList =
  notifications.length === 0 ? (
    <div style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic' }}>No kills yet</div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {notifications.map((n) => (
        <div key={n.id} style={{ fontSize: 14, fontWeight: 600, color: theme.heading, animation: 'notificationIn 0.25s ease' }}>
          <span style={{ color: n.killerColor }}>{n.killerName.toUpperCase()}</span>
          {` ${n.verb} `}
          <span style={{ color: n.victimColor }}>{n.victimName.toUpperCase()}</span>
        </div>
      ))}
    </div>
  );
```

The `killsFeed` slot becomes:

```tsx
killsFeed={
  <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, boxShadow: theme.shadow, padding: 16, minWidth: 240, boxSizing: 'border-box' }}>
    <h3 style={{ marginBottom: 10, fontSize: 15 }}>Kills</h3>
    {killsList}
  </div>
}
```

- [ ] **Step 5: Render the modals**

Immediately after the `</GameLayout>` closing tag, inside the same wrapper div:

```tsx
{phonePanel === 'standings' && (
  <Modal title="Standings" onClose={() => setPhonePanel(null)}>
    {state.mode === 'lastStanding' ? <Lives state={state} /> : <Leaderboard state={state} />}
  </Modal>
)}
{phonePanel === 'kills' && (
  <Modal title="Kills" onClose={() => setPhonePanel(null)}>{killsList}</Modal>
)}
```

`Modal` has `minWidth: 360`, which overflows a 375px phone once its 32px padding is counted. Change `minWidth: 360` to `minWidth: 'min(360px, 100%)'` and add `maxWidth: 'calc(100vw - 32px)'` in `src/components/Modal.tsx`. This affects every existing modal, so re-check the pause/confirm dialogs in Task 9.

- [ ] **Step 6: Verify build and suite**

```bash
npm run build && npm run test
```

Expected: build succeeds, 193 tests pass.

- [ ] **Step 7: Verify in the browser at 390×844**

- The score strip is visible above the board and shows one dot + number per player.
- The board is not clipped at the right edge.
- Tapping the strip opens the standings modal; it fits within the viewport width.
- Tapping "Kills" opens the kills modal.
- The standings card and kills panel are **not** also rendered inline.

- [ ] **Step 8: Commit**

```bash
git add src/components/ScoreStrip.tsx src/components/Modal.tsx src/App.tsx
git commit -m "feat: phone score strip with modal standings and kills feed"
```

---

### Task 7: Wire online play through `GameLayout`

Mechanically the same as Task 5, against the copy in `OnlineGame.tsx`. Doing it removes the duplication that motivated the shared component.

**Files:**
- Modify: `src/online/OnlineGame.tsx` — delete `useCellSize` (lines 73–83ish), replace `const cellSize = useCellSize()` (line 107), delete `boardWidth`/`columnWidth` (lines 687–688), replace the layout JSX (line 908 onward)

**Interfaces:**
- Consumes: `useBoardColumn`, `GameLayout`, `ScoreStrip` — same signatures as Tasks 2, 4 and 6.
- Produces: nothing new.

- [ ] **Step 1: Delete the duplicate sizing hook**

Remove the `useCellSize` function from `src/online/OnlineGame.tsx`. Confirm afterwards that no copy remains anywhere:

```bash
grep -rn "useCellSize\|innerWidth - 620" src/
```

Expected: no output. Both copies of the magic-number heuristic are now gone.

- [ ] **Step 2: Swap in the hook and delete the derived widths**

```tsx
const { ref: boardRef, cellSize, columnWidth } = useBoardColumn();
```

and delete:

```tsx
const boardWidth = GRID_SIZE * cellSize + 12;
const columnWidth = Math.max(boardWidth, 320);
```

- [ ] **Step 3: Replace the layout JSX**

Replace the wrapper at line 908 and everything it contains (through the end of the kills panel) with the following. Online play differs from local play in four ways that must be preserved exactly: `standings` and `bars` pass `displayName`; `bars` passes `showTurnLabel`; `controls` branches on `revealing` / `statusText` rather than `phase`; and the kills feed uses `describe()` with a self-kill check rather than the stored killer/victim names.

```tsx
<GameLayout
  boardRef={boardRef}
  title={titleRow}
  standings={
    state.mode === 'lastStanding'
      ? <Lives state={state} displayName={nameFor} />
      : <Leaderboard state={state} displayName={nameFor} />
  }
  scoreStrip={
    <ScoreStrip
      state={state}
      onOpenStandings={() => setPhonePanel('standings')}
      onOpenKills={() => setPhonePanel('kills')}
      killCount={notifications.length}
    />
  }
  bars={
    <ResourceBars
      player={me}
      width={columnWidth}
      preview={preview}
      showTurnLabel={myTurn && !animating && !revealing}
      displayName={nameFor(viewerId)}
    />
  }
  board={
    <Board
      state={boardState}
      viewerId={viewerId}
      cellPixelSize={cellSize}
      highlights={interactive ? dedupedHighlights : []}
      onTileClick={interactive ? handleTileClick : undefined}
      redTints={redTints}
      deathAnims={deathAnims}
      previewTints={interactive ? previewHitTiles : []}
      attackPreparing={
        interactive &&
        (flow.kind === 'attackReposition' || flow.kind === 'attackSelect' || flow.kind === 'attackTarget')
      }
      visionCenter={interactive ? me.position : undefined}
    />
  }
  controls={
    <div style={{ ...card, width: columnWidth, boxSizing: 'border-box' }}>
      {revealing ? (
        <div style={{ padding: 16, color: theme.textMuted, fontStyle: 'italic' }}>Choosing first turn…</div>
      ) : statusText ? (
        <div style={{ padding: 16, color: theme.textMuted, fontStyle: 'italic' }}>{statusText}</div>
      ) : (
        <ControlPanel
          flow={flow}
          gameOver={gameOver}
          can={can}
          confirmEnabled={confirmEnabled}
          onSelectAction={handleSelectAction}
          onSelectAttackType={handleSelectAttackType}
          onNext={handleNext}
          onConfirm={handleConfirm}
          onBack={handleBack}
          onCancel={handleCancel}
          width={columnWidth}
          maxMoveTiles={maxMoveTiles}
        />
      )}
    </div>
  }
  killsFeed={killsPanel}
/>
```

Extract the title row and the kills panel into locals just above the `return`, so the slot list stays readable and the kills markup can be reused by the phone modal without being duplicated:

```tsx
const titleRow = (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
    <h1 style={{ fontSize: 26 }}>Scavengers</h1>
    <span style={{ color: theme.textMuted, fontSize: 13 }}>
      {state.mode === 'lastStanding' ? 'Survival' : 'Deathmatch'}
    </span>
  </div>
);

const killsList =
  notifications.length === 0 ? (
    <div style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic' }}>No kills yet</div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {notifications.map((n) => {
        const selfKill = n.killerId === n.victimId;
        return (
          <div key={n.id} style={{ fontSize: 14, fontWeight: 600, color: theme.heading, animation: 'notificationIn 0.25s ease' }}>
            <span style={{ color: state.players[n.killerId].color }}>{describe(n.killerId, true)}</span>
            {` ${n.verb} `}
            {!selfKill && (
              <span style={{ color: state.players[n.victimId].color }}>{describe(n.victimId, false)}</span>
            )}
          </div>
        );
      })}
    </div>
  );

const killsPanel = (
  <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, boxShadow: theme.shadow, padding: 16, minWidth: 240, boxSizing: 'border-box' }}>
    <h3 style={{ marginBottom: 10, fontSize: 15 }}>Kills</h3>
    {killsList}
  </div>
);
```

**Read the existing kills markup at [OnlineGame.tsx:967-990](../../../src/online/OnlineGame.tsx#L967) before writing `killsList`** and copy its exact self-kill wording. The version above reflects lines 967–984; if the tail of that block differs, the existing code wins — this task must not change what the feed says, only where it is rendered.

- [ ] **Step 3b: Add the phone modal state and modals**

Same as Task 6 Steps 2 and 4, but with `displayName={nameFor}` on the standings inside the modal, and `{killsList}` as the kills modal body:

```tsx
const [phonePanel, setPhonePanel] = useState<'standings' | 'kills' | null>(null);
```

```tsx
{phonePanel === 'standings' && (
  <Modal title="Standings" onClose={() => setPhonePanel(null)}>
    {state.mode === 'lastStanding'
      ? <Lives state={state} displayName={nameFor} />
      : <Leaderboard state={state} displayName={nameFor} />}
  </Modal>
)}
{phonePanel === 'kills' && (
  <Modal title="Kills" onClose={() => setPhonePanel(null)}>{killsList}</Modal>
)}
```

- [ ] **Step 4: Verify build and suite**

```bash
npm run build && npm run test
```

Expected: build succeeds, 193 tests pass.

- [ ] **Step 5: Verify in the browser**

Online play needs the game server as well as the frontend — start both `scavengers-dev` and `scavengers-server` from `.claude/launch.json`. Create a room, join it from a second tab, and confirm at 1440×900 and 390×844 that the layout matches local play and that names (not colours) still appear in the standings.

- [ ] **Step 6: Commit**

```bash
git add src/online/OnlineGame.tsx
git commit -m "feat: render online game through the shared GameLayout"
```

---

### Task 8: Handoff and win screens

Both wrap the standings in `transform: scale()` — `1.35` at [App.tsx:1091](../../../src/App.tsx#L1091) and `1.1` at [:1188](../../../src/App.tsx#L1188). Pixel-scaling magnifies any layout flaw and can push content off a narrow screen. In a pass-the-device game the handoff screen is shown every single turn, so on a phone it matters more than the in-game screen.

**Files:**
- Modify: `src/App.tsx` (handoff screen ~1067–1111, win overlay ~1150–1210)
- Modify: `src/online/OnlineGame.tsx` (the equivalent screens)

**Interfaces:**
- Consumes: `Leaderboard` and `Lives` as they already are.
- Produces: nothing new.

- [ ] **Step 1: Remove the scale wrappers**

Delete both `transform: scale(...)` / `transformOrigin` wrappers and let the standings render at its natural size. Replace the wrapper div at line 1091 with a plain `<div style={{ marginTop: 10, marginBottom: 96 }}>` and the one at line 1188 with `<div>`.

The standings card is now much narrower than before (the Leaderboard fix reduced its metric columns from ~100px each to 68px), so it no longer needs to be scaled down from an oversized natural width.

- [ ] **Step 2: Make both screens fit small viewports**

Both screens use `minHeight: '100vh'` with `justifyContent: 'center'`. Change `100vh` to `100dvh` in both, and add `overflowY: 'auto'` so a 4-player standings card plus heading and button can still be reached on a short phone viewport in landscape.

- [ ] **Step 3: Verify build and suite**

```bash
npm run build && npm run test
```

Expected: build succeeds, 193 tests pass.

- [ ] **Step 4: Verify in the browser**

- Handoff screen at 390×844 and at 1440×900: standings fully visible, "Start turn" reachable, leaderboard columns aligned.
- Handoff at 844×390 (phone landscape): content is reachable by scrolling and nothing is cut off.
- Win screen: play a short deathmatch to a low target score, or temporarily lower `targetScore` in the menu, and check the same sizes.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/online/OnlineGame.tsx
git commit -m "feat: responsive handoff and win screens without transform scaling"
```

---

### Task 9: Full verification sweep

The plan's acceptance gate. Nothing here should require code changes — if it does, that is a finding worth its own commit.

**Files:**
- Modify: only as needed to fix what this sweep finds.

- [ ] **Step 1: Run the automated gate**

```bash
npm run build && npm run test && npm run lint
```

Expected: build succeeds, 193 tests pass, oxlint clean.

- [ ] **Step 2: Sweep the matrix**

At each size below, in **both** modes (survival and deathmatch), at **2 and 4** players, in **both** local and online play, on the in-game, handoff, win and replay screens:

| Size | Represents |
|---|---|
| 1680×1000 | large desktop |
| 1440×900 | laptop |
| 1024×768 | tablet landscape |
| 820×1180 | tablet portrait |
| 390×844 | phone |

Check at each: action buttons reachable without scrolling (desktop and tablet only), board not clipped, no panel overflowing its card, leaderboard header and value columns still aligned, and the pause/confirm dialogs still fit after the `Modal` change in Task 6.

- [ ] **Step 3: Resolve the tablet-portrait question**

At 820×1180 the two-column arrangement leaves roughly 380px for the board column. If that reads as cramped, lower the single-column breakpoint so tablet portrait uses the phone arrangement — change `max-width: 767px` to `max-width: 900px` in `src/index.css` and re-check. Do **not** shrink the board to make two columns fit. Record which way it went.

- [ ] **Step 4: Confirm no feedback loop**

With the browser at 1680×1000, resize slowly down to 900px wide and watch for the board oscillating or growing without bound. Then check the console is free of `ResizeObserver loop completed with undelivered notifications` warnings — that error is the specific symptom of the hazard called out in the spec.

- [ ] **Step 5: Commit any fixes and update the spec**

```bash
git add -A
git commit -m "fix: address responsive layout sweep findings"
```

If the tablet breakpoint moved in Step 3, update the breakpoint line in the design spec so the document matches the code.

---

## Notes for the implementer

- **The feedback loop is the thing most likely to bite.** Every rule about `minmax(0, 1fr)`, `min-height: 0` and `aspect-ratio` in Task 3 exists to keep the measured wrapper's size independent of the board inside it. If you change that CSS, re-read the warning comment in `useBoardColumn.ts` first.
- **`npm run test` alone will not catch a layout regression.** Only Task 1 is covered by unit tests. Tasks 5 through 9 are verified in the browser, and skipping that verification means shipping unverified.
- **Uncommitted work exists at plan start:** the leaderboard column-alignment fix in `src/components/Leaderboard.tsx`. Commit it before Task 1 so the layout work starts from a clean tree.
