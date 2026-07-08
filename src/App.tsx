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
const TINT_PULSE_MS = 500; // must match the redTintPulse CSS animation duration
const TINT_STEP = TINT_PULSE_MS; // per-tile delay step for sequential (one-at-a-time) tints

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
  // Death/respawn choreography for all victims of an attack: each fades out at its
  // death spot, then (if not eliminated) fades/pops back in at its respawn spot.
  const [deathAnims, setDeathAnims] = useState<DeathAnim[]>([]);
  // Red-tint ripple overlays for shoot/bomb/punch, cleared at the end of the result phase.
  const [redTints, setRedTints] = useState<RedTint[]>([]);

  // Replay bookkeeping (kept in refs so React StrictMode double-render can't duplicate them).
  const actorLogRef = useRef<AnimFrame[]>([]); // the current actor's action frames, accumulated
  const turnStartRef = useRef<GameState>(state); // board as the upcoming viewer last saw it
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
    actorLogRef.current = [];
    turnStartRef.current = s;
    replayRef.current = [];
  };

  const backToMenu = () => {
    clearTimers();
    setPhase('playing');
    setScreen('menu');
  };

  const can: Capabilities = {
    move: me.energy >= 1,
    punch: me.energy >= 1,
    shoot: me.energy >= 1,
    bomb: me.energy >= 1,
    attack: me.energy >= 1,
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
    } else if (flow.kind === 'attackMove') {
      const cursor = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
      // Allow a reposition step as long as the step itself is affordable (a step onto
      // an energy pickup can fund further steps); affordability of the attack itself
      // is enforced separately at Confirm time.
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

  const handleTileClick = (pos: Position) => {
    if (!interactive) return;
    if (flow.kind === 'move') {
      const last = flow.path[flow.path.length - 1];
      if (last && eq(last, pos)) setFlow({ kind: 'move', path: flow.path.slice(0, -1) });
      else if (isCandidate(pos)) setFlow({ kind: 'move', path: [...flow.path, pos] });
    } else if (flow.kind === 'fakeMove') {
      if (flow.target && eq(flow.target, pos)) setFlow({ kind: 'fakeMove', target: null });
      else if (isCandidate(pos)) setFlow({ kind: 'fakeMove', target: pos });
    } else if (flow.kind === 'attackMove') {
      const last = flow.path[flow.path.length - 1];
      if (last && eq(last, pos)) setFlow({ kind: 'attackMove', type: flow.type, path: flow.path.slice(0, -1) });
      else if (isCandidate(pos)) setFlow({ kind: 'attackMove', type: flow.type, path: [...flow.path, pos] });
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
    victims: { victimId: PlayerId; deathPos: Position; respawnPos: Position | null; verb: string }[] = []
  ) => {
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
    }

    playFrames(frames, () => {
      setState(next);
      setDisplay(next);
      setDeathAnims([]);
      setRedTints([]);
      if (next.winner !== null) {
        setPhase('playing'); // game over screen
      } else if (turnPasses) {
        replayRef.current = [plainFrame(turnStartRef.current, 0), ...actorLogRef.current];
        actorLogRef.current = [];
        setPhase('handoff');
      } else {
        setPhase('playing'); // extra turn — same actor keeps going
      }
    });
  };

  // Builds the death-fade frames for ALL victims of an attack, animated together:
  // one frame with everyone fading out at their death spot, then (only if at least
  // one victim respawns) a second frame with respawning victims fading back in.
  // Eliminated victims (respawnPos null) appear only in the 'out' frame.
  const buildDeathFrames = (
    afterState: GameState,
    victims: { victimId: PlayerId; deathPos: Position; respawnPos: Position | null }[]
  ): AnimFrame[] => {
    const outFrame: AnimFrame = {
      display: afterState,
      redTints: [],
      death: victims.map((v) => ({ playerId: v.victimId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'out' as const })),
      holdMs: DEATH_OUT_MS,
    };
    const respawning = victims.filter((v) => v.respawnPos !== null);
    const frames: AnimFrame[] = [outFrame];
    if (respawning.length) {
      frames.push({
        display: afterState,
        redTints: [],
        death: respawning.map((v) => ({ playerId: v.victimId, deathPos: v.deathPos, respawnPos: v.respawnPos, stage: 'in' as const })),
        holdMs: DEATH_IN_MS,
      });
    }
    return frames;
  };

  const handleConfirm = () => {
    if (!interactive) return;
    const actorId = state.currentTurn;
    setRedTints([]);
    try {
      if (flow.kind === 'move') {
        const acted = movePlayer(state, actorId, flow.path);
        const next = endTurn(acted, actorId, false);
        const frames: AnimFrame[] = [];
        if (flow.path.length === 2) {
          const mid = movePlayer(state, actorId, [flow.path[0]]);
          frames.push(plainFrame(mid, MOVE_STEP_MS));
          frames.push(plainFrame(acted, Math.max(MOVE_STEP_MS, RESULT_MS - MOVE_STEP_MS)));
        } else {
          frames.push(plainFrame(acted, RESULT_MS));
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

        // Compute the red-tint ripple tiles for this attack, staggered by wave/index.
        // Delays are deliberately long/spaced so the ripple reads as a sequence, not a flash.
        const tints: RedTint[] = [];
        if (flow.type === 'shoot') {
          const dir = { x: t.x - from.x, y: t.y - from.y };
          const line = traceLine(state.board, from, dir);
          // One tile lit at a time, closest first: step the delay by at least the full
          // pulse duration so no two tiles are ever lit simultaneously.
          line.forEach((p, i) => tints.push({ x: p.x, y: p.y, delayMs: i * TINT_STEP }));
        } else if (flow.type === 'bomb') {
          tints.push({ x: t.x, y: t.y, delayMs: 0 });
          for (const d of DIRS8) {
            const p = { x: t.x + d.x, y: t.y + d.y };
            if (isInBounds(p)) tints.push({ x: p.x, y: p.y, delayMs: 450 });
          }
        } else if (flow.type === 'punch') {
          // Punch hits the targeted ring tile plus its two neighbors in the ring of 8
          // around the attack origin — mirror the engine's 3-tile hit exactly.
          const ringIdx = DIRS8.findIndex((d) => eq({ x: from.x + d.x, y: from.y + d.y }, t));
          const idxs = ringIdx === -1 ? [] : [(ringIdx - 1 + 8) % 8, ringIdx, (ringIdx + 1) % 8];
          for (const k of idxs) {
            const d = DIRS8[k];
            const p = { x: from.x + d.x, y: from.y + d.y };
            if (isInBounds(p)) tints.push({ x: p.x, y: p.y, delayMs: 0 });
          }
        }
        const maxTintDelay = tints.reduce((m, t2) => Math.max(m, t2.delayMs), 0);
        const attackHoldMs = Math.max(RESULT_MS, maxTintDelay + TINT_PULSE_MS);

        const frames: AnimFrame[] = [];
        if (flow.path.length) {
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
          // Attack frame's hold only needs to cover the ripple; the death frames follow.
          frames.push({ display: acted, redTints: tints, death: [], holdMs: maxTintDelay + TINT_PULSE_MS });
          frames.push(...buildDeathFrames(acted, victims));
        } else {
          frames.push({ display: acted, redTints: tints, death: [], holdMs: attackHoldMs });
        }

        applyResult(acted, next, !gotKill, frames, victims);
      }
    } catch (err) {
      console.error(err);
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
        schedule(REPLAY_END_MS, () => {
          setDisplay(state);
          setRedTints([]);
          setDeathAnims([]);
          turnStartRef.current = state;
          replayRef.current = [];
          setFlow({ kind: 'menu' });
          setPhase('playing');
        });
      });
    });
  };

  const handleSelectAction = (action: 'move' | 'attack' | 'fake' | 'rest') => {
    if (action === 'move') setFlow({ kind: 'move', path: [] });
    else if (action === 'attack') setFlow({ kind: 'attackSelect', type: null });
    else if (action === 'fake') setFlow({ kind: 'fakeMove', target: null });
    else setFlow({ kind: 'rest' });
  };
  const handleSelectAttackType = (type: AttackType) => setFlow({ kind: 'attackSelect', type });
  const handleNext = () => {
    if (flow.kind === 'attackSelect' && flow.type) setFlow({ kind: 'attackMove', type: flow.type, path: [] });
    else if (flow.kind === 'attackMove') setFlow({ kind: 'attackTarget', type: flow.type, path: flow.path, target: null });
  };
  const handleBack = () => {
    if (flow.kind === 'attackTarget') setFlow({ kind: 'attackMove', type: flow.type, path: flow.path });
    else if (flow.kind === 'attackMove') setFlow({ kind: 'attackSelect', type: flow.type });
    else setFlow({ kind: 'menu' });
  };
  const handleCancel = () => setFlow({ kind: 'menu' });

  // Hypothetical energy/ammo if the pending (unconfirmed) action were confirmed.
  // Computed by running the engine on a clone and reading the actor's resources.
  // Also doubles as the affordability check for attackTarget: if the engine attack
  // throws on the post-reposition state, the action isn't actually confirmable yet
  // (e.g. still not enough ammo/energy even after the chosen reposition).
  let preview: ResourcePreview | null = null;
  let attackConfirmable = false;
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
      } else if (flow.kind === 'attackMove' && flow.path.length) {
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
          attackConfirmable = true;
        }
      } else if (flow.kind === 'fakeMove' && flow.target) {
        preview = res(
          fakeMove(state, viewerId, { x: flow.target.x - phantomBase.x, y: flow.target.y - phantomBase.y })
        );
      }
    } catch {
      preview = null;
      attackConfirmable = false;
    }
  }

  const confirmEnabled =
    (flow.kind === 'move' && flow.path.length >= 1) ||
    (flow.kind === 'fakeMove' && flow.target !== null) ||
    (flow.kind === 'attackTarget' && flow.target !== null && attackConfirmable) ||
    flow.kind === 'rest';

  const card: React.CSSProperties = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.radius,
    boxShadow: theme.shadow,
  };
  const boardWidth = GRID_SIZE * cellSize + 12;
  const columnWidth = Math.max(boardWidth, 320);

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
              state={display}
              viewerId={viewerId}
              cellPixelSize={cellSize}
              highlights={interactive ? dedupedHighlights : []}
              onTileClick={interactive ? handleTileClick : undefined}
              redTints={redTints}
              deathAnims={deathAnims}
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
