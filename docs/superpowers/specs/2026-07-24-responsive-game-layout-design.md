# Responsive game layout — design

**Date:** 2026-07-24
**Status:** approved design, not yet implemented

## Problem

The game has no responsive system at all. Every layout decision is an inline style with
a fixed pixel value, board size comes from hardcoded magic numbers, and `src/App.css`
(the only file with media queries) is leftover Vite template CSS that is **not imported
anywhere**. Concretely, as measured in the browser:

- At 1680×1000 the page scrolls to 1148px tall. **The confirm/action buttons sit below
  the fold on a large desktop.** For a game whose entire interaction is "tap a tile, then
  press confirm", that is a functional defect, not a cosmetic one.
- `useCellSize` sizes the board from `Math.min(window.innerWidth - 620, window.innerHeight - 140)`
  ([App.tsx:95](../../../src/App.tsx#L95)). The `620` guesses the side panels' combined width
  and the `140` ignores the resource bars and control panel stacked in the same column, so
  both terms are wrong in different directions.
- The main row is one `flexWrap` with no breakpoints, so the kills panel wraps off-screen
  unpredictably — it is already gone at 1100px wide — while large vertical dead space sits
  beside the board.
- The board's tile size is capped at 68px, so on a large display the board floats in empty
  space instead of using it.
- At phone width the board clips off the right edge.
- [OnlineGame.tsx:908](../../../src/online/OnlineGame.tsx#L908) is a **copy** of the same
  three-column layout, and [OnlineGame.tsx:73](../../../src/online/OnlineGame.tsx#L73)
  duplicates the same magic-number `useCellSize`. Every layout change currently has to be
  made twice, and the two screens will drift.

A separate leaderboard column-alignment bug was fixed first, in its own change, and is not
part of this work.

## Goals

Make the game read well and stay usable at every supported size.

**Supported sizes:** desktop/laptop (≥1200px), tablet portrait and landscape
(~768–1199px), phone (~375–430px). Ultrawide is explicitly not a target.

**Non-goals:** changing any game rule, engine behaviour, color, or animation. Rewriting
`Board`'s internal tile positioning. Supporting ultrawide displays specifically.

## Decisions

These were settled during brainstorming and are inputs, not open questions.

| Decision | Choice |
|---|---|
| Scrolling | Desktop and tablet must fit the viewport with no page scroll. Phone may scroll. |
| Collapse priority | Kills feed collapses first, then the leaderboard. Board and controls are never sacrificed. |
| Phone panels | A compact always-visible score strip; tapping it opens the full leaderboard. Kills feed behind its own button. |
| Code duplication | Extract one shared layout component used by both local and online play. |
| Large screens | Drop the tile-size cap; the board grows to fill available height. |
| Other screens | The handoff and win screens are in scope, including replacing their `transform: scale()` wrappers. |

## Approach

**CSS owns where panels go; JS owns only the board's pixel size.**

Two alternatives were rejected:

- *Pure CSS, including board sizing.* `Board` positions every tile, highlight, red tint,
  death animation and the vision-fog radial gradient with absolute pixel math derived from
  `cellPixelSize` ([Board.tsx:178](../../../src/components/Board.tsx#L178),
  [:207](../../../src/components/Board.tsx#L207)). Converting that to CSS-driven sizing
  means rewriting the fog gradient and every animation overlay — far more risk than the
  goal justifies.
- *Pure JS, with breakpoints in render code.* Lowest risk, but scatters layout rules across
  JSX and re-renders React on every resize tick.

The hybrid keeps `Board`'s pixel contract untouched while putting breakpoints somewhere
readable.

## Architecture

### `GameLayout` — new shared component

`src/components/GameLayout.tsx`. Takes the screen's regions as slots and renders them into
a CSS grid:

- `standings` — `Leaderboard` in deathmatch, `Lives` in survival. Both must work here.
- `bars` — `ResourceBars`, or the replay banner that replaces it.
- `board` — the `Board`.
- `controls` — `ControlPanel`, or its "Resolving…" / "Watch the replay" placeholders.
- `killsFeed` — the kills notification panel.

Both `App.tsx` and `OnlineGame.tsx` render through it. The responsive rules are then
written once, and the two screens cannot drift apart.

`GameLayout` owns class names only. It does not own game state, and it does not decide what
goes in a slot — the caller does. This keeps it testable by eye and free of the phase
machine.

### Layout CSS — `src/index.css`

`index.css` is the stylesheet actually imported by `main.tsx`, and currently holds only
`:root` tokens, resets, and keyframes. The layout classes go there.

`src/App.css` is dead template CSS. It should be deleted as part of this work — leaving a
file full of media queries that do nothing next to new layout CSS is a trap for the next
person who reads the repo.

Three arrangements:

| Breakpoint | Arrangement | Page scroll |
|---|---|---|
| ≥1200px | `standings + kills │ bars+board │ controls` | none, `100dvh` |
| 768–1199px | `standings + kills │ bars+board`, controls beneath the board | none, `100dvh` |
| <768px | single column: score strip → bars → board → controls | allowed |

**Amended 2026-07-24, after seeing the desktop layout live.** The original desktop
arrangement stacked the controls under the board and put the kills feed in a right-hand
column. Measured at 1440×900 that produced a *smaller* board than before the work started
— 43px tiles against the old 68px — while 173px of the centre column's width sat unused.

The cause is that the board is square and therefore height-bound, while width is abundant.
Removing the 68px cap was never the binding constraint. The old code only looked better
because it cheated: `innerHeight - 140` ignored the resource bars and the control panel
entirely, which is precisely why the confirm button fell below the fold — the defect this
work exists to fix.

Moving the controls into a right-hand column returns their height to the board, and moving
the kills feed under the standings keeps the left column doing the work it was already
doing. `controls` therefore becomes a **top-level grid area** rather than a child of the
centre column, so CSS can place it per breakpoint.

`dvh` rather than `vh`, so a mobile browser's collapsing address bar does not cut off the
controls.

**Tablet portrait is the tightest case** and the most likely reason these numbers move. At
820px wide, the standings card plus gaps leaves roughly 380px for the board column — workable
but not generous. If it reads as cramped in the browser, the honest fix is to lower the
single-column breakpoint so tablet portrait uses the phone arrangement, not to shave the
board. The 768px figure is a starting point to verify, not a constant to defend.

### Board sizing — one hook, one observer

Both copies of `useCellSize` are replaced by a single `useBoardColumn(ref)` in a shared
module. It observes the center column with a `ResizeObserver` and returns:

- `cellSize` — `Math.floor(Math.min(availW, availH) / GRID_SIZE)`, floored to an integer so
  tiles land on whole pixels and gridlines don't seam. Keeps the existing 28px floor; the
  existing 68px **cap is removed**, which is what lets the board grow on large displays.
- `columnWidth` — the measured column width in px.

`columnWidth` is needed as a number, not a percentage: `ControlPanel` scales its button
font size and padding from it
([ControlPanel.tsx:117](../../../src/components/ControlPanel.tsx#L117)), and `ResourceBars`
takes a width too.

**Amended:** once the controls move to their own column, one measurement can no longer
serve both. `columnWidth` tracks the *board's* width, which is correct for `ResourceBars`
(they sit above the board and align to its edges) but wrong for `ControlPanel` in a
separate column. The controls column is measured independently.

That column must be a **fixed** width in CSS, not `auto`. `ControlPanel` derives its own
font size and padding from the width it is handed, so an `auto` column would size to
content that is itself sized from the column — a circular dependency, and the same class
of feedback loop described below for the board.

**The feedback-loop hazard.** If the measured element is sized by its own content, the board
grows → the wrapper grows → the board grows, and the layout oscillates or runs away. The
measured wrapper must therefore get its size from the grid, never from its child: the board's
track is `minmax(0, 1fr)` and the board is centered inside a `min-height: 0` wrapper. This
is the single most likely way this work breaks, so it needs an explicit check during
implementation, not just at review.

### Phone specifics

- **`ScoreStrip`** — a new component: one line, a color dot and score per player. Shown only
  below the phone breakpoint. This is the number a deathmatch player glances at constantly,
  so it stays on screen rather than going behind a tap.
- **Overlays** — the existing [`Modal.tsx`](../../../src/components/Modal.tsx) is reused for
  the expanded leaderboard and the kills feed. No new overlay machinery.

### Handoff and win screens

Both currently wrap the standings in `transform: scale(1.35)` and `scale(1.1)`
([App.tsx:1091](../../../src/App.tsx#L1091), [:1188](../../../src/App.tsx#L1188)). Pixel
scaling magnifies any layout flaw and can push content off a narrow screen.

Replace the transforms with real sizing — the standings component renders at a genuinely
larger size rather than being scaled after layout. In a pass-the-device game the handoff
screen is shown every single turn, so it matters more on a phone than the in-game screen does.

## What is deliberately not changing

The engine, all game rules, every color in `theme.ts`, the phase machine, the replay
bookkeeping in refs, and `Board`'s internal tile positioning. This is a layout change. If
implementing it appears to require an engine or rules change, that is a signal the design is
wrong — stop and re-open the design rather than adjusting behaviour to fit.

## Verification

The engine is untouched, so the existing suite is a regression check rather than a target for
new tests. UI wiring is verified the way this repo already verifies it: `npm run build` (the
real gate — strict TypeScript with `verbatimModuleSyntax` and `noUnusedLocals`) plus
`npm run test`.

Beyond that, check in the browser at each of these, in **both** game modes, at **2 and 4**
players, and in **both** local and online play:

| Size | Represents |
|---|---|
| 1680×1000 | large desktop |
| 1440×900 | laptop |
| 1024×768 | tablet landscape |
| 820×1180 | tablet portrait |
| 390×844 | phone |

At each: the action buttons are reachable without scrolling (desktop and tablet), the board
is not clipped, no panel overflows its card, and the leaderboard's header and value columns
still align.

Screens to check, not just the in-game one: in-game, handoff, win, and replay (which
substitutes a banner for the resource bars and a placeholder for the control panel — both
slots must hold their shape when their contents change).
