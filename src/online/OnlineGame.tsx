import { type ReactNode, Fragment, useEffect, useRef, useState } from 'react';
import {
  type GameState,
  type Position,
  type PlayerId,
  movePlayer,
  restPlayer,
  fakeMove,
  punch,
  shoot,
  bomb,
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
} from '../engine';
import { Board, type Highlight, type HighlightKind, type RedTint, type DeathAnim } from '../components/Board';
import { ResourceBars, type ResourcePreview } from '../components/ResourceBars';
import { Leaderboard, ScoringNote } from '../components/Leaderboard';
import { Lives } from '../components/Lives';
import { ControlPanel, type Flow, type AttackType, type Capabilities } from '../components/ControlPanel';
import { GameLayout } from '../components/GameLayout';
import { ScoreStrip } from '../components/ScoreStrip';
import { standingsLabel } from '../components/standingsLabel';
import { Modal } from '../components/Modal';
import { useBoardColumn } from '../layout/useBoardColumn';
import { useElementWidth } from '../layout/useElementWidth';
import { SPAWN_TINT, theme } from '../theme';
import {
  type AnimFrame,
  DIRS8,
  eq,
  neighbors,
  rayTiles,
  computeHitTiles,
} from '../game/animation';
import type { OnlineRoom } from './useOnlineRoom';
import { planTransition } from './transition';
import { flowToRequest } from './flowToRequest';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ActionEvent } from './protocol';
import type { EnterRoomConfig } from '../components/menu/MenuFlow';
import { generateRoomCode } from './roomCode';

// A player's name tinted with THAT player's color. Keyed by playerId (not by the text),
// so duplicate names still each get their own color — the whole point of allowing dupes.
function colorName(id: PlayerId, text: string, s: GameState): ReactNode {
  return (
    <span key={id} style={{ color: s.players[id].color, fontWeight: 800, textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}>
      {text}
    </span>
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

export function OnlineGame({
  room,
  onLeave,
  onEnterRoom,
  isHost,
  introDone = true,
}: {
  room: OnlineRoom;
  onLeave: () => void;
  onEnterRoom: (config: EnterRoomConfig) => void;
  isHost: boolean;
  // False while the start-of-game fade/title intro (owned by OnlineSession) is still
  // playing; the first-turn randomizer waits until it flips true.
  introDone?: boolean;
}) {
  const [flow, setFlow] = useState<Flow>({ kind: 'menu' });
  const [display, setDisplay] = useState<GameState | null>(room.state);
  const [redTints, setRedTints] = useState<RedTint[]>([]);
  const [deathAnims, setDeathAnims] = useState<DeathAnim[]>([]);
  const [animating, setAnimating] = useState(false);
  const [sending, setSending] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Phone breakpoint only: which side panel (normally shown inline) is open as a modal.
  const [phonePanel, setPhonePanel] = useState<'standings' | 'scoring' | 'kills' | null>(null);
  const { ref: boardRef, cellSize, columnWidth } = useBoardColumn();
  // The controls column lives in its own grid track (see GameLayout), so it needs its
  // own width measurement — columnWidth above tracks the board, which ResourceBars
  // still aligns to, but is no longer the controls panel's width.
  const { ref: controlsRef, width: controlsWidth } = useElementWidth();

  const [notifications, setNotifications] = useState<
    { id: number; killerId: PlayerId; victimId: PlayerId; verb: string }[]
  >([]);
  const notificationIdRef = useRef(0);

  const [actionNotices, setActionNotices] = useState<{ id: number; content: ReactNode; kind: 'warning' | 'kill' | 'immune' | 'phantom'; leaving?: boolean }[]>([]);
  const actionNoticeIdRef = useRef(0);

  // Random-first-turn reveal overlay: runs once on mount (which always coincides with a
  // fresh gameStart, since OnlineSession only mounts OnlineGame once phase leaves 'lobby'
  // and keeps the same instance across pause/resume). `room.state` is already non-null by
  // the time this component mounts (OnlineSession only renders it once phase !== 'lobby'),
  // so an empty dependency array is correct here — and required: a ref-guarded `[room.state]`
  // effect breaks under StrictMode's mount→cleanup→remount, since the cleanup from the first
  // (dev-only) invocation cancels the timers and the guard then blocks the second invocation
  // from re-arming them, leaving the overlay stuck forever.
  const [revealing, setRevealing] = useState(true);
  const [highlightId, setHighlightId] = useState<PlayerId | null>(null);
  const [revealLanded, setRevealLanded] = useState(false);


  // Win sequence: fade to black slowly, then reveal the win screen.
  const winnerId = room.state?.winner ?? null;
  // Non-null on a survival draw (everyone caught in one final blast). Drives the same
  // win sequence as a normal win, but the screen lists every finalist.
  const drawIds = room.state?.draw ?? null;
  const gameEnded = winnerId !== null || drawIds != null;
  const [winFadeIn, setWinFadeIn] = useState(false);
  const [winScreen, setWinScreen] = useState(false);
  const [winContentIn, setWinContentIn] = useState(false);
  useEffect(() => {
    // Wait for the kill/death animation to finish playing before starting the fade,
    // so the win screen never covers a still-animating board. Then the board fades to
    // black over 5s, and only after that does the win screen fade in over 3s.
    if (!gameEnded || animating) return;
    const t1 = window.setTimeout(() => setWinFadeIn(true), 50);
    const t2 = window.setTimeout(() => setWinScreen(true), 5050);
    const t3 = window.setTimeout(() => setWinContentIn(true), 5100);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [gameEnded, animating]);

  // The host's "End Match" (from the reconnecting screen) ends the game with no winner;
  // send everyone back to the menu instead of leaving them on a blank over-state screen.
  useEffect(() => {
    if (room.phase === 'over' && room.state && room.state.winner === null && room.state.draw == null) onLeave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.phase]);

  useEffect(() => {
    if (!introDone) return; // wait for the start-of-game fade/title intro to finish first
    const initialState = room.state;
    if (!initialState) return;
    const order = initialState.turnOrder;
    let i = 0;
    setHighlightId(order[0]);
    const interval = window.setInterval(() => {
      i = (i + 1) % order.length;
      setHighlightId(order[i]);
    }, 120);
    // Cycle for a while, then land on the chosen player and hold them highlighted for
    // a couple seconds so it's clear who was picked before the game begins.
    const stop = window.setTimeout(() => {
      window.clearInterval(interval);
      setHighlightId(initialState.currentTurn);
      setRevealLanded(true);
    }, 2800);
    const dismiss = window.setTimeout(() => setRevealing(false), 5000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
      window.clearTimeout(dismiss);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introDone]);

  const prevStateRef = useRef<GameState | null>(null);
  const processedEventRef = useRef<ActionEvent | null>(null);
  // Two separate timer pools, deliberately. `timersRef` holds notification lifecycles
  // (a toast's 4.8s dismiss, a delayed kill message) which must survive regardless of
  // what the board is doing. `animTimersRef` holds ONLY the frame-advance timers of the
  // animation currently playing, so an event arriving mid-animation can cancel that
  // animation without also wiping every pending toast off the screen.
  const timersRef = useRef<number[]>([]);
  const animTimersRef = useRef<number[]>([]);

  const schedule = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };
  const scheduleAnim = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    animTimersRef.current.push(id);
  };
  // Abandons the in-flight frame sequence. Its onDone never runs, so whatever calls
  // this owns setting display/prevStateRef/animating to a coherent place afterwards.
  const clearAnimTimers = () => {
    animTimersRef.current.forEach(clearTimeout);
    animTimersRef.current = [];
  };
  useEffect(() => () => { clearTimers(); clearAnimTimers(); }, []);

  const pushActionNotice = (content: ReactNode, kind: 'warning' | 'kill' | 'immune' | 'phantom' = 'warning') => {
    const id = actionNoticeIdRef.current++;
    setActionNotices((list) => [{ id, content, kind }, ...list]);
    schedule(4800, () => {
      setActionNotices((list) => list.map((n) => (n.id === id ? { ...n, leaving: true } : n)));
      schedule(360, () => {
        setActionNotices((list) => list.filter((n) => n.id !== id));
      });
    });
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
        scheduleAnim(f.holdMs, step);
      } else {
        scheduleAnim(f.holdMs, () => {
          setRedTints([]);
          setDeathAnims([]);
          onDone();
        });
      }
    };
    step();
  };

  const attackVerb: Record<AttackType, string> = { punch: 'punched', shoot: 'shot', bomb: 'bombed' };

  // Custom name if the player set one, else their color as stored by the engine (already
  // lowercase, e.g. 'green') — used for every online notification/label below.
  const nameFor = (id: PlayerId): string => {
    const entry = room.roster.find((r) => r.playerId === id);
    const color = room.state?.players[id].color ?? '';
    return entry?.name || color.toUpperCase();
  };
  // Renders a player for viewer-aware notification text: the viewer sees "You"/"you"
  // (capitalized only when sentenceStart is true) for themself, and nameFor(id) otherwise.
  const describe = (id: PlayerId, sentenceStart: boolean): string => {
    if (id === room.myPlayerId) return sentenceStart ? 'You' : 'you';
    return nameFor(id);
  };
  // Reflexive pronoun for a self-kill: the viewer killing themselves reads "yourself",
  // everyone else reads "themself".
  const reflexive = (id: PlayerId): string => (id === room.myPlayerId ? 'yourself' : 'themself');

  // ---- Incoming-transition effect: snaps or animates whenever room.state/lastEvent change ----
  useEffect(() => {
    if (!room.state) return;
    if (!room.lastEvent) {
      // Initial gameStart snapshot, a resume, or a player leaving: no event to animate.
      // Kill any in-flight animation first — otherwise its remaining frames keep
      // firing after the snap and paint an old board over the authoritative one.
      const snap = planTransition(prevStateRef.current, room.state, null);
      clearAnimTimers();
      setDisplay(snap.nextBaseline);
      prevStateRef.current = snap.nextBaseline;
      processedEventRef.current = null;
      setRedTints([]);
      setDeathAnims([]);
      setAnimating(false);
      return;
    }
    if (room.lastEvent === processedEventRef.current) return;
    processedEventRef.current = room.lastEvent;
    const event = room.lastEvent;
    const after = room.state;
    // See planTransition for both rules this relies on: the baseline advances now rather
    // than when the frames finish, and any in-flight sequence must be abandoned first.
    // An event can land mid-animation whenever a kill grants its actor an extra turn.
    const plan = planTransition(prevStateRef.current, after, event);
    clearAnimTimers();
    prevStateRef.current = plan.nextBaseline;
    const frames = plan.frames;

    if (event.killedPlayerIds.length) {
      const req = event.request;
      const verb = req.kind === 'move' || req.kind === 'fakeMove' ? 'crushed' : req.kind === 'attack' ? attackVerb[req.type] : null;
      if (verb) {
        // Hold the kill notifications until the death actually lands in the animation
        // (the first frame that carries a death fade) instead of firing the instant the
        // confirmed action arrives — otherwise "X killed Y" shows before the hit plays.
        let deathDelay = 0;
        for (const f of frames) {
          if (f.death.length) break;
          deathDelay += f.holdMs;
        }
        const emitKillNotices = () => {
          setNotifications((list) => {
            const additions = event.killedPlayerIds.map((victimId) => ({
              id: notificationIdRef.current++,
              killerId: event.actorId,
              victimId,
              verb,
            }));
            return [...list, ...additions];
          });

          const selfKill = event.killedPlayerIds.length === 1 && event.killedPlayerIds[0] === event.actorId;
          const subject = colorName(event.actorId, describe(event.actorId, true), after);
          let content: ReactNode;
          if (selfKill) {
            content = <>{subject} {verb} {colorName(event.actorId, reflexive(event.actorId), after)}!</>;
          } else {
            const victims = event.killedPlayerIds.map((id, i) => (
              // In a group kill the attacker can be among the victims (e.g. their own
              // bomb) — that entry reads as the reflexive pronoun, not "you".
              <Fragment key={id}>{i > 0 ? ', ' : ''}{colorName(id, id === event.actorId ? reflexive(id) : describe(id, false), after)}</Fragment>
            ));
            const suffix = after.winner === null && after.draw == null && verb !== 'crushed' ? ' — +1 extra turn!' : '!';
            content = <>{subject} {verb} {victims}{suffix}</>;
          }
          pushActionNotice(content, 'kill');
        };
        if (deathDelay > 0) schedule(deathDelay, emitKillNotices);
        else emitKillNotices();
      }
    }

    if (event.phantomHitPlayerIds.length) {
      const subject = colorName(event.actorId, describe(event.actorId, true), after);
      const targets = event.phantomHitPlayerIds.map((id, i) => (
        <Fragment key={id}>{i > 0 ? ', ' : ''}{colorName(id, id === room.myPlayerId ? 'your' : `${nameFor(id)}'s`, after)}</Fragment>
      ));
      pushActionNotice(<>{subject} hit {targets} Phantom!</>, 'phantom');
    }

    if (event.phantomSpawnOwnerId) {
      const destroyer = colorName(event.actorId, describe(event.actorId, true), after);
      const owner = colorName(
        event.phantomSpawnOwnerId,
        event.phantomSpawnOwnerId === room.myPlayerId ? 'your' : `${nameFor(event.phantomSpawnOwnerId)}'s`,
        after,
      );
      pushActionNotice(<>{destroyer} destroyed {owner} Phantom!</>, 'phantom');
    }

    setAnimating(true);
    playFrames(frames, () => {
      setDisplay(after);
      setAnimating(false);
      setSending(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.state, room.lastEvent]);

  // Surface room.error as a toast, and clear the pending-send lock: a rejected
  // action produces an `error` with NO `state` broadcast, so without this the
  // "Resolving…" gate (`sending`) would stick forever and lock the player out.
  useEffect(() => {
    if (room.error) {
      // A stale lobby-phase rejection ("The game has already started.") can land after the
      // match is underway (e.g. a double-tapped Start Game) — it's meaningless mid-game and
      // was lingering as a stuck toast, so drop it. Still release the send lock either way.
      if (!/already started/i.test(room.error)) pushActionNotice(room.error, 'warning');
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.error]);

  // Toast when a player is removed from the game (they left, or a disconnect grace
  // expired). The board snap is handled by the incoming-transition effect (null event).
  useEffect(() => {
    if (!room.lastLeft || !room.state) return;
    const id = room.lastLeft.playerId;
    if (id === room.myPlayerId) return; // I'm the one leaving — already headed out
    pushActionNotice(<>{colorName(id, nameFor(id), room.state)} has left</>, 'warning');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.lastLeft?.seq]);

  const pausedOverlay =
    room.phase === 'paused' ? (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: theme.scrim,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
            boxShadow: theme.shadow,
            padding: '28px 36px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            maxWidth: 360,
            textAlign: 'center',
          }}
        >
          <div style={{ color: theme.heading, fontSize: 17, fontWeight: 700 }}>
            Waiting for a player to reconnect…
          </div>
          {isHost && (
            <button
              onClick={() => room.send({ type: 'endMatch' })}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                background: theme.accent,
                border: `1px solid ${theme.accent}`,
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              End Match
            </button>
          )}
        </div>
      </div>
    ) : null;

  if (!room.state || !room.myPlayerId || !display) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
        Connecting…
      </div>
    );
  }

  const state = room.state;
  const viewerId = room.myPlayerId;
  const me = state.players[viewerId];
  const others = state.turnOrder.filter((id) => id !== viewerId).map((id) => state.players[id]);
  const myTurn = state.currentTurn === viewerId;
  const gameOver = state.winner !== null || state.draw != null;
  // `revealing` gates interactivity too: showing the chosen player's action panel during
  // the first-turn reveal would leak who was picked before the animation finishes.
  const interactive = myTurn && !animating && !sending && !revealing && room.phase === 'playing' && state.winner === null && state.draw == null;

  const canPunch = me.energy >= PUNCH_ENERGY_COST;
  const canShoot = me.ammo >= SHOOT_AMMO_COST && me.energy >= ATTACK_ENERGY_COST;
  const canBomb = me.ammo >= BOMB_AMMO_COST;
  const can: Capabilities = {
    move: me.energy >= MOVE_ENERGY_COST_PER_TILE,
    punch: canPunch,
    shoot: canShoot,
    bomb: canBomb,
    attack: canPunch || canShoot || canBomb,
    fake: me.energy >= PHANTOM_ENERGY_COST,
  };
  const maxMoveTiles = maxMoveTilesForCount(state.turnOrder.length);

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
      const remainingEnergy = simulateEnergyAfterPath(state.board, me.energy, flow.path);
      if (flow.path.length < ATTACK_MAX_REPOSITION && remainingEnergy >= MOVE_ENERGY_COST_PER_TILE) {
        for (const p of neighbors(state.board, cursor)) {
          if (eq(p, me.position)) continue;
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
            ? DIRS8.map((d) => ({ x: from.x + d.x, y: from.y + d.y })).filter(isInBounds)
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

  let previewHitTiles: Position[] = [];
  if (interactive && flow.kind === 'attackTarget' && flow.target) {
    const from = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
    previewHitTiles = computeHitTiles(state.board, flow.type, from, flow.target);
  }

  let boardState = display;
  if (
    interactive &&
    (flow.kind === 'move' || flow.kind === 'attackReposition' || flow.kind === 'attackSelect' || flow.kind === 'attackTarget') &&
    flow.path.length
  ) {
    const previewPos = flow.path[flow.path.length - 1];
    const meDisp = display.players[viewerId];
    let phantomDisplayPosition = meDisp.phantomDisplayPosition;
    if (meDisp.isPhantom && phantomDisplayPosition) {
      const dx = previewPos.x - meDisp.position.x;
      const dy = previewPos.y - meDisp.position.y;
      const clamp = (v: number) => Math.max(0, Math.min(GRID_SIZE - 1, v));
      phantomDisplayPosition = { x: clamp(phantomDisplayPosition.x + dx), y: clamp(phantomDisplayPosition.y + dy) };
    }
    boardState = {
      ...display,
      players: {
        ...display.players,
        [viewerId]: { ...meDisp, position: previewPos, phantomDisplayPosition },
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

  const handleConfirm = () => {
    if (!interactive) return;
    const req = flowToRequest(flow, state.players[viewerId]);
    if (!req) return;
    room.send({ type: 'action', request: req });
    setFlow({ kind: 'menu' });
    setSending(true);
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

  const confirmEnabled =
    (flow.kind === 'move' && flow.path.length >= 1) ||
    (flow.kind === 'fakeMove' && flow.target !== null) ||
    (flow.kind === 'attackTarget' && flow.target !== null) ||
    flow.kind === 'rest';

  // Most recent kill for the phone strip's mini tracker — reuses the same
  // viewer-aware describe()/reflexive() wording as the last row of the full
  // kills feed below, just not wrapped in its own row.
  const lastNotification = notifications[notifications.length - 1];
  const lastKill: ReactNode | null = lastNotification ? (
    <>
      <span style={{ color: state.players[lastNotification.killerId].color }}>{describe(lastNotification.killerId, true)}</span>
      {lastNotification.killerId === lastNotification.victimId ? (
        <>
          {` ${lastNotification.verb} `}
          <span style={{ color: state.players[lastNotification.killerId].color }}>{reflexive(lastNotification.killerId)}</span>
        </>
      ) : (
        <>
          {` ${lastNotification.verb} `}
          <span style={{ color: state.players[lastNotification.victimId].color }}>{describe(lastNotification.victimId, false)}</span>
        </>
      )}
    </>
  ) : null;

  const killsList =
    notifications.length === 0 ? (
      <div style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic' }}>No kills yet</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...notifications].reverse().map((n) => {
          const selfKill = n.killerId === n.victimId;
          return (
            <div
              key={n.id}
              style={{
                fontSize: 'var(--kills-font, 14px)',
                fontWeight: 600,
                color: theme.heading,
                animation: 'notificationIn 0.25s ease',
              }}
            >
              <span style={{ color: state.players[n.killerId].color }}>{describe(n.killerId, true)}</span>
              {selfKill ? (
                <>
                  {` ${n.verb} `}
                  <span style={{ color: state.players[n.killerId].color }}>{reflexive(n.killerId)}</span>
                </>
              ) : (
                <>
                  {` ${n.verb} `}
                  <span style={{ color: state.players[n.victimId].color }}>{describe(n.victimId, false)}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    );

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
            animation: n.leaving ? 'toastOut 0.34s ease forwards' : 'toastIn 0.34s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden style={{ fontSize: 18 }}>{n.kind === 'kill' ? '💀' : n.kind === 'immune' ? '🛡️' : n.kind === 'phantom' ? '👻' : '⚠️'}</span>
          <span>{n.content}</span>
        </div>
      ))}
    </div>
  );

  const statusText = sending || animating ? 'Resolving…' : !myTurn ? `Waiting for ${nameFor(state.currentTurn)}…` : null;

  return (
    <div>
      {pausedOverlay}
      {revealing && highlightId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: theme.scrim,
            zIndex: 400,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <div style={{ fontSize: revealLanded ? 24 : 18, color: revealLanded ? theme.heading : theme.textMuted, fontWeight: 700, letterSpacing: 1, transition: 'all 0.2s ease' }}>
            {revealLanded ? <>{colorName(highlightId, nameFor(highlightId), state)} goes first!</> : 'Choosing first turn…'}
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            {state.turnOrder.map((id) => (
              <div
                key={id}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: state.players[id].color,
                  opacity: id === highlightId ? 1 : 0.35,
                  transform: id === highlightId ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.1s ease',
                  boxShadow: id === highlightId ? `0 0 24px ${state.players[id].color}` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      )}
      {gameEnded && (
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
            // Matches the hotseat win screen: no horizontal padding, so the result
            // band below can span the full width. See src/App.tsx.
            padding: '24px 0',
            boxSizing: 'border-box',
            overflowY: 'auto',
            pointerEvents: winScreen ? 'auto' : 'none',
          }}
        >
          {winScreen && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 28,
                width: '100%',
                opacity: winContentIn ? 1 : 0,
                transition: 'opacity 3s ease',
              }}
            >
              {/* Same result band as hotseat, so a match ends the same way whichever
                  mode it was played in. The fill is the winner's own SPAWN_TINT; a
                  draw has no single colour and falls back to the neutral surface. */}
              <div
                style={{
                  width: '100%',
                  padding: '24px',
                  boxSizing: 'border-box',
                  textAlign: 'center',
                  background: drawIds
                    ? theme.surface
                    : SPAWN_TINT[state.players[winnerId!].color] ?? theme.surface,
                  borderTop: `1px solid ${theme.border}`,
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <h1 style={{ fontSize: 48, margin: 0 }}>
                  {drawIds ? (
                    <>
                      {drawIds.map((id, i) => (
                        <Fragment key={id}>{i > 0 ? ', ' : ''}{colorName(id, nameFor(id), state)}</Fragment>
                      ))}{' '}Win!
                    </>
                  ) : (
                    <>{colorName(winnerId!, nameFor(winnerId!), state)} Wins!</>
                  )}
                </h1>
              </div>
              <div style={{ padding: '0 24px' }}>
                {state.mode === 'lastStanding' ? <Lives state={state} displayName={nameFor} /> : <Leaderboard state={state} displayName={nameFor} />}
              </div>
              <button
                onClick={() => {
                  // The first click mints the rematch room and sends everyone else its code
                  // via the room's roster broadcast; later clicks (from this player or
                  // others) just follow that code. Whoever was host of THIS match rejoins
                  // as `becomeHost` so host status always ends up back with them, even
                  // though the temp host (first clicker) is the one who actually created
                  // the fresh room.
                  const code = room.successorRoomCode ?? generateRoomCode();
                  if (!room.successorRoomCode) room.send({ type: 'backToLobby', roomCode: code });
                  const seat = room.myPlayerId ?? undefined;
                  onEnterRoom(
                    room.successorRoomCode
                      ? { roomId: code, becomeHost: isHost, seat }
                      : {
                        roomId: code,
                        create: { mode: room.mode, count: room.playerCount, visibility: room.visibility, deathCap: room.deathCap, targetScore: room.targetScore },
                        becomeHost: isHost,
                        seat,
                      },
                  );
                }}
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
                Play again
              </button>
            </div>
          )}
        </div>
      )}
      {noticeStack}
      {showLeaveConfirm && (
        <ConfirmDialog
          title="Leave game?"
          message="Are you sure you want to leave this game?"
          confirmLabel="Leave game"
          onConfirm={() => {
            setShowLeaveConfirm(false);
            // Tell the server to remove me right away (no reconnect grace) so the others
            // see "<me> has left" and the game continues, then exit to the menu.
            room.send({ type: 'leave' });
            onLeave();
          }}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}

      <GameLayout
        boardRef={boardRef}
        controlsRef={controlsRef}
        title={
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            {/* See the note in App.tsx: shrinks at the very-short landscape
                breakpoint, where the title row costs the board real height. */}
            <h1 style={{ fontSize: 'var(--app-title-font, 26px)' }}>Scavengers</h1>
            <span style={{ color: theme.textMuted, fontSize: 13 }}>
              {state.mode === 'lastStanding' ? 'Survival' : 'Deathmatch'}
            </span>
            <div style={{ marginLeft: 'auto' }}>
              <button
                onClick={() => setShowLeaveConfirm(true)}
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
                Leave
              </button>
            </div>
          </div>
        }
        standings={
          state.mode === 'lastStanding' ? <Lives state={state} displayName={nameFor} /> : <Leaderboard state={state} displayName={nameFor} />
        }
        standingsKind={state.mode === 'lastStanding' ? 'lives' : 'leaderboard'}
        scoreStrip={
          <ScoreStrip
            state={state}
            onOpenStandings={() => setPhonePanel('standings')}
            onOpenKills={() => setPhonePanel('kills')}
            lastKill={lastKill}
          />
        }
        bars={
          <ResourceBars player={me} width={columnWidth} preview={preview} showTurnLabel={myTurn && !animating && !revealing} displayName={nameFor(viewerId)} />
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
        controlsWidth={controlsWidth}
        controls={
          <>
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
                maxMoveTiles={maxMoveTiles}
              />
            )}
          </>
        }
        killsFeed={killsList}
      />
      {phonePanel === 'standings' && (
        <Modal title={standingsLabel(state.mode)} onClose={() => setPhonePanel(null)}>
          {state.mode === 'lastStanding'
            ? <Lives state={state} displayName={nameFor} titledExternally />
            : <Leaderboard state={state} displayName={nameFor} titledExternally onShowScoring={() => setPhonePanel('scoring')} />}
        </Modal>
      )}
      {/* Same swap as the hotseat screen: one popup at a time on a phone. */}
      {phonePanel === 'scoring' && (
        <Modal title="How scoring works" onClose={() => setPhonePanel(null)}>
          <ScoringNote />
          <button onClick={() => setPhonePanel('standings')} style={{ marginTop: 18 }}>
            Back to {standingsLabel(state.mode)}
          </button>
        </Modal>
      )}
      {phonePanel === 'kills' && (
        <Modal title="Kills" onClose={() => setPhonePanel(null)}>{killsList}</Modal>
      )}
    </div>
  );
}
