import { useEffect, useRef, useState } from 'react';
import {
  type GameState,
  type GameMode,
  type Position,
  createInitialGameState,
  movePlayer,
  restPlayer,
  fakeMove,
  punch,
  shoot,
  bomb,
  resolveAttack,
  endTurn,
  isInBounds,
  isWall,
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
  traceLine,
} from './engine';
import type { PlayerId } from './engine';
import { Board, type Highlight, type RedTint, type DeathAnim } from './components/Board';
import { ResourceBars, type ResourcePreview } from './components/ResourceBars';
import { Leaderboard } from './components/Leaderboard';
import { Lives } from './components/Lives';
import { ControlPanel, type Flow, type AttackType, type Capabilities } from './components/ControlPanel';
import { theme } from './theme';

const RESULT_MS = 1900; // how long the acting player sees their outcome (energy/ammo) before handoff
const REPLAY_START_MS = 900; // pause before the replay begins, so the board can register
const REPLAY_END_MS = 900; // pause after the replay finishes, before control is handed over
const MOVE_STEP_MS = 550; // hold time for an intermediate step of a 2-tile move
const DEATH_OUT_MS = 900; // hold time for the death fade-out frame
const DEATH_IN_MS = 1100; // hold time for the death fade-in (respawn) frame
const TINT_FADE_MS = 160; // per-tile fade-in duration (must match Board's redTintOn animation)
const TINT_STEP = 95; // per-tile stagger: tiles light up one after another, fast, and STAY lit
const TINT_HOLD_MS = 300; // dwell with every tile lit before they all clear together

type Phase = 'playing' | 'result' | 'handoff' | 'replaying';

// A single step of an animated sequence: the board/player state to show, the tint
// overlays and death-fade info active during this step, and how long to hold it
// before advancing. Live 'result' play and the opponent-turn replay both consume
// the same AnimFrame[] via `playFrames`, so movement steps tile-by-tile and the
// attack ripple / death fade appear identically in both.
interface AnimFrame {
  display: GameState;
  redTints: RedTint[];
  death: DeathAnim[];
  holdMs: number;
}

const plainFrame = (display: GameState, holdMs: number): AnimFrame => ({ display, redTints: [], death: [], holdMs });

const DIRS8: Position[] = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
];

const eq = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

function neighbors(board: GameState['board'], from: Position): Position[] {
  return DIRS8.map((d) => ({ x: from.x + d.x, y: from.y + d.y })).filter(
    (p) => isInBounds(p) && !isWall(board, p)
  );
}

function rayTiles(from: Position): Position[] {
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
// Shared by the final one-shot attack ripple and the live "preview the shot"
// flashing highlight shown while the player is still choosing a target.
function computeHitTiles(board: GameState['board'], type: AttackType, from: Position, target: Position): Position[] {
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
  // punch: the targeted ring tile plus its two neighbors in the ring of 8 around
  // the attack origin — mirrors the engine's 3-tile hit exactly.
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

// Simulates energy remaining after walking `path` from `startEnergy`, subtracting
// MOVE_ENERGY_COST_PER_TILE per step and refunding ENERGY_PICKUP_VALUE (clamped to
// MAX_ENERGY) when a step lands on an energyPickup tile. Used to decide whether a
// further move/reposition step can still be highlighted.
function simulateEnergyAfterPath(board: GameState['board'], startEnergy: number, path: Position[]): number {
  let energy = startEnergy;
  for (const p of path) {
    energy -= MOVE_ENERGY_COST_PER_TILE;
    const tile = board[p.y]?.[p.x];
    if (tile && tile.type === 'energyPickup') {
      energy = Math.min(MAX_ENERGY, energy + ENERGY_PICKUP_VALUE);
    }
  }
  return energy;
}

function useCellSize(): number {
  const compute = () =>
    Math.max(28, Math.min(68, Math.floor(Math.min(window.innerWidth - 620, window.innerHeight - 140) / GRID_SIZE)));
  const [size, setSize] = useState(compute);
  useEffect(() => {
    const onResize = () => setSize(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function App() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [mode, setMode] = useState<GameMode>('lastStanding');
  const [playerCount, setPlayerCount] = useState<number>(2);
  const [connectivity, setConnectivity] = useState<'local'>('local');
  const [state, setState] = useState<GameState>(() => createInitialGameState('lastStanding', 2));
  const [display, setDisplay] = useState<GameState>(state);
  const [phase, setPhase] = useState<Phase>('playing');
  const [flow, setFlow] = useState<Flow>({ kind: 'menu' });
  const cellSize = useCellSize();

  // Persistent, stacked kill notifications shown top-right of the screen. Never
  // auto-dismissed — new kills are appended underneath older ones.
  const [notifications, setNotifications] = useState<
    { id: number; killerColor: string; killerName: string; victimColor: string; victimName: string; verb: string }[]
  >([]);
  const notificationIdRef = useRef(0);

  // Ephemeral sliding toast feed — independent of the persistent Kills panel above.
  // Used for "not enough X to Y" warnings and kill/extra-turn announcements. Each
  // entry auto-dismisses on its own timer, and spamming the trigger just stacks
  // more toasts (newest on top), like a real notification feed.
  const [actionNotices, setActionNotices] = useState<{ id: number; text: string; kind: 'warning' | 'kill'; leaving?: boolean }[]>([]);
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

  const pushActionNotice = (text: string, kind: 'warning' | 'kill' = 'warning') => {
    const id = actionNoticeIdRef.current++;
    setActionNotices((list) => [{ id, text, kind }, ...list]);
    // Two-stage dismissal: flip to `leaving` (plays the fade-out keyframe), then
    // remove from the DOM once that animation has finished.
    schedule(2600, () => {
      setActionNotices((list) => list.map((n) => (n.id === id ? { ...n, leaving: true } : n)));
      schedule(360, () => {
        setActionNotices((list) => list.filter((n) => n.id !== id));
      });
    });
  };

  const gameOver = state.winner !== null;
  const viewerId = state.currentTurn;
  const me = state.players[viewerId];
  const others = state.turnOrder.filter((id) => id !== viewerId).map((id) => state.players[id]);
  const interactive = phase === 'playing' && !gameOver;

  const startGame = (nextMode: GameMode, count: number) => {
    clearTimers();
    const s = createInitialGameState(nextMode, count);
    setMode(nextMode);
    setPlayerCount(count);
    setState(s);
    setDisplay(s);
    setPhase('playing');
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
  };

  const backToMenu = () => {
    clearTimers();
    setPhase('playing');
    setScreen('menu');
  };

  const can: Capabilities = {
    move: me.energy >= MOVE_ENERGY_COST_PER_TILE,
    punch: me.energy >= PUNCH_ENERGY_COST,
    shoot: me.ammo >= SHOOT_AMMO_COST && me.energy >= ATTACK_ENERGY_COST,
    bomb: me.ammo >= BOMB_AMMO_COST && me.energy >= ATTACK_ENERGY_COST,
    attack: me.energy >= ATTACK_ENERGY_COST,
    fake: me.energy >= PHANTOM_ENERGY_COST,
  };

  // The base a fake move projects from: an existing phantom keeps accumulating from
  // its current display position, not from the real player.
  const phantomBase = me.isPhantom && me.phantomDisplayPosition ? me.phantomDisplayPosition : me.position;

  // ---- Highlights + click targeting (only while interactive) ----
  const highlights: Highlight[] = [];
  if (interactive) {
    if (flow.kind === 'move') {
      const cursor = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
      const remainingEnergy = simulateEnergyAfterPath(state.board, me.energy, flow.path);
      if (flow.path.length < 2 && remainingEnergy >= 1) {
        for (const p of neighbors(state.board, cursor)) {
          if (eq(p, me.position)) continue;
          if (others.some((o) => eq(p, o.position))) continue;
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
          if (others.some((o) => eq(p, o.position))) continue;
          if (flow.path.some((s) => eq(s, p))) continue;
          highlights.push({ x: p.x, y: p.y, kind: 'candidate' });
        }
      }
      flow.path.forEach((p) => highlights.push({ x: p.x, y: p.y, kind: 'selected' }));
    } else if (flow.kind === 'attackTarget') {
      const from = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
      const candidates = flow.type === 'bomb' ? rayTiles(from) : neighbors(state.board, from);
      for (const p of candidates) highlights.push({ x: p.x, y: p.y, kind: 'candidate' });
      if (flow.target) highlights.push({ x: flow.target.x, y: flow.target.y, kind: 'selected' });
    }
  }
  const selectedKeys = new Set(highlights.filter((h) => h.kind === 'selected').map((h) => `${h.x},${h.y}`));
  const dedupedHighlights = highlights.filter((h) => h.kind === 'selected' || !selectedKeys.has(`${h.x},${h.y}`));
  const isCandidate = (pos: Position) => dedupedHighlights.some((h) => h.x === pos.x && h.y === pos.y);

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
    boardState = {
      ...display,
      players: {
        ...display.players,
        [viewerId]: { ...display.players[viewerId], position: previewPos },
      },
    };
  }

  const handleTileClick = (pos: Position) => {
    if (!interactive) return;
    if (flow.kind === 'move') {
      const last = flow.path[flow.path.length - 1];
      if (last && eq(last, pos)) setFlow({ kind: 'move', path: flow.path.slice(0, -1) });
      else if (isCandidate(pos)) setFlow({ kind: 'move', path: [...flow.path, pos] });
    } else if (flow.kind === 'fakeMove') {
      if (flow.target && eq(flow.target, pos)) setFlow({ kind: 'fakeMove', target: null });
      else if (isCandidate(pos)) setFlow({ kind: 'fakeMove', target: pos });
    } else if (flow.kind === 'attackReposition') {
      const last = flow.path[flow.path.length - 1];
      if (last && eq(last, pos)) setFlow({ kind: 'attackReposition', path: flow.path.slice(0, -1) });
      else if (isCandidate(pos)) setFlow({ kind: 'attackReposition', path: [...flow.path, pos] });
    } else if (flow.kind === 'attackTarget') {
      if (flow.target && eq(flow.target, pos)) setFlow({ kind: 'attackTarget', type: flow.type, path: flow.path, target: null });
      else if (isCandidate(pos)) setFlow({ kind: 'attackTarget', type: flow.type, path: flow.path, target: pos });
    }
  };

  // Plays an AnimFrame[] sequence through the shared display/redTints/deathAnim state,
  // holding each frame for its holdMs before advancing, then calls onDone.
  const playFrames = (frames: AnimFrame[], onDone: () => void) => {
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
    actorLogRef.current.push(...frames);
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

      // One combined toast covers double/triple kills too, instead of one per victim.
      const victimNames = victims.map((v) => acted.players[v.victimId].color.toUpperCase());
      const killMsg =
        next.winner === null
          ? `Killed ${victimNames.join(', ')} — +1 extra turn!`
          : `Killed ${victimNames.join(', ')}!`;
      // Delay so the toast appears only once the ripple has lit the victim's square.
      schedule(killNoticeDelayMs, () => pushActionNotice(killMsg, 'kill'));
    }

    playFrames(frames, () => {
      setState(next);
      setDisplay(next);
      setDeathAnims([]);
      setRedTints([]);
      if (next.winner !== null) {
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
        setPhase('handoff');
      } else {
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
        const acted = movePlayer(state, actorId, flow.path);
        const next = endTurn(acted, actorId, false);
        // Snap back to the real starting tile first (the live preview while building
        // the path already showed the destination), then step through the path so the
        // whole movement plays out instead of jumping straight there.
        const frames: AnimFrame[] = [plainFrame(state, MOVE_STEP_MS)];
        if (flow.path.length === 2) {
          const mid = movePlayer(state, actorId, [flow.path[0]]);
          frames.push(plainFrame(mid, MOVE_STEP_MS));
          frames.push(plainFrame(acted, Math.max(MOVE_STEP_MS, RESULT_MS - 2 * MOVE_STEP_MS)));
        } else {
          frames.push(plainFrame(acted, Math.max(MOVE_STEP_MS, RESULT_MS - MOVE_STEP_MS)));
        }
        applyResult(acted, next, true, frames);
      } else if (flow.kind === 'rest') {
        const acted = restPlayer(state, actorId);
        applyResult(acted, endTurn(acted, actorId, false), true, [plainFrame(acted, RESULT_MS)]);
      } else if (flow.kind === 'fakeMove' && flow.target) {
        const dir = { x: flow.target.x - phantomBase.x, y: flow.target.y - phantomBase.y };
        const acted = fakeMove(state, actorId, dir);
        applyResult(acted, endTurn(acted, actorId, false), true, [plainFrame(acted, RESULT_MS)]);
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

        applyResult(acted, next, !gotKill, frames, victims, killNoticeDelayMs);
      }
    } catch (err) {
      console.error(err);
      // The pre-flight checks in handleSelectAction/handleSelectAttackType catch
      // insufficient resources before the player even gets this far, but fall back
      // to a generic notice if the engine still rejects the confirmed action.
      let message = 'Cannot complete this action.';
      if (flow.kind === 'move') message = 'Not enough energy to move.';
      else if (flow.kind === 'fakeMove') message = 'Not enough energy to fake move.';
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
    setPhase('replaying');
    schedule(REPLAY_START_MS, () => {
      playFrames(rest, () => {
        // Let the final frame settle before handing control to the current player.
        // (turnStartRef/pendingLogRef for this player were already advanced to `next`
        // the moment their turn ended, in applyResult — not here.)
        schedule(REPLAY_END_MS, () => {
          setDisplay(state);
          setRedTints([]);
          setDeathAnims([]);
          replayRef.current = [];
          setFlow({ kind: 'menu' });
          setPhase('playing');
        });
      });
    });
  };

  const handleSelectAction = (action: 'move' | 'attack' | 'fake' | 'rest') => {
    if (action === 'move') {
      if (!can.move) return pushActionNotice('Not enough energy to move.');
      setFlow({ kind: 'move', path: [] });
    } else if (action === 'attack') {
      if (!can.attack) return pushActionNotice('Not enough energy to attack.');
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
  const boardWidth = GRID_SIZE * cellSize + 12;
  const columnWidth = Math.max(boardWidth, 320);

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
                : 'linear-gradient(135deg, #e74c3c, #c0392b)',
            border: '1px solid rgba(255,255,255,0.22)',
            boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
            textShadow: '0 1px 2px rgba(0,0,0,0.35)',
            // Fade+slide in on mount; fade+slide out once flagged `leaving`.
            animation: n.leaving ? 'toastOut 0.34s ease forwards' : 'toastIn 0.34s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden style={{ fontSize: 18 }}>{n.kind === 'kill' ? '💀' : '⚠️'}</span>
          {n.text}
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
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          padding: 24,
          boxSizing: 'border-box',
        }}
      >
        {noticeStack}
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: theme.textMuted, fontSize: 14, marginBottom: 6 }}>Pass the device — make sure the other player looks away.</div>
          <h1 style={{ fontSize: 44, display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: next.color, display: 'inline-block' }} />
            {next.color.toUpperCase()}'s turn
          </h1>
        </div>
        <div style={{ transform: 'scale(1.35)', transformOrigin: 'top center', marginTop: 10, marginBottom: 96 }}>
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

  // ---- Main menu screen ----
  if (screen === 'menu') {
    const rowLabel: React.CSSProperties = { fontSize: 13, color: theme.textMuted, marginBottom: 8, fontWeight: 600 };
    const toggleBtn = (active: boolean, disabled: boolean): React.CSSProperties => ({
      padding: '10px 18px',
      margin: '0 8px 0 0',
      fontSize: 14,
      fontWeight: 500,
      borderRadius: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: disabled ? theme.surfaceAlt : active ? theme.accentSoft : theme.surface,
      border: `1px solid ${disabled ? theme.border : active ? theme.accent : theme.border}`,
      color: disabled ? theme.textMuted : active ? theme.accentText : theme.text,
      opacity: disabled ? 0.6 : 1,
    });
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          padding: 24,
          boxSizing: 'border-box',
        }}
      >
        <h1 style={{ fontSize: 44 }}>Scavengers</h1>

        <div style={{ ...card, padding: 28, display: 'flex', flexDirection: 'column', gap: 22, minWidth: 360 }}>
          <div>
            <div style={rowLabel}>Players</div>
            <div>
              <button style={toggleBtn(playerCount === 2, false)} onClick={() => setPlayerCount(2)}>2 Players</button>
              <button style={toggleBtn(playerCount === 4, false)} onClick={() => setPlayerCount(4)}>4 Players</button>
            </div>
          </div>

          <div>
            <div style={rowLabel}>Mode</div>
            <div>
              <button style={toggleBtn(mode === 'deathmatch', false)} onClick={() => setMode('deathmatch')}>Deathmatch</button>
              <button style={toggleBtn(mode === 'lastStanding', false)} onClick={() => setMode('lastStanding')}>Last Player Standing</button>
            </div>
          </div>

          <div>
            <div style={rowLabel}>Opponents</div>
            <div>
              <button style={toggleBtn(connectivity === 'local', false)} onClick={() => setConnectivity('local')}>
                Local (Pass &amp; Play)
              </button>
              <button style={toggleBtn(false, true)} disabled title="Coming soon">
                Online — Coming soon
              </button>
              <button style={toggleBtn(false, true)} disabled title="Coming soon">
                Bots — Coming soon
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            startGame(mode, playerCount);
            setScreen('game');
          }}
          style={{
            marginTop: 8,
            padding: '16px 40px',
            fontSize: 18,
            fontWeight: 700,
            background: theme.accent,
            border: `1px solid ${theme.accent}`,
            color: '#fff',
            borderRadius: 10,
            cursor: 'pointer',
          }}
        >
          Start Game
        </button>
      </div>
    );
  }

  const barsPlayer = state.players[state.currentTurn];

  return (
    <div style={{ minHeight: '100vh', padding: 24, boxSizing: 'border-box' }}>
      {noticeStack}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26 }}>Scavengers</h1>
        <span style={{ color: theme.textMuted, fontSize: 13 }}>
          {mode === 'lastStanding' ? 'Last Standing' : 'Deathmatch'}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={backToMenu}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 8,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              color: theme.textMuted,
              cursor: 'pointer',
            }}
          >
            Menu
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
        {state.mode === 'lastStanding' ? <Lives state={state} /> : <Leaderboard state={state} />}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {gameOver ? (
            <div style={{ width: columnWidth, boxSizing: 'border-box', padding: '12px 16px', borderRadius: theme.radius, background: theme.accentSoft, color: theme.accentText, fontWeight: 700, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <span>Player {state.players[state.winner!].color.toUpperCase()} wins!</span>
              <button
                onClick={backToMenu}
                style={{
                  padding: '8px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  background: theme.accent,
                  border: `1px solid ${theme.accent}`,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Back to Menu
              </button>
            </div>
          ) : phase === 'replaying' ? (
            <div style={{ width: columnWidth, boxSizing: 'border-box', padding: '12px 16px', borderRadius: theme.radius, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.textMuted, textAlign: 'center' }}>
              Replaying the opponent's turn…
            </div>
          ) : (
            <ResourceBars player={barsPlayer} width={columnWidth} preview={preview} />
          )}

          <div style={{ position: 'relative' }}>
            <Board
              state={boardState}
              viewerId={viewerId}
              cellPixelSize={cellSize}
              highlights={interactive ? dedupedHighlights : []}
              onTileClick={interactive ? handleTileClick : undefined}
              redTints={redTints}
              deathAnims={deathAnims}
              previewTints={interactive ? previewHitTiles : []}
            />
          </div>

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
              />
            )}
          </div>
        </div>

        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
            boxShadow: theme.shadow,
            padding: 16,
            minWidth: 240,
            boxSizing: 'border-box',
          }}
        >
          <h3 style={{ marginBottom: 10, fontSize: 15 }}>Kills</h3>
          {notifications.length === 0 ? (
            <div style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic' }}>No kills yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: theme.heading,
                    animation: 'notificationIn 0.25s ease',
                  }}
                >
                  <span style={{ color: n.killerColor }}>{n.killerName.toUpperCase()}</span>
                  {` ${n.verb} `}
                  <span style={{ color: n.victimColor }}>{n.victimName.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
