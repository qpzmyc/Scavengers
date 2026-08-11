# TASKS

Working task list for Scavengers. Kept in sync by the `update-tasks` skill;
`## Small Changes` is also read and written by `quick-tweaks`.

## In Progress

_Nothing in flight — `feat/phantom-destroyer-move-ux-fixes` merged to `main` 2026-07-30._

## Small Changes

_Empty._

## Backlog / Ideas

- **The hover state never reaches the inline-styled buttons.**
  `button:hover:not(:disabled)` in `src/index.css` sets `border-color`, but
  `primaryBtn` and `toggleBtn` (`src/online/OnlineSession.tsx`,
  `src/components/menu/MenuFlow.tsx`) set `border` inline, and an inline style
  beats a stylesheet rule. So the game's most prominent buttons have had no
  hover feedback at all. Found while adding the pressed and focus states, which
  sidestep this by using properties nothing sets inline. Fixing hover means
  either moving those inline styles into CSS classes or giving hover a property
  that is not set inline.


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

- **Two deduplications, no behavior change.** The ResizeObserver plumbing shared
  by `useBoardColumn` and `useElementWidth` moved into `src/layout/useObservedBox.ts`,
  which now carries the load-bearing explanation of why these have to be callback
  refs. Each hook keeps only its own derivation. The one contract to know is that
  the `onBox` callback must be identity-stable, since an unstable one rebuilds the
  observer every render. The controls card and the kills panel moved from both
  `App.tsx` and `OnlineGame.tsx` into `GameLayout`, which now owns the shared
  `panel` style and the "Kills" heading and takes a `controlsWidth` prop; callers
  pass contents only. That made each file's local `card` object dead, so both were
  removed. Verified by measuring the hotseat layout before and after (controls slot
  239x790, board wrapper 865x671, bars 660x103, card styling identical). The online
  screen was changed identically but only typechecked, not exercised at runtime.

- **The board no longer resizes on a phase change.** The replay banner replaced
  ResourceBars and was ~55px shorter, and both share `.game-layout__center` with
  the board, so the board absorbed the difference. It only showed when the board
  was height-bound rather than width-bound, which is why it was visible in
  survival and not in deathmatch at the same 1440x900: the narrower Lives card
  leaves the centre column 865px wide, so `boardCellSize` takes the height, and
  the board went 671px playing to 726px replaying. ResourceBars now stays
  mounted under `visibility: hidden` during replay and the banner lays over the
  space it reserves, so the column reserves the same height in both phases and
  keeps doing so if ResourceBars changes size later. Hotseat only; OnlineGame
  always rendered ResourceBars and never had this.

- **Buttons now show being pressed and holding keyboard focus.** Chosen from
  three treatments; the pick was "press down", so `button:active` dips the
  button 1px and dims it to `brightness(0.86)`, and `button:focus-visible`
  draws a 2px accent ring at 2px offset. Built from `transform`, `filter` and
  `outline` on purpose: about 70 buttons set `background` and `border` inline,
  which a stylesheet rule cannot override, so a background-based press would
  have silently skipped the game's most prominent buttons. `:focus-visible`
  rather than `:focus` keeps the ring off mouse clicks. No `prefers-reduced-motion`
  guard, since reduced motion was considered and rejected in the polish survey.
  The pressed and focus states could not be triggered inside the browser pane
  (`document.hasFocus()` is false there, so `:focus-visible` never engages);
  what was verified is that both rules parse into the stylesheet with the
  intended declarations and that those exact declarations render correctly on
  the comparison page, on inline-styled buttons as well as plain ones.

- **Three quick wins: modal keyboard support, table naming, long lobby names.**
  Modal now closes on Escape, confines Tab to the panel, and hands focus back to
  whatever opened it. That last part needed the opener captured in a `useState`
  initializer rather than an effect: `TextInputPopup`'s input has `autoFocus`,
  which React applies during commit, so an effect reading `document.activeElement`
  saw the modal's own input and "restored" focus to a detached node, dropping it
  onto `<body>`. Escape maps to `onCancel` on `ConfirmDialog`, so it cancels
  rather than confirms.
  The standings table is now named per mode ("Leaderboard" in deathmatch,
  "Lives" in survival) across the phone strip's card label and the modal title;
  the strip previously said "Leaderboard" in both modes, putting that word over a
  row of hearts. `Leaderboard` and `Lives` take a `titledExternally` prop so
  their own heading disappears when a Modal title already names them.
  Long lobby names step down 15 / 13.5 / 12px past 11 and 13 characters. The
  font shrink alone did **not** fix the crowding — the lobby panel is
  content-sized, so shrinking the text shrank the panel too and left a 1.8px
  gap. The row needed an explicit `gap: 14` to hold the name off the button; the
  font step-down is what keeps the panel from widening to 366px of a 375px
  viewport to pay for it. Measured live at 375px: 14px gap, 322px panel, no
  sideways scroll.

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
