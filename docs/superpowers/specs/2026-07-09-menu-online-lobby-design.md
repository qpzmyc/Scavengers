# Multi-Screen Menu with Online Lobby Scaffolding — Design

**Date:** 2026-07-09
**Status:** Approved for planning

## Goal

Replace the current single main-menu screen with a multi-screen menu flow that
introduces the structure for online play, while keeping the game fully playable
end-to-end. Networking is **out of scope** for this task — all online screens use
mock/placeholder data and every "Start game" action launches the existing local
hotseat game.

## Scope

**In scope:**
- Split the menu into a game-type screen and a settings screen.
- Add the online create/join/room-lobby screens with full click-flow and
  back-button navigation.
- Extract the menu into a self-contained component.

**Out of scope (deferred to a later task):**
- Real PartyKit rooms, matchmaking, public-room listing, live player counts,
  join-by-code validation. The `server/` stub is untouched.
- Bot AI.

## Screen Graph

```
gameType (root, no back)
  ├─ Online   ─┐
  ├─ In Person ┼─► settings (back → gameType)
  └─ Bots     ─┘

settings:
  • In Person / Bots → [Start Game] → local game
  • Online → [Join game] (left) · [Create game] (right)

Create game → inline prompt: [Create Public Room] · [Create Private Room]
            → room (lobby)   (back → settings)

Join game   → join           (back → settings)
            → [Enter code] → room (lobby)
```

### Screens

1. **gameType (root):** Three choices — Online, In Person, Bots. All three are
   selectable and lead to the settings screen. No back arrow (this is the app
   root).

2. **settings:** Game mode (Deathmatch / Last Player Standing) and player count
   (2 / 4), reusing the existing toggle-button styling.
   - For **In Person** and **Bots**: a single `Start Game` button launches the
     local game.
   - For **Online**: two bottom buttons — `Join game` (left) and `Create game`
     (right) — replace `Start Game`.
   - Back arrow → gameType.

3. **Create prompt:** Selecting `Create game` swaps the two bottom buttons for
   `Create Public Room` · `Create Private Room` (inline, on the settings screen).
   Choosing either navigates to the room lobby, carrying the selected
   mode/player-count and the chosen visibility.

4. **room (lobby):**
   - Player list: `You` in slot 1; remaining slots up to the chosen count (2 or 4)
     show `Waiting for player…`. No fake opponents.
   - If the room is **private**, its **code** is shown at the bottom.
   - `Start game` button at the bottom launches the local hotseat game with the
     chosen mode/count.
   - Back arrow → settings.

5. **join:**
   - `Enter code` button at the top.
   - An empty **"No rooms available"** state. The list layout is built to support
     per-room rows showing mode and `#/2` · `#/4` fullness for when real rooms
     exist later, but renders empty now.
   - `Enter code` opens a text input; submitting a code navigates to the room
     lobby (mocked — no validation).
   - Back arrow → settings.

Every screen below the root has a back arrow in the top-left.

## Code Structure

Extract the entire menu into a self-contained component:

```
src/components/menu/
  MenuFlow.tsx        — owns menu navigation state; renders the active sub-screen
  GameTypeScreen.tsx  — screen 1
  SettingsScreen.tsx  — screen 2 (+ create prompt, online buttons)
  RoomScreen.tsx      — lobby (player list, code, start)
  JoinScreen.tsx      — join list + enter-code
```

`App.tsx` keeps its `screen: 'menu' | 'game'` state and renders `<MenuFlow>` when
in the menu, passing one callback:

```ts
<MenuFlow onStartGame={(mode, count) => { startGame(mode, count); setScreen('game'); }} />
```

This removes the large inline menu render-block from `App.tsx` (already ~1200
lines and focused on gameplay orchestration) and follows the existing
presentational-component pattern (`Board`, `ControlPanel`, `Leaderboard`).

## State & Mock Behavior

All new state lives **inside `MenuFlow`** — nothing touches the engine.

- Navigation state: which sub-screen is active; a small stack or explicit
  screen enum with back transitions.
- Carried selections: `gameType` (`'online' | 'inPerson' | 'bots'`),
  `mode` (`GameMode`), `playerCount` (`2 | 4`),
  `roomVisibility` (`'public' | 'private'`), `roomCode`.
- **Room code:** generated client-side, 6 uppercase alphanumeric characters
  (e.g. `4F7K2Q`), shown only for private rooms.
- **No networking:** player list is `You` + `Waiting…` slots; join list is the
  empty state; `Start game` always calls `onStartGame` (the existing local game).
  Host vs. joiner is cosmetic for now.
- All colors/spacing from `theme.ts`; reuse existing menu button styles.

## Testing

Consistent with the project's conventions (engine is unit-tested; UI wiring is
verified via `npm run build` + the suite). This change is presentational and
adds no engine logic, so:
- `npm run build` must pass (strict TS, `noUnusedLocals`, `verbatimModuleSyntax`).
- Manual verification of the click-flow: each screen reachable, every back arrow
  returns to the correct parent, `Start game` from every entry point launches the
  local game with the correct mode/count.

## Non-Goals / YAGNI

- No URL routing.
- No persistence of menu selections across reloads.
- No real room codes or code validation.
- No distinction in behavior between host and joiner.
