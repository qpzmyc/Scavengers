import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type GameState,
  type GameMode,
  type Position,
  createInitialGameState,
  movePlayer,
  restPlayer,
  fakeMove,
  clearPhantom,
  realOccupantsAt,
  spawnOwnerAt,
  punch,
  shoot,
  bomb,
  resolveAttack,
  endTurn,
  isInBounds,
  GRID_SIZE,
  ATTACK_MAX_REPOSITION,
  PHANTOM_ENERGY_COST,
  MOVE_ENERGY_COST_PER_TILE,
  ENERGY_PICKUP_VALUE,
  MAX_ENERGY,
  PUNCH_ENERGY_COST,
  SHOOT_AMMO_COST,
  BOMB_AMMO_COST,
  ATTACK_ENERGY_COST,
  maxMoveTilesForCount,
} from './engine';
import type { PlayerId } from './engine';
import { Board, type Highlight, type HighlightKind, type RedTint, type DeathAnim } from './components/Board';
import { ResourceBars, type ResourcePreview } from './components/ResourceBars';
import { Leaderboard } from './components/Leaderboard';
import { Lives } from './components/Lives';
import { ControlPanel, type Flow, type AttackType, type Capabilities } from './components/ControlPanel';
import { MenuFlow } from './components/menu/MenuFlow';
import type { EnterRoomConfig } from './components/menu/MenuFlow';
import { OnlineSession } from './online/OnlineSession';
import { ConfirmDialog } from './components/ConfirmDialog';
import { loadLocalSave, saveLocalGame, clearLocalSave } from './game/localSave';
import type { KillNotification } from './game/localSave';
import { theme } from './theme';
import { useBoardColumn } from './layout/useBoardColumn';
import { useElementWidth } from './layout/useElementWidth';
import { GameLayout } from './components/GameLayout';
import { ScoreStrip } from './components/ScoreStrip';
import { Modal } from './components/Modal';
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

const REPLAY_START_MS = 300; // pause before the replay begins, so the board can register
const REPLAY_END_MS = 300; // pause after the replay finishes, before control is handed over

type Phase = 'playing' | 'result' | 'handoff' | 'replaying';

// Renders a message, tinting any word that names a player color with that color.
function renderColoredText(text: string, colorSet: Set<string>): ReactNode[] {
  return text.split(/([A-Za-z]+)/).map((tok, i) =>
    colorSet.has(tok.toLowerCase()) ? (
      <span key={i} style={{ color: tok.toLowerCase(), fontWeight: 800, textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}>{tok}</span>
    ) : (
      <span key={i}>{tok}</span>
    )
  );
}

// Simulates energy remaining after walking `path` from `startEnergy`, subtracting
// MOVE_ENERGY_COST_PER_TILE per step and refunding ENERGY_PICKUP_VALUE (clamped to
// MAX_ENERGY) when a step lands on an energyPickup tile. Used to decide whether a
// further move/reposition step can still be highlighted.
function simulateEnergyAfterPath(board: GameState['board'], startEnergy: number, path: Position[]): number {
  let energy = startEnergy;
  for (const p of path) {
    energy -= MOVE_ENERGY_COST_PER_TILE;
    const tile = board[p.y]?.[p.x];
    if (tile && (tile.type === 'energyPickup' || tile.type === 'bonusEnergyPickup')) {
      energy = Math.min(MAX_ENERGY, energy + ENERGY_PICKUP_VALUE);
    }
  }
  return energy;
}

type Route =
  | { kind: 'menu'; initialGameType?: 'online' | 'inPerson' | 'bots'; initialScreen?: 'gameType' | 'settings' | 'join' }
  | { kind: 'game' }
  | { kind: 'online'; roomId: string; create?: EnterRoomConfig['create']; becomeHost?: boolean; seat?: EnterRoomConfig['seat'] };

function App() {
  const [route, setRoute] = useState<Route>({ kind: 'menu' });
  const [mode, setMode] = useState<GameMode>('lastStanding');
  const [state, setState] = useState<GameState>(() => createInitialGameState('lastStanding', 2));
  const [display, setDisplay] = useState<GameState>(state);
  const [phase, setPhase] = useState<Phase>('playing');
  const [flow, setFlow] = useState<Flow>({ kind: 'menu' });
  // Which player's turn is currently being animated during a replay, so the
  // "Replaying ___'s turn" banner can update one player at a time instead of
  // naming every replayed player at once.
  const [replayActorId, setReplayActorId] = useState<PlayerId | null>(null);
  const [showMenuConfirm, setShowMenuConfirm] = useState(false);
  // Phone breakpoint only: which side panel (normally shown inline) is open as a modal.
  const [phonePanel, setPhonePanel] = useState<'standings' | 'kills' | null>(null);
  const { ref: boardRef, cellSize, columnWidth } = useBoardColumn();
  // The controls column lives in its own grid track now (see GameLayout), so it
  // needs its own width measurement — columnWidth above tracks the board, which
  // ResourceBars still aligns to, but is no longer the controls panel's width.
  const { ref: controlsRef, width: controlsWidth } = useElementWidth();

  // Persistent, stacked kill notifications shown top-right of the screen. Never
  // auto-dismissed — new kills are appended underneath older ones.
  const [notifications, setNotifications] = useState<KillNotification[]>([]);
  const notificationIdRef = useRef(0);
  // Mirror of `notifications` so the (setTimeout-driven) local-save writes read the
  // current kill feed without depending on React's async state flush.
  const notificationsRef = useRef<KillNotification[]>([]);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Ephemeral sliding toast feed — independent of the persistent Kills panel above.
  // Used for "not enough X to Y" warnings and kill/extra-turn announcements. Each
  // entry auto-dismisses on its own timer, and spamming the trigger just stacks
  // more toasts (newest on top), like a real notification feed.
  const [actionNotices, setActionNotices] = useState<{ id: number; text: string; kind: 'warning' | 'kill' | 'immune' | 'phantom'; leaving?: boolean }[]>([]);
  const actionNoticeIdRef = useRef(0);

  // Death/respawn choreography for all victims of an attack: each fades out at its
  // death spot, then (if not eliminated) fades/pops back in at its respawn spot.
  const [deathAnims, setDeathAnims] = useState<DeathAnim[]>([]);
  // Red-tint ripple overlays for shoot/bomb/punch, cleared at the end of the result phase.
  const [redTints, setRedTints] = useState<RedTint[]>([]);

  // Replay bookkeeping (kept in refs so React StrictMode double-render can't duplicate them).
  // With >2 players, a given player may sit out several other players' turns before
  // their own comes back around, so both the "last seen" baseline and the pending
  // frame log are tracked per-player rather than as a single shared value.
  const actorLogRef = useRef<AnimFrame[]>([]); // frames accumulated during the current actor's ongoing turn (may span several confirms on kill-granted extra turns)
  const turnStartRef = useRef<Record<PlayerId, GameState>>({} as Record<PlayerId, GameState>); // per-player: board state as that player last saw it
  const pendingLogRef = useRef<Record<PlayerId, AnimFrame[]>>({} as Record<PlayerId, AnimFrame[]>); // per-player: all intervening turns' frames not yet replayed to them
  const replayRef = useRef<AnimFrame[]>([]); // frames to animate when the next player starts
  const timersRef = useRef<number[]>([]);

  const schedule = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const pushActionNotice = (text: string, kind: 'warning' | 'kill' | 'immune' | 'phantom' = 'warning') => {
    const id = actionNoticeIdRef.current++;
    setActionNotices((list) => [{ id, text, kind }, ...list]);
    // Two-stage dismissal: flip to `leaving` (plays the fade-out keyframe), then
    // remove from the DOM once that animation has finished. Long dwell so there's
    // time to read them.
    schedule(4800, () => {
      setActionNotices((list) => list.map((n) => (n.id === id ? { ...n, leaving: true } : n)));
      schedule(360, () => {
        setActionNotices((list) => list.filter((n) => n.id !== id));
      });
    });
  };

  const gameOver = state.winner !== null || state.draw != null;
  const viewerId = state.currentTurn;

  // Win sequence: fade to black slowly, then reveal the win screen (mirrors OnlineGame).
  const [winFadeIn, setWinFadeIn] = useState(false);
  const [winScreenReady, setWinScreenReady] = useState(false);
  const [winContentIn, setWinContentIn] = useState(false);
  useEffect(() => {
    if (!gameOver) {
      setWinFadeIn(false);
      setWinScreenReady(false);
      setWinContentIn(false);
      return;
    }
    // Board fades to black over 5s, then the win screen fades in over 3s (sequential).
    const t1 = window.setTimeout(() => setWinFadeIn(true), 50);
    const t2 = window.setTimeout(() => setWinScreenReady(true), 5050);
    const t3 = window.setTimeout(() => setWinContentIn(true), 5100);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [gameOver]);
  const me = state.players[viewerId];
  const others = state.turnOrder.filter((id) => id !== viewerId).map((id) => state.players[id]);
  const interactive = phase === 'playing' && !gameOver;
  // Lowercased set of every player's color name, for tinting color words in messages.
  const colorSet = new Set(state.turnOrder.map((id) => state.players[id].color.toLowerCase()));

  // Persist the current in-person game at a settled turn boundary, so it can be resumed
  // if the players quit (or close the tab) before it ends. `settledState` is the fully
  // advanced logical state; the replay refs are read live. Never called for online games.
  const persistLocal = (settledState: GameState) => {
    saveLocalGame({
      mode: settledState.mode,
      state: settledState,
      notifications: notificationsRef.current,
      notificationId: notificationIdRef.current,
      turnStart: turnStartRef.current,
      pendingLog: pendingLogRef.current,
      replay: replayRef.current,
    });
  };

  const resumeGame = () => {
    const save = loadLocalSave();
    if (!save) return;
    clearTimers();
    setMode(save.mode);
    setState(save.state);
    setDisplay(save.state);
    setNotifications(save.notifications);
    notificationsRef.current = save.notifications;
    notificationIdRef.current = save.notificationId;
    actorLogRef.current = [];
    turnStartRef.current = save.turnStart;
    pendingLogRef.current = save.pendingLog;
    replayRef.current = save.replay;
    setRedTints([]);
    setDeathAnims([]);
    setActionNotices([]);
    setFlow({ kind: 'menu' });
    // Always land on the "___'s turn" handoff screen of whoever hadn't confirmed yet.
    setPhase('handoff');
    setRoute({ kind: 'game' });
  };

  const startGame = (nextMode: GameMode, count: number, options?: { deathCap: number; targetScore: number }) => {
    clearTimers();
    const s = createInitialGameState(nextMode, count, options);
    setMode(nextMode);
    setState(s);
    setDisplay(s);
    // Open with the same handoff screen every turn uses, so the very first player
    // gets a "P1's turn — Start turn" gate too (nothing to replay yet).
    setPhase('handoff');
    setFlow({ kind: 'menu' });
    setRedTints([]);
    setDeathAnims([]);
    setNotifications([]);
    setActionNotices([]);
    actorLogRef.current = [];
    const starts = {} as Record<PlayerId, GameState>;
    const logs = {} as Record<PlayerId, AnimFrame[]>;
    for (const id of s.turnOrder) {
      starts[id] = s;
      logs[id] = [];
    }
    turnStartRef.current = starts;
    pendingLogRef.current = logs;
    replayRef.current = [];
    notificationsRef.current = [];
    // Persist the fresh game immediately (overwrites any previous save), so quitting
    // even before the first confirmed action still leaves a resumable game.
    persistLocal(s);
  };

  const backToMenu = () => {
    clearTimers();
    setPhase('playing');
    setRoute({ kind: 'menu' });
  };

  // A fixed top-right "Menu" button (identical look + location on the handoff screen
  // and during play) plus its confirmation dialog. Quitting mid-game loses progress,
  // so it's gated behind an "are you sure?" prompt.
  const menuChrome = (
    <>
      <button
        onClick={() => setShowMenuConfirm(true)}
        style={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 150,
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 8,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          color: theme.textMuted,
          cursor: 'pointer',
        }}
      >
        Menu
      </button>
      {showMenuConfirm && (
        <ConfirmDialog
          title="Return to menu?"
          message="Are you sure you want to quit to the menu?"
          confirmLabel="Quit to menu"
          onConfirm={() => { setShowMenuConfirm(false); backToMenu(); }}
          onCancel={() => setShowMenuConfirm(false)}
        />
      )}
    </>
  );

  const canPunch = me.energy >= PUNCH_ENERGY_COST;
  const canShoot = me.ammo >= SHOOT_AMMO_COST && me.energy >= ATTACK_ENERGY_COST;
  const canBomb = me.ammo >= BOMB_AMMO_COST; // bomb costs only ammo now
  const can: Capabilities = {
    move: me.energy >= MOVE_ENERGY_COST_PER_TILE,
    punch: canPunch,
    shoot: canShoot,
    bomb: canBomb,
    // Can enter the attack flow if any single weapon is usable.
    attack: canPunch || canShoot || canBomb,
    fake: me.energy >= PHANTOM_ENERGY_COST,
  };
  const maxMoveTiles = maxMoveTilesForCount(state.turnOrder.length);

  // The base a fake move projects from: an existing phantom keeps accumulating from
  // its current display position, not from the real player.
  const phantomBase = me.isPhantom && me.phantomDisplayPosition ? me.phantomDisplayPosition : me.position;

  // ---- Highlights + click targeting (only while interactive) ----
  const highlights: Highlight[] = [];
  // Tiles clickable to EXTEND a move/reposition path: every affordable, unblocked neighbor of
  // the cursor — INCLUDING tiles already in the path (revisiting is allowed, e.g. up, up,
  // down), but only while under the step limit. When at the limit this set is empty, so a
  // green (already-selected) tile is only clickable when blue candidates also exist.
  const extendKeys = new Set<string>();
  if (interactive) {
    if (flow.kind === 'move') {
      const cursor = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
      const remainingEnergy = simulateEnergyAfterPath(state.board, me.energy, flow.path);
      if (flow.path.length < maxMoveTiles && remainingEnergy >= 1) {
        for (const p of neighbors(state.board, cursor)) {
          // Note: the player's own starting tile IS allowed here (once they've stepped
          // away), so a two-step move can loop back to where it began.
          // Block the position each other player APPEARS to occupy (a phantom's fake
          // tile, or a normal player's real tile). A phantom's true tile is NOT blocked
          // — it looks empty, and stepping onto it crushes them (handled on confirm).
          if (others.some((o) => eq(p, o.isPhantom && o.phantomDisplayPosition ? o.phantomDisplayPosition : o.position))) continue;
          extendKeys.add(`${p.x},${p.y}`); // clickable whether it renders blue (new) or green (revisit)
          if (flow.path.some((s) => eq(s, p))) continue;
          highlights.push({ x: p.x, y: p.y, kind: 'candidate' });
        }
      }
      flow.path.forEach((p) => highlights.push({ x: p.x, y: p.y, kind: 'selected' }));
    } else if (flow.kind === 'fakeMove') {
      for (const p of neighbors(state.board, phantomBase)) {
        highlights.push({ x: p.x, y: p.y, kind: 'candidate' });
      }
      if (flow.target) highlights.push({ x: flow.target.x, y: flow.target.y, kind: 'selected' });
    } else if (flow.kind === 'attackReposition') {
      const cursor = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
      // Allow a reposition step as long as the step itself is affordable (a step onto
      // an energy pickup can fund further steps); affordability of the attack itself
      // is enforced separately once a weapon is chosen.
      const remainingEnergy = simulateEnergyAfterPath(state.board, me.energy, flow.path);
      if (flow.path.length < ATTACK_MAX_REPOSITION && remainingEnergy >= MOVE_ENERGY_COST_PER_TILE) {
        for (const p of neighbors(state.board, cursor)) {
          if (eq(p, me.position)) continue;
          // Block the position each other player APPEARS to occupy (a phantom's fake
          // tile, or a normal player's real tile). A phantom's true tile is NOT blocked
          // — it looks empty, and stepping onto it crushes them (handled on confirm).
          if (others.some((o) => eq(p, o.isPhantom && o.phantomDisplayPosition ? o.phantomDisplayPosition : o.position))) continue;
          extendKeys.add(`${p.x},${p.y}`); // clickable whether it renders blue (new) or green (revisit)
          if (flow.path.some((s) => eq(s, p))) continue;
          highlights.push({ x: p.x, y: p.y, kind: 'candidate' });
        }
      }
      flow.path.forEach((p) => highlights.push({ x: p.x, y: p.y, kind: 'selected' }));
    } else if (flow.kind === 'attackSelect') {
      // Choosing a weapon: keep the committed reposition path visible (no new candidates).
      flow.path.forEach((p) => highlights.push({ x: p.x, y: p.y, kind: 'selected' }));
    } else if (flow.kind === 'attackTarget') {
      const from = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
      const candidates =
        flow.type === 'bomb'
          ? rayTiles(from)
          : flow.type === 'punch'
            ? // Punch may target any in-bounds adjacent tile, walls included (you can
            // punch into a wall) — just not off the map.
            DIRS8.map((d) => ({ x: from.x + d.x, y: from.y + d.y })).filter(isInBounds)
            : neighbors(state.board, from);
      for (const p of candidates) highlights.push({ x: p.x, y: p.y, kind: 'candidate' });
      if (flow.target) highlights.push({ x: flow.target.x, y: flow.target.y, kind: 'selected' });
    }
    // Starting-square reference: while ANY action is being built (i.e. not on the
    // 'menu' step), keep the turn's starting tile marked purple until confirm — so even a
    // rest shows "no movement". If a move loops the preview back ONTO the start, that tile
    // means both origin AND selected step, so it takes the green+purple blend instead.
    if (flow.kind !== 'menu') {
      const hasPath =
        (flow.kind === 'move' || flow.kind === 'attackReposition' || flow.kind === 'attackSelect' || flow.kind === 'attackTarget') &&
        flow.path.length > 0;
      // Blend (green+purple) once the path has ever stepped onto the origin — and it stays
      // blended even after walking off again (e.g. right, left, left), since the tile still
      // carries both "start" and "was stepped on" meaning.
      const loopedBack = hasPath && flow.path.some((s) => eq(s, me.position));
      highlights.push({ x: me.position.x, y: me.position.y, kind: loopedBack ? 'originSelected' : 'origin' });
    }
  }
  // One highlight per tile, priority originSelected(blend) > selected > origin > candidate.
  const rank: Record<HighlightKind, number> = { originSelected: 4, selected: 3, origin: 2, candidate: 1 };
  const bestByTile = new Map<string, Highlight>();
  for (const h of highlights) {
    const key = `${h.x},${h.y}`;
    const prev = bestByTile.get(key);
    if (!prev || rank[h.kind] > rank[prev.kind]) bestByTile.set(key, h);
  }
  const dedupedHighlights = [...bestByTile.values()];
  // A tile is clickable to place a fake move / aim a shot only if it's a fresh candidate.
  const isCandidate = (pos: Position) =>
    highlights.some((h) => h.kind === 'candidate' && h.x === pos.x && h.y === pos.y);
  // A tile extends a move/reposition path if it's an affordable neighbor of the cursor —
  // including already-selected (green) tiles, so you can revisit, up to the step limit.
  const canExtend = (pos: Position) => extendKeys.has(`${pos.x},${pos.y}`);

  // While aiming (a target is chosen but not yet confirmed), continuously flash every
  // tile the shot would actually hit, so the player can preview the attack's area.
  let previewHitTiles: Position[] = [];
  if (interactive && flow.kind === 'attackTarget' && flow.target) {
    const from = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
    previewHitTiles = computeHitTiles(state.board, flow.type, from, flow.target);
  }

  // While building a move or an attack's optional reposition, show the actor's
  // token at the tentatively chosen tile so it visibly steps there on each click;
  // cancelling reverts `flow` to 'menu', so this preview naturally falls away.
  let boardState = display;
  if (
    interactive &&
    (flow.kind === 'move' || flow.kind === 'attackReposition' || flow.kind === 'attackSelect' || flow.kind === 'attackTarget') &&
    flow.path.length
  ) {
    const previewPos = flow.path[flow.path.length - 1];
    const me = display.players[viewerId];
    // A phantom follows the player by its accumulated offset (mirrors movePlayer),
    // so the decoy shifts along with the previewed destination too.
    let phantomDisplayPosition = me.phantomDisplayPosition;
    if (me.isPhantom && phantomDisplayPosition) {
      const dx = previewPos.x - me.position.x;
      const dy = previewPos.y - me.position.y;
      const clamp = (v: number) => Math.max(0, Math.min(GRID_SIZE - 1, v));
      phantomDisplayPosition = { x: clamp(phantomDisplayPosition.x + dx), y: clamp(phantomDisplayPosition.y + dy) };
    }
    boardState = {
      ...display,
      players: {
        ...display.players,
        [viewerId]: { ...me, position: previewPos, phantomDisplayPosition },
      },
    };
  }

  const handleTileClick = (pos: Position) => {
    if (!interactive) return;
    if (flow.kind === 'move') {
      const last = flow.path[flow.path.length - 1];
      // Clicking the last step undoes it; any other affordable neighbor (new OR revisited)
      // extends the path, capped by the step limit via `canExtend`.
      if (last && eq(last, pos)) setFlow({ kind: 'move', path: flow.path.slice(0, -1) });
      else if (canExtend(pos)) setFlow({ kind: 'move', path: [...flow.path, pos] });
    } else if (flow.kind === 'fakeMove') {
      if (flow.target && eq(flow.target, pos)) setFlow({ kind: 'fakeMove', target: null });
      else if (isCandidate(pos)) setFlow({ kind: 'fakeMove', target: pos });
    } else if (flow.kind === 'attackReposition') {
      const last = flow.path[flow.path.length - 1];
      if (last && eq(last, pos)) setFlow({ kind: 'attackReposition', path: flow.path.slice(0, -1) });
      else if (canExtend(pos)) setFlow({ kind: 'attackReposition', path: [...flow.path, pos] });
    } else if (flow.kind === 'attackTarget') {
      if (flow.target && eq(flow.target, pos)) setFlow({ kind: 'attackTarget', type: flow.type, path: flow.path, target: null });
      else if (isCandidate(pos)) setFlow({ kind: 'attackTarget', type: flow.type, path: flow.path, target: pos });
    }
  };

  // Plays an AnimFrame[] sequence through the shared display/redTints/deathAnim state,
  // holding each frame for its holdMs before advancing, then calls onDone.
  const playFrames = (frames: AnimFrame[], onDone: () => void, onFrame?: (f: AnimFrame) => void) => {
    if (frames.length === 0) {
      onDone();
      return;
    }
    let i = 0;
    const step = () => {
      const f = frames[i];
      setDisplay(f.display);
      setRedTints(f.redTints);
      setDeathAnims(f.death);
      onFrame?.(f);
      i += 1;
      if (i < frames.length) {
        schedule(f.holdMs, step);
      } else {
        schedule(f.holdMs, () => {
          setRedTints([]);
          setDeathAnims([]);
          onDone();
        });
      }
    };
    step();
  };

  // ---- Commit an action: show the actor's outcome, then hand off (or continue on a kill) ----
  const applyResult = (
    acted: GameState,
    next: GameState,
    turnPasses: boolean,
    frames: AnimFrame[],
    victims: { victimId: PlayerId; deathPos: Position; respawnPos: Position | null; verb: string }[] = [],
    killNoticeDelayMs = 0
  ) => {
    const actorId = state.currentTurn;
    // Tag every frame with the acting player so replays can name whose turn they show.
    actorLogRef.current.push(...frames.map((f) => ({ ...f, actorId })));
    setState(acted); // actor is still currentTurn here, so their bars show the updated resources
    setFlow({ kind: 'menu' });
    setPhase('result');

    if (victims.length) {
      const killer = acted.players[state.currentTurn];
      setNotifications((list) => {
        const additions = victims.map((v) => {
          const victim = acted.players[v.victimId];
          return {
            id: notificationIdRef.current++,
            killerColor: killer.color,
            killerName: killer.color,
            victimColor: victim.color,
            victimName: victim.color,
            verb: v.verb,
          };
        });
        return [...list, ...additions];
      });

      // Victims of the same attack type are combined into one toast; different
      // attack types (e.g. a bomb catching one player and a punch catching another)
      // get their own separate toasts instead of being mashed into one line.
      const victimsByVerb = new Map<string, typeof victims>();
      for (const v of victims) {
        const group = victimsByVerb.get(v.verb) ?? [];
        group.push(v);
        victimsByVerb.set(v.verb, group);
      }
      // Delay so the toast appears only once the ripple has lit the victim's square.
      schedule(killNoticeDelayMs, () => {
        for (const [verb, group] of victimsByVerb) {
          const victimNames = group.map((v) => acted.players[v.victimId].color.toUpperCase());
          const killMsg =
            next.winner === null && next.draw == null && verb !== 'crushed'
              ? `${verb[0].toUpperCase()}${verb.slice(1)} ${victimNames.join(', ')} — +1 extra turn!`
              : `${verb[0].toUpperCase()}${verb.slice(1)} ${victimNames.join(', ')}!`;
          pushActionNotice(killMsg, 'kill');
        }
      });
    }

    playFrames(frames, () => {
      setState(next);
      setDisplay(next);
      setDeathAnims([]);
      setRedTints([]);
      if (next.winner !== null || next.draw != null) {
        clearLocalSave(); // finished games aren't resumable
        setPhase('playing'); // game over screen
      } else if (turnPasses) {
        // This actor has already watched their own turn live, so `next` becomes the
        // baseline for THEIR next replay (whenever their turn comes back around) —
        // updating this here, right as their turn ends, is what lets it carry forward
        // correctly even the very first time (which never goes through `startTurn`).
        turnStartRef.current = { ...turnStartRef.current, [actorId]: next };
        pendingLogRef.current = { ...pendingLogRef.current, [actorId]: [] };

        // Flush this whole turn's frames (which may span several confirms if the
        // actor chained kills) into every other player's pending log, so whoever's
        // turn is coming up next sees every turn they've missed, not just this one.
        for (const id of next.turnOrder) {
          if (id === actorId) continue;
          pendingLogRef.current[id] = [...(pendingLogRef.current[id] ?? []), ...actorLogRef.current];
        }
        actorLogRef.current = [];
        const nextId = next.currentTurn;
        replayRef.current = [
          plainFrame(turnStartRef.current[nextId] ?? next, 0),
          ...(pendingLogRef.current[nextId] ?? []),
        ];
        persistLocal(next); // settled handoff boundary → resumable at next player's turn
        setPhase('handoff');
      } else {
        // Extra turn (kill streak): same actor keeps going. Snapshot here too so quitting
        // mid-streak resumes at the start of this extra turn with the kill already counted.
        persistLocal(next);
        setPhase('playing'); // extra turn — same actor keeps going
      }
    });
  };

  // Builds the death-fade frames for ALL victims of an attack, played AFTER the
  // frame that already carries the 'out' fade (see the call site): only the
  // respawn 'in' frame remains here. Eliminated victims (respawnPos null) never
  // reach this — they stay faded out from the merged ripple+out frame.
  const buildRespawnFrames = (
    afterState: GameState,
    victims: { victimId: PlayerId; deathPos: Position; respawnPos: Position | null }[]
  ): AnimFrame[] => {
    const respawning = victims.filter((v) => v.respawnPos !== null);
    if (!respawning.length) return [];
    return [
      {
        display: afterState,
        redTints: [],
        death: respawning.map((v) => ({ playerId: v.victimId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'in' as const })),
        holdMs: DEATH_IN_MS,
      },
    ];
  };

  const handleConfirm = () => {
    if (!interactive) return;
    const actorId = state.currentTurn;
    setRedTints([]);
    try {
      if (flow.kind === 'move') {
        const moved = movePlayer(state, actorId, flow.path);
        // A phantom whose REAL tile the mover stepped onto gets crushed (the mover
        // can't see the hidden real position, so this is a lucky/guessed kill).
        const pathKeys = new Set(flow.path.map((p) => `${p.x},${p.y}`));
        const pathIds = state.turnOrder.filter((id) => {
          if (id === actorId) return false;
          const o = state.players[id];
          return o.alive && !o.eliminated && o.isPhantom && pathKeys.has(`${o.position.x},${o.position.y}`);
        });
        // A phantom that followed the real move onto an enemy's real tile also crushes them.
        const movedActor = moved.players[actorId];
        const followIds = movedActor.isPhantom && movedActor.phantomDisplayPosition
          ? realOccupantsAt(state, actorId, movedActor.phantomDisplayPosition)
          : [];
        const squashedIds = [...new Set([...pathIds, ...followIds])];

        // Walking a real character into an enemy's spawn zone destroys THAT enemy's phantom
        // (only if they have one out): e.g. green marches into red's corner and pops red's decoy.
        let spawnOwner: PlayerId | null = null;
        for (const step of flow.path) {
          const o = spawnOwnerAt(state, step);
          if (o && o !== actorId && state.players[o].isPhantom) { spawnOwner = o; break; }
        }

        // Snap back to the real starting tile first (the live preview already showed the
        // destination), then step through the path so the whole walk plays out.
        const walkFrames: AnimFrame[] = [plainFrame(state, MOVE_STEP_MS)];
        for (let i = 1; i < flow.path.length; i++) {
          walkFrames.push(plainFrame(movePlayer(state, actorId, flow.path.slice(0, i)), MOVE_STEP_MS));
        }

        if (squashedIds.length) {
          // On a crush, the mover loses any phantom they had down (Rule C).
          let killedState = clearPhantom(moved, actorId);
          if (spawnOwner) killedState = clearPhantom(killedState, spawnOwner);
          for (const id of squashedIds) {
            killedState = { ...killedState, players: { ...killedState.players, [id]: { ...killedState.players[id], alive: false } } };
          }
          const acted = resolveAttack({ state: killedState, killedPlayerIds: squashedIds }, actorId);
          const next = endTurn(acted, actorId, false); // a crush is a lucky/incidental kill → no extra turn
          const victims = squashedIds.map((id) => ({
            victimId: id,
            deathPos: state.players[id].position,
            respawnPos: acted.players[id].eliminated ? null : acted.players[id].position,
            verb: 'crushed',
          }));
          const frames: AnimFrame[] = [
            ...walkFrames,
            {
              display: acted,
              redTints: [],
              death: victims.map((v) => ({ playerId: v.victimId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'out' as const })),
              holdMs: Math.max(MOVE_STEP_MS, DEATH_OUT_MS),
            },
            ...buildRespawnFrames(acted, victims),
          ];
          applyResult(acted, next, true, frames, victims, MOVE_STEP_MS * flow.path.length);
        } else {
          // Entering an enemy spawn clears the SPAWN OWNER's phantom (no crush this branch).
          const resolved = spawnOwner ? clearPhantom(moved, spawnOwner) : moved;
          const next = endTurn(resolved, actorId, false);
          const frames: AnimFrame[] = [
            ...walkFrames,
            plainFrame(resolved, RESULT_MS),
          ];
          applyResult(resolved, next, true, frames);
        }
        if (spawnOwner) {
          pushActionNotice(
            `${state.players[actorId].color.toUpperCase()} destroyed ${state.players[spawnOwner].color.toUpperCase()}'s phantom`,
            'phantom'
          );
        }
      } else if (flow.kind === 'rest') {
        const acted = restPlayer(state, actorId);
        applyResult(acted, endTurn(acted, actorId, false), true, [plainFrame(acted, RESULT_MS)]);
      } else if (flow.kind === 'fakeMove' && flow.target) {
        const dir = { x: flow.target.x - phantomBase.x, y: flow.target.y - phantomBase.y };
        const acted = fakeMove(state, actorId, dir);
        // A phantom fake-moved onto an enemy's real tile crushes them (a lucky/guessed kill).
        const pos = acted.players[actorId].phantomDisplayPosition!;
        const squashedIds = realOccupantsAt(state, actorId, pos);
        if (squashedIds.length) {
          let killedState = acted;
          for (const id of squashedIds) {
            killedState = { ...killedState, players: { ...killedState.players, [id]: { ...killedState.players[id], alive: false } } };
          }
          const resolved = resolveAttack({ state: killedState, killedPlayerIds: squashedIds }, actorId);
          const next = endTurn(resolved, actorId, false); // a crush is a lucky/incidental kill → no extra turn
          const victims = squashedIds.map((id) => ({
            victimId: id,
            deathPos: state.players[id].position,
            respawnPos: resolved.players[id].eliminated ? null : resolved.players[id].position,
            verb: 'crushed',
          }));
          const frames: AnimFrame[] = [
            plainFrame(acted, MOVE_STEP_MS),
            {
              display: resolved,
              redTints: [],
              death: victims.map((v) => ({ playerId: v.victimId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'out' as const })),
              holdMs: DEATH_OUT_MS,
            },
            ...buildRespawnFrames(resolved, victims),
          ];
          applyResult(resolved, next, true, frames, victims, MOVE_STEP_MS);
        } else {
          applyResult(acted, endTurn(acted, actorId, false), true, [plainFrame(acted, RESULT_MS)]);
        }
      } else if (flow.kind === 'attackTarget' && flow.target) {
        const t = flow.target;
        // Optional reposition before the attack; the attack then originates from there.
        const base = flow.path.length ? movePlayer(state, actorId, flow.path) : state;
        const from = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
        const result =
          flow.type === 'punch' ? punch(base, actorId, t)
            : flow.type === 'shoot' ? shoot(base, actorId, { x: t.x - from.x, y: t.y - from.y })
              : bomb(base, actorId, t);
        const acted = resolveAttack(result, actorId);
        const gotKill = result.killedPlayerIds.length > 0;
        const next = endTurn(acted, actorId, gotKill);

        // Compute the red-tint ripple tiles for this attack. Each tile fades in
        // (closest first) staggered by TINT_STEP and then STAYS lit; they all clear
        // together when this frame ends. hitTiles are already ordered by proximity.
        const hitTiles = computeHitTiles(state.board, flow.type, from, t);
        const tints: RedTint[] = hitTiles.map((p, i) => ({ x: p.x, y: p.y, delayMs: i * TINT_STEP }));
        const maxTintDelay = tints.reduce((m, t2) => Math.max(m, t2.delayMs), 0);
        // Hold until the last tile has finished fading in, then dwell fully-lit briefly.
        const attackHoldMs = Math.max(RESULT_MS, maxTintDelay + TINT_FADE_MS + TINT_HOLD_MS);

        const frames: AnimFrame[] = [];
        if (flow.path.length) {
          // Same snap-back-then-step treatment as a plain move, for the optional
          // reposition step before the attack lands.
          frames.push(plainFrame(state, MOVE_STEP_MS));
          const mid = movePlayer(state, actorId, flow.path);
          frames.push(plainFrame(mid, MOVE_STEP_MS));
        }

        const attackVerb: Record<AttackType, string> = { punch: 'punched', shoot: 'shot', bomb: 'bombed' };
        // Build a victim record per killed player. deathPos/eliminated status are read
        // from `acted` (post-resolveAttack) since that reflects each victim's resolved
        // state (eliminated, or respawned to their corner) before endTurn runs.
        const victims = result.killedPlayerIds.map((victimId) => ({
          victimId,
          deathPos: result.state.players[victimId].position,
          respawnPos: acted.players[victimId].eliminated ? null : acted.players[victimId].position,
          verb: attackVerb[flow.type],
        }));

        if (victims.length) {
          // `acted` already reflects each victim's post-respawn position (resolveAttack
          // already ran), so this frame must carry the 'out' death fade FROM THE START —
          // otherwise the victim would render normally (already at home) for the ripple's
          // duration, then visibly jump backward to their death spot when the fade begins.
          frames.push({
            display: acted,
            redTints: tints,
            death: victims.map((v) => ({ playerId: v.victimId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'out' as const })),
            holdMs: Math.max(maxTintDelay + TINT_FADE_MS + TINT_HOLD_MS, DEATH_OUT_MS),
          });
          frames.push(...buildRespawnFrames(acted, victims));
        } else {
          frames.push({ display: acted, redTints: tints, death: [], holdMs: attackHoldMs });
        }

        // Hold the kill toast until the ripple actually reaches (lights up) the
        // victim's square. Any reposition frames play before the ripple frame, so
        // account for those too; use the last-lit victim tile for multi-kills.
        const preRippleMs = flow.path.length ? 2 * MOVE_STEP_MS : 0;
        const victimTintDelay = victims.reduce((m, v) => {
          const tile = tints.find((ti) => ti.x === v.deathPos.x && ti.y === v.deathPos.y);
          return Math.max(m, tile ? tile.delayMs : 0);
        }, 0);
        const killNoticeDelayMs = preRippleMs + victimTintDelay + TINT_FADE_MS;

        // Enemies standing on a hit tile who survived only because they're immune:
        // announce it (delayed until the ripple lights their square, like the kill toast).
        const hitKeys = new Set(hitTiles.map((p) => `${p.x},${p.y}`));
        const immuneHits = base.turnOrder
          .filter((id) => id !== actorId)
          .map((id) => base.players[id])
          .filter((p) => p.alive && !p.eliminated && p.immuneTurns > 0 && hitKeys.has(`${p.position.x},${p.position.y}`));
        if (immuneHits.length) {
          const names = immuneHits.map((p) => p.color.toUpperCase());
          const immuneMsg = `${names.join(', ')} ${immuneHits.length > 1 ? 'are' : 'is'} immune — no damage!`;
          const immuneTintDelay = immuneHits.reduce((m, p) => {
            const tile = tints.find((ti) => ti.x === p.position.x && ti.y === p.position.y);
            return Math.max(m, tile ? tile.delayMs : 0);
          }, 0);
          schedule(preRippleMs + immuneTintDelay + TINT_FADE_MS, () => pushActionNotice(immuneMsg, 'immune'));
        }

        // Enemies whose PHANTOM (decoy) was hit but who survived (their real position
        // wasn't caught): the shot only tagged the decoy.
        const killedSet = new Set(result.killedPlayerIds);
        const phantomHits = base.turnOrder
          .filter((id) => id !== actorId && !killedSet.has(id))
          .map((id) => base.players[id])
          .filter((p) => p.alive && !p.eliminated && p.isPhantom && p.phantomDisplayPosition
            && hitKeys.has(`${p.phantomDisplayPosition.x},${p.phantomDisplayPosition.y}`));
        if (phantomHits.length) {
          const names = phantomHits.map((p) => p.color.toUpperCase());
          const phantomMsg = `You hit ${names.join(', ')}'s Phantom!`;
          const phantomTintDelay = phantomHits.reduce((m, p) => {
            const tile = tints.find((ti) => ti.x === p.phantomDisplayPosition!.x && ti.y === p.phantomDisplayPosition!.y);
            return Math.max(m, tile ? tile.delayMs : 0);
          }, 0);
          schedule(preRippleMs + phantomTintDelay + TINT_FADE_MS, () => pushActionNotice(phantomMsg, 'phantom'));
        }

        applyResult(acted, next, !gotKill, frames, victims, killNoticeDelayMs);
      }
    } catch (err) {
      console.error(err);
      // The pre-flight checks in handleSelectAction/handleSelectAttackType catch
      // insufficient resources before the player even gets this far, but fall back
      // to a generic notice if the engine still rejects the confirmed action.
      let message = 'Cannot complete this action.';
      if (flow.kind === 'move') message = 'Not enough energy to move.';
      else if (flow.kind === 'fakeMove') {
        // The block-onto-enemy-phantom rejection carries a specific message; surface it.
        message = err instanceof Error && /phantom is already there/i.test(err.message)
          ? 'A phantom is already there.'
          : 'Not enough energy to fake move.';
      }
      else if (flow.kind === 'attackTarget') {
        message =
          flow.type === 'punch'
            ? 'Not enough energy to punch.'
            : flow.type === 'shoot'
              ? me.ammo < SHOOT_AMMO_COST
                ? 'Not enough ammo to shoot.'
                : 'Not enough energy to shoot.'
              : me.ammo < BOMB_AMMO_COST
                ? 'Not enough ammo to bomb.'
                : 'Not enough energy to bomb.';
      }
      pushActionNotice(message);
    }
  };

  const startTurn = () => {
    const seq = replayRef.current.length ? replayRef.current : [plainFrame(state, 0)];
    // Show the baseline (turn-start) frame immediately so the viewer sees the actor
    // at their true starting position, held through the lead-in, before anything animates.
    const [baseline, ...rest] = seq;
    setDisplay(baseline.display);
    setRedTints([]);
    setDeathAnims([]);
    setReplayActorId(rest.find((f) => f.actorId)?.actorId ?? baseline.actorId ?? null);
    setPhase('replaying');
    schedule(REPLAY_START_MS, () => {
      playFrames(
        rest,
        () => {
          // Let the final frame settle before handing control to the current player.
          // (turnStartRef/pendingLogRef for this player were already advanced to `next`
          // the moment their turn ended, in applyResult — not here.)
          schedule(REPLAY_END_MS, () => {
            setDisplay(state);
            setRedTints([]);
            setDeathAnims([]);
            replayRef.current = [];
            setReplayActorId(null);
            setFlow({ kind: 'menu' });
            setPhase('playing');
          });
        },
        (f) => {
          if (f.actorId) setReplayActorId(f.actorId);
        }
      );
    });
  };

  const handleSelectAction = (action: 'move' | 'attack' | 'fake' | 'rest') => {
    if (action === 'move') {
      if (!can.move) return pushActionNotice('Not enough energy to move.');
      setFlow({ kind: 'move', path: [] });
    } else if (action === 'attack') {
      if (!can.attack) return pushActionNotice('Not enough energy or ammo to attack.');
      setFlow({ kind: 'attackReposition', path: [] });
    } else if (action === 'fake') {
      if (!can.fake) return pushActionNotice('Not enough energy to fake move.');
      setFlow({ kind: 'fakeMove', target: null });
    } else {
      setFlow({ kind: 'rest' });
    }
  };
  const handleSelectAttackType = (type: AttackType) => {
    if (flow.kind !== 'attackSelect') return;
    try {
      const base = flow.path.length ? movePlayer(state, viewerId, flow.path) : state;
      const p = base.players[viewerId];
      if (type === 'punch' && p.energy < PUNCH_ENERGY_COST) return pushActionNotice('Not enough energy to punch.');
      if (type === 'shoot' && p.ammo < SHOOT_AMMO_COST) return pushActionNotice('Not enough ammo to shoot.');
      if (type === 'bomb' && p.ammo < BOMB_AMMO_COST) return pushActionNotice('Not enough ammo to bomb.');
      setFlow({ kind: 'attackSelect', path: flow.path, type });
    } catch {
      pushActionNotice('Not enough energy to reposition.');
    }
  };
  const handleNext = () => {
    if (flow.kind === 'attackReposition') setFlow({ kind: 'attackSelect', path: flow.path, type: null });
    else if (flow.kind === 'attackSelect' && flow.type) setFlow({ kind: 'attackTarget', type: flow.type, path: flow.path, target: null });
  };
  const handleBack = () => {
    if (flow.kind === 'attackTarget') setFlow({ kind: 'attackSelect', type: flow.type, path: flow.path });
    else if (flow.kind === 'attackSelect') setFlow({ kind: 'attackReposition', path: flow.path });
    else setFlow({ kind: 'menu' });
  };
  const handleCancel = () => setFlow({ kind: 'menu' });

  // Hypothetical energy/ammo if the pending (unconfirmed) action were confirmed.
  // Computed by running the engine on a clone and reading the actor's resources.
  let preview: ResourcePreview | null = null;
  if (interactive) {
    const res = (s: GameState): ResourcePreview => ({
      energy: s.players[viewerId].energy,
      ammo: s.players[viewerId].ammo,
    });
    try {
      if (flow.kind === 'move' && flow.path.length) {
        preview = res(movePlayer(state, viewerId, flow.path));
      } else if (flow.kind === 'rest') {
        preview = res(restPlayer(state, viewerId));
      } else if ((flow.kind === 'attackReposition' || flow.kind === 'attackSelect') && flow.path.length) {
        preview = res(movePlayer(state, viewerId, flow.path));
      } else if (flow.kind === 'attackTarget') {
        const base = flow.path.length ? movePlayer(state, viewerId, flow.path) : state;
        if (flow.path.length) preview = res(base);
        if (flow.target) {
          const from = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
          const t = flow.target;
          const result =
            flow.type === 'punch' ? punch(base, viewerId, t)
              : flow.type === 'shoot' ? shoot(base, viewerId, { x: t.x - from.x, y: t.y - from.y })
                : bomb(base, viewerId, t);
          preview = res(result.state);
        }
      } else if (flow.kind === 'fakeMove' && flow.target) {
        preview = res(
          fakeMove(state, viewerId, { x: flow.target.x - phantomBase.x, y: flow.target.y - phantomBase.y })
        );
      }
    } catch {
      preview = null;
    }
  }

  // Gates the Confirm button's actual `disabled` attribute — reserved for genuinely
  // incomplete steps (no path/target picked yet). Insufficient resources are no
  // longer a hard block: Confirm stays clickable and handleConfirm shows a "not
  // enough X" toast instead, same as the other resource-gated buttons.
  const confirmEnabled =
    (flow.kind === 'move' && flow.path.length >= 1) ||
    (flow.kind === 'fakeMove' && flow.target !== null) ||
    (flow.kind === 'attackTarget' && flow.target !== null) ||
    flow.kind === 'rest';

  const card: React.CSSProperties = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.radius,
    boxShadow: theme.shadow,
  };
  // Ephemeral sliding toast stack — fixed to the top of the viewport so it renders
  // consistently across every phase/screen. Newest notice is prepended, so it
  // appears at the top and pushes earlier ones down, like a real notification feed.
  const noticeStack = (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      {actionNotices.map((n) => (
        <div
          key={n.id}
          style={{
            height: 54,
            boxSizing: 'border-box',
            padding: '0 26px',
            borderRadius: 14,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 0.2,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background:
              n.kind === 'kill'
                ? 'linear-gradient(135deg, #f39c12, #e67e22)'
                : n.kind === 'immune'
                  ? 'linear-gradient(135deg, #3498db, #2470a5)'
                  : n.kind === 'phantom'
                    ? 'linear-gradient(135deg, #9b59b6, #6c3483)'
                    : 'linear-gradient(135deg, #e74c3c, #c0392b)',
            border: '1px solid rgba(255,255,255,0.22)',
            boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
            textShadow: '0 1px 2px rgba(0,0,0,0.35)',
            // Fade+slide in on mount; fade+slide out once flagged `leaving`.
            animation: n.leaving ? 'toastOut 0.34s ease forwards' : 'toastIn 0.34s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden style={{ fontSize: 18 }}>{n.kind === 'kill' ? '💀' : n.kind === 'immune' ? '🛡️' : n.kind === 'phantom' ? '👻' : '⚠️'}</span>
          <span>{renderColoredText(n.text, colorSet)}</span>
        </div>
      ))}
    </div>
  );

  // ---- Handoff screen: nothing about anyone is shown except the public leaderboard ----
  if (phase === 'handoff') {
    const next = state.players[state.currentTurn];
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          padding: 24,
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}
      >
        {menuChrome}
        {noticeStack}
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: theme.textMuted, fontSize: 14, marginBottom: 6 }}>Pass the device — make sure the other player looks away.</div>
          <h1 style={{ fontSize: 44, display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: next.color, display: 'inline-block' }} />
            {next.color.toUpperCase()}'s turn
          </h1>
        </div>
        <div style={{ marginTop: 10, marginBottom: 96 }}>
          {state.mode === 'lastStanding' ? <Lives state={state} /> : <Leaderboard state={state} />}
        </div>
        <button
          onClick={startTurn}
          style={{
            marginTop: 24,
            padding: '14px 32px',
            fontSize: 18,
            fontWeight: 600,
            background: theme.accent,
            border: `1px solid ${theme.accent}`,
            color: '#fff',
            borderRadius: 10,
          }}
        >
          Start turn
        </button>
      </div>
    );
  }

  // ---- Menu (game-type → settings → online lobby) ----
  if (route.kind === 'menu') {
    return (
      <MenuFlow
        initialGameType={route.initialGameType}
        initialScreen={route.initialScreen}
        onStartGame={(nextMode, count, options) => {
          startGame(nextMode, count, options);
          setRoute({ kind: 'game' });
        }}
        onResumeGame={resumeGame}
        onEnterRoom={(config) => setRoute({ kind: 'online', roomId: config.roomId, create: config.create, becomeHost: config.becomeHost, seat: config.seat })}
      />
    );
  }

  // ---- Online route ----
  if (route.kind === 'online') {
    return (
      <OnlineSession
        key={route.roomId}
        roomId={route.roomId}
        create={route.create}
        becomeHost={route.becomeHost}
        seat={route.seat}
        onLeave={() => setRoute({ kind: 'menu', initialGameType: 'online', initialScreen: 'settings' })}
        onEnterRoom={(config) => setRoute({ kind: 'online', roomId: config.roomId, create: config.create, becomeHost: config.becomeHost, seat: config.seat })}
      />
    );
  }

  const barsPlayer = state.players[state.currentTurn];

  // Most recent kill for the phone strip's mini tracker — same text/coloring as
  // the last entry in the full kills feed below, just not wrapped in its own row.
  const lastNotification = notifications[notifications.length - 1];
  const lastKill: ReactNode | null = lastNotification ? (
    <>
      <span style={{ color: lastNotification.killerColor }}>{lastNotification.killerName.toUpperCase()}</span>
      {` ${lastNotification.verb} `}
      <span style={{ color: lastNotification.victimColor }}>{lastNotification.victimName.toUpperCase()}</span>
    </>
  ) : null;

  const killsList =
    notifications.length === 0 ? (
      <div style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic' }}>No kills yet</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {notifications.map((n) => (
          <div key={n.id} style={{ fontSize: 'var(--kills-font, 14px)', fontWeight: 600, color: theme.heading, animation: 'notificationIn 0.25s ease' }}>
            <span style={{ color: n.killerColor }}>{n.killerName.toUpperCase()}</span>
            {` ${n.verb} `}
            <span style={{ color: n.victimColor }}>{n.victimName.toUpperCase()}</span>
          </div>
        ))}
      </div>
    );

  return (
    <div>
      {menuChrome}
      {noticeStack}
      {gameOver && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#000',
            zIndex: 600,
            opacity: winFadeIn ? 1 : 0,
            transition: 'opacity 5s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 28,
            padding: 24,
            boxSizing: 'border-box',
            overflowY: 'auto',
            pointerEvents: winScreenReady ? 'auto' : 'none',
          }}
        >
          {winScreenReady && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 28,
                opacity: winContentIn ? 1 : 0,
                transition: 'opacity 3s ease',
              }}
            >
              <h1 style={{ fontSize: 48, margin: 0, textAlign: 'center' }}>
                {state.draw
                  ? renderColoredText(
                      `${state.draw.map((id) => state.players[id].color.toUpperCase()).join(', ')} Win!`,
                      colorSet
                    )
                  : <>{renderColoredText(state.players[state.winner!].color.toUpperCase(), colorSet)} Wins!</>}
              </h1>
              <div>
                {state.mode === 'lastStanding' ? <Lives state={state} /> : <Leaderboard state={state} />}
              </div>
              <button
                onClick={backToMenu}
                style={{
                  marginTop: 8,
                  padding: '14px 32px',
                  fontSize: 18,
                  fontWeight: 700,
                  background: theme.accent,
                  border: `1px solid ${theme.accent}`,
                  color: '#fff',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                Back to Menu
              </button>
            </div>
          )}
        </div>
      )}
      <GameLayout
        boardRef={boardRef}
        controlsRef={controlsRef}
        title={
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 26 }}>Scavengers</h1>
            <span style={{ color: theme.textMuted, fontSize: 13 }}>
              {mode === 'lastStanding' ? 'Survival' : 'Deathmatch'}
            </span>
          </div>
        }
        standings={state.mode === 'lastStanding' ? <Lives state={state} /> : <Leaderboard state={state} />}
        scoreStrip={
          <ScoreStrip
            state={state}
            onOpenStandings={() => setPhonePanel('standings')}
            onOpenKills={() => setPhonePanel('kills')}
            lastKill={lastKill}
          />
        }
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
            // Keep the fog on the real position while previewing an unconfirmed move,
            // so a player can't "scout" by hovering a move they won't commit.
            visionCenter={interactive ? me.position : undefined}
          />
        }
        controls={
          <div style={{ ...card, width: controlsWidth, boxSizing: 'border-box' }}>
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
                maxMoveTiles={maxMoveTiles}
              />
            )}
          </div>
        }
        killsFeed={
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, boxShadow: theme.shadow, padding: 'var(--kills-pad, 16px)', minWidth: 240, boxSizing: 'border-box' }}>
            <h3 style={{ marginBottom: 10, fontSize: 15 }}>Kills</h3>
            {killsList}
          </div>
        }
      />
      {phonePanel === 'standings' && (
        <Modal title="Standings" onClose={() => setPhonePanel(null)}>
          {state.mode === 'lastStanding' ? <Lives state={state} /> : <Leaderboard state={state} />}
        </Modal>
      )}
      {phonePanel === 'kills' && (
        <Modal title="Kills" onClose={() => setPhonePanel(null)}>{killsList}</Modal>
      )}
    </div>
  );
}

export default App;
