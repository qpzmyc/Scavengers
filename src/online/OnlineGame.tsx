import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type GameState,
  type Position,
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
} from '../engine';
import { Board, type Highlight, type RedTint, type DeathAnim } from '../components/Board';
import { ResourceBars, type ResourcePreview } from '../components/ResourceBars';
import { Leaderboard } from '../components/Leaderboard';
import { Lives } from '../components/Lives';
import { ControlPanel, type Flow, type AttackType, type Capabilities } from '../components/ControlPanel';
import { theme } from '../theme';
import {
  type AnimFrame,
  DIRS8,
  eq,
  neighbors,
  rayTiles,
  computeHitTiles,
} from '../game/animation';
import type { OnlineRoom } from './useOnlineRoom';
import { buildOnlineFrames } from './buildOnlineFrames';
import { flowToRequest } from './flowToRequest';
import type { ActionEvent } from './protocol';

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

export function OnlineGame({ room, onLeave, isHost }: { room: OnlineRoom; onLeave: () => void; isHost: boolean }) {
  const [flow, setFlow] = useState<Flow>({ kind: 'menu' });
  const [display, setDisplay] = useState<GameState | null>(room.state);
  const [redTints, setRedTints] = useState<RedTint[]>([]);
  const [deathAnims, setDeathAnims] = useState<DeathAnim[]>([]);
  const [animating, setAnimating] = useState(false);
  const [sending, setSending] = useState(false);
  const cellSize = useCellSize();

  const [notifications, setNotifications] = useState<
    { id: number; killerColor: string; killerName: string; victimColor: string; victimName: string; verb: string }[]
  >([]);
  const notificationIdRef = useRef(0);

  const [actionNotices, setActionNotices] = useState<{ id: number; text: string; kind: 'warning' | 'kill' | 'immune' | 'phantom'; leaving?: boolean }[]>([]);
  const actionNoticeIdRef = useRef(0);

  const prevStateRef = useRef<GameState | null>(null);
  const processedEventRef = useRef<ActionEvent | null>(null);
  const timersRef = useRef<number[]>([]);

  const schedule = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  const pushActionNotice = (text: string, kind: 'warning' | 'kill' | 'immune' | 'phantom' = 'warning') => {
    const id = actionNoticeIdRef.current++;
    setActionNotices((list) => [{ id, text, kind }, ...list]);
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

  const attackVerb: Record<AttackType, string> = { punch: 'punched', shoot: 'shot', bomb: 'bombed' };

  // ---- Incoming-transition effect: snaps or animates whenever room.state/lastEvent change ----
  useEffect(() => {
    if (!room.state) return;
    if (!room.lastEvent) {
      // Initial gameStart snapshot, or a resumed snapshot: no event to animate.
      setDisplay(room.state);
      prevStateRef.current = room.state;
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
    const before = prevStateRef.current ?? room.state;
    const frames = buildOnlineFrames(before, after, event);

    if (event.killedPlayerIds.length) {
      const killer = after.players[event.actorId];
      const req = event.request;
      const verb = req.kind === 'move' ? 'crushed' : req.kind === 'attack' ? attackVerb[req.type] : null;
      if (verb) {
        setNotifications((list) => {
          const additions = event.killedPlayerIds.map((victimId) => {
            const victim = after.players[victimId];
            return {
              id: notificationIdRef.current++,
              killerColor: killer.color,
              killerName: killer.color,
              victimColor: victim.color,
              victimName: victim.color,
              verb,
            };
          });
          return [...list, ...additions];
        });
        const victimNames = event.killedPlayerIds.map((id) => after.players[id].color.toUpperCase());
        const killMsg =
          after.winner === null && verb !== 'crushed'
            ? `${verb[0].toUpperCase()}${verb.slice(1)} ${victimNames.join(', ')} — +1 extra turn!`
            : `${verb[0].toUpperCase()}${verb.slice(1)} ${victimNames.join(', ')}!`;
        pushActionNotice(killMsg, 'kill');
      }
    }

    setAnimating(true);
    playFrames(frames, () => {
      prevStateRef.current = after;
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
      pushActionNotice(room.error, 'warning');
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.error]);

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
  const gameOver = state.winner !== null;
  const interactive = myTurn && !animating && !sending && room.phase === 'playing' && state.winner === null;
  const colorSet = new Set(state.turnOrder.map((id) => state.players[id].color.toLowerCase()));

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

  const phantomBase = me.isPhantom && me.phantomDisplayPosition ? me.phantomDisplayPosition : me.position;

  // ---- Highlights + click targeting (only while interactive) ----
  const highlights: Highlight[] = [];
  if (interactive) {
    if (flow.kind === 'move') {
      const cursor = flow.path.length ? flow.path[flow.path.length - 1] : me.position;
      const remainingEnergy = simulateEnergyAfterPath(state.board, me.energy, flow.path);
      if (flow.path.length < 2 && remainingEnergy >= 1) {
        for (const p of neighbors(state.board, cursor)) {
          if (others.some((o) => eq(p, o.isPhantom && o.phantomDisplayPosition ? o.phantomDisplayPosition : o.position))) continue;
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
          if (flow.path.some((s) => eq(s, p))) continue;
          highlights.push({ x: p.x, y: p.y, kind: 'candidate' });
        }
      }
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
  }
  const selectedKeys = new Set(highlights.filter((h) => h.kind === 'selected').map((h) => `${h.x},${h.y}`));
  const dedupedHighlights = highlights.filter((h) => h.kind === 'selected' || !selectedKeys.has(`${h.x},${h.y}`));
  const isCandidate = (pos: Position) => dedupedHighlights.some((h) => h.x === pos.x && h.y === pos.y);

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

  const card: React.CSSProperties = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.radius,
    boxShadow: theme.shadow,
  };
  const boardWidth = GRID_SIZE * cellSize + 12;
  const columnWidth = Math.max(boardWidth, 320);

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
          <span>{renderColoredText(n.text, colorSet)}</span>
        </div>
      ))}
    </div>
  );

  const statusText = sending || animating ? 'Resolving…' : !myTurn ? `Waiting for ${state.players[state.currentTurn].color}…` : null;

  return (
    <div style={{ minHeight: '100vh', padding: 24, boxSizing: 'border-box' }}>
      {pausedOverlay}
      {noticeStack}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26 }}>Scavengers</h1>
        <span style={{ color: theme.textMuted, fontSize: 13 }}>
          {state.mode === 'lastStanding' ? 'Last Standing' : 'Deathmatch'}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={onLeave}
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

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
        {state.mode === 'lastStanding' ? <Lives state={state} /> : <Leaderboard state={state} />}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {gameOver || room.phase === 'over' ? (
            <div style={{ width: columnWidth, boxSizing: 'border-box', padding: '12px 16px', borderRadius: theme.radius, background: theme.accentSoft, color: theme.accentText, fontWeight: 700, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <span>Player {state.players[state.winner!].color.toUpperCase()} wins!</span>
              <button
                onClick={onLeave}
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
          ) : (
            <ResourceBars player={me} width={columnWidth} preview={preview} />
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
              attackPreparing={
                interactive &&
                (flow.kind === 'attackReposition' || flow.kind === 'attackSelect' || flow.kind === 'attackTarget')
              }
              visionCenter={interactive ? me.position : undefined}
            />
          </div>

          <div style={{ ...card, width: columnWidth, boxSizing: 'border-box' }}>
            {statusText ? (
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
