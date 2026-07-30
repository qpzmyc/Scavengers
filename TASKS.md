# TASKS

Working task list for Scavengers. Kept in sync by the `update-tasks` skill;
`## Small Changes` is also read and written by `quick-tweaks`.

## In Progress

_Nothing in flight — `feat/phantom-destroyer-move-ux-fixes` merged to `main` 2026-07-30._

## Small Changes

_Empty._

## Backlog / Ideas

- **Deduplicate the layout hooks.** `useBoardColumn` and `useElementWidth`
  (`src/layout/`) are roughly 85% the same code. Collapse into one hook.
  Refactor only, no behavior change; the existing suite guards it.
- **Deduplicate the game shell wrappers.** The kills feed and the controls
  wrapper are written twice, once in `src/App.tsx` and once in
  `src/online/OnlineGame.tsx`. Both already render through `GameLayout`, so
  the shared pieces can move up.
- **Stop the board resizing between phases.** At 1440×900 the board measures
  ~716px during replay and ~660px during play, so it visibly jumps on phase
  change. Needs the sizing input to be phase-independent.

## Deferred / Needs Planning

- **Server-side action validation.** `src/online/actionReducer.ts:99-106`
  trusts the client on reposition length and shot direction. Not reachable
  through the shipped UI, but a modified client could cheat an online match.
  Needs a decision on which rules the server enforces and what it does with a
  rejected action (drop it, or end the match) before it can be written.
- **Narrow landscape has no fitting arrangement.** Between 768px and 806px
  wide with height under 501px, no current arrangement fits and the board
  overflows its column. Every other size is covered. Needs a layout decision
  (a new arrangement, or letting that band scroll) rather than a tweak.
- **Runtime verification for the two online animation races.** The ordering
  logic is covered by `src/online/transition.test.ts`, but the races have
  never been exercised against two live clients. The browser pane throttles
  non-fronted tabs hard enough that hand-driving two clients cannot reproduce
  them — a real attempt needs a scripted harness, not manual clicking.

## Recently Done

- **Responsive game layout system.** Slot-based `GameLayout` shell with
  measured board sizing, a `--ui-scale` system for side panels and buttons,
  and dedicated arrangements for phone, portrait tablet, landscape, and
  desktop. Both the local and online games render through it.
- **Phone UI.** Score strip with modal standings and a kills feed, hearts for
  remaining lives in survival, and a kills button that doubles as a live
  ticker. Fits 375px.
- **Online mode on one Worker.** Frontend and game server served from a single
  Cloudflare Worker, so both clients run same-origin.
- **Resumable local games.** Hotseat matches save and resume, including a kill
  streak's replay frames across the save boundary.
- **Rules and scoring pass.** Default 30/3 targets, self-kill corner bonus,
  survival draws, leavers removed instead of pausing the match, and a sortable
  leaderboard.
- **Spawn phantom-destroyer and move-revisit UX.**
- **Four correctness fixes.** Online board staying correct when an event lands
  mid-animation; an online match no longer deadlocking or leaking a freed
  seat; respawn immunity respected when a crush kills; the board staying
  inside its column at every landscape size.
