# TASKS

Working task list for Scavengers. Kept in sync by the `update-tasks` skill;
`## Small Changes` is also read and written by `quick-tweaks`.

## In Progress

_Nothing in flight — `feat/phantom-destroyer-move-ux-fixes` merged to `main` 2026-07-30._

## Small Changes

- **Shrink a long player name instead of letting it crowd the edit button.**
  In the online lobby's player row (`src/online/OnlineSession.tsx`), a
  16-character name — the maximum `maxLength` allows — ends exactly flush
  against the pencil/edit button with a 0px gap. Measured at 381px and 396px
  viewport: it touches but does not overlap, and the page does not scroll
  sideways, so this is spacing rather than a break. Approved fix is to reduce
  the name's font size as it gets longer rather than truncate it, so the whole
  name stays readable. Approved in the 2026-08-09 polish survey.

## Backlog / Ideas

- **No pressed or keyboard-focus state on any button.** `src/index.css` defines
  `button:hover:not(:disabled)` and `button:disabled` but no `:active` and no
  `:focus-visible`. So a tap gives no confirmation it registered, and anyone
  navigating by keyboard or gamepad moves through the game blind. Found during
  the 2026-08-09 polish survey; designing the two states is a taste call that
  affects every control, so it needs a decision rather than a quick patch.
- **The shared Modal has no Escape-to-close and no focus trap.**
  `src/components/Modal.tsx` closes on scrim click and on its × button only.
  Every popup in the game uses it.
- **The standings table is called two things.** The modal is titled
  "Standings", the card inside it and the phone score strip both say
  "Leaderboard". One concept, two names, one nested inside the other.

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
- **Drag your token to build a move path, with Confirm still required.**
  Approved in the 2026-08-09 polish survey as **gesture plus fallback**: the
  existing tap-tile-then-Confirm flow stays exactly as it is and the drag is an
  additional, faster route. The user explicitly required that the drag NOT
  commit on release — it builds the path and the Confirm button still gates the
  commit, so the energy preview in ResourceBars (the `5/5 →3` readout) stays
  meaningful. Needs: pointer capture, `touch-action` set so the page does not
  scroll mid-drag, an ~8px threshold so a shaky tap stays a tap, a visible
  signpost that the token is draggable, and a drag that cancels back to the
  start if released off-board. Move flow lives in the `Flow` union in
  `src/components/ControlPanel.tsx` and the tile handlers in `src/App.tsx`.
  The equivalent swap for ATTACK aiming was considered and rejected — do not
  add it there.
- **Count the leaderboard scores up, and show the delta on the row as it
  happens.** `src/components/Leaderboard.tsx` already animates rows re-ranking
  (`transform 0.45s`), but the score numbers jump. A +5 kill and a −3 death
  currently look like identical instant changes, so the scoring rule reads
  slower than it should. Must interrupt correctly if a second change lands
  mid-count.
  Do these two together, which was the user's explicit instruction: as well as
  counting up, briefly show `+5` or `−3` on the player's own row at the moment
  their score changes. That was chosen as the eventual home for the scoring
  hints, which is why the static `+5 / −3 / +1` legend now sits behind the "?"
  toggle beside the Leaderboard title rather than in the column header. Once
  the live version exists, revisit whether the "?" legend is still earning its
  place. Approved in the 2026-08-09 polish survey.
- **Make the online lobby's empty seat look live.** "Waiting for player…" in
  `src/online/OnlineSession.tsx` is a static grey box that never changes, so a
  host cannot tell the room is still open or how long they have waited. Adding
  a timeout was considered and rejected — the room should keep waiting
  indefinitely; this is about showing that it is waiting. Approved in the
  2026-08-09 polish survey.
- **Runtime verification for the two online animation races.** The ordering
  logic is covered by `src/online/transition.test.ts`, but the races have
  never been exercised against two live clients. The browser pane throttles
  non-fronted tabs hard enough that hand-driving two clients cannot reproduce
  them — a real attempt needs a scripted harness, not manual clicking.

## Recently Done

- **Polish pass: modals, standings header, win screen.** Popups now rise into
  place instead of appearing instantly, using two new shared easing tokens
  (`--ease-enter`, `--ease-exit`) that later animations should adopt. The
  leaderboard header became a single row of five column names with the scoring
  hints behind a "?" toggle, after the old two-line header left "DEATHS" and
  "STREAK" overflowing their own columns at phone width. The win screen gained
  a full-width result band in the winner's colour and a "Play again" button
  that restarts with the finished match's own settings, so a match no longer
  dead-ends at the menu; online got the same treatment and its "Back to Lobby"
  was renamed to "Play again" to match.
- **Narrow landscape no longer overflows.** The score strip sits in a grid
  `auto` track, which sizes to max-content, so the kills line's `nowrap` text
  widened the column instead of ellipsing and pushed the board past its 28px
  tile floor. Capping the track from what must not shrink fixes it at every
  width without a new breakpoint. Survival was the worse case — it overflowed
  36px with no kill text at all — and its four heart chips now fit by dropping
  the redundant colour dot, which the heart already carries.
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
