import {
  movePlayer,
  restPlayer,
  fakeMove,
  punch,
  shoot,
  bomb,
  resolveAttack,
  endTurn,
} from '../engine';
import type { GameState, PlayerId } from '../engine';
import { computeHitTiles } from '../game/animation';
import type { ActionRequest, ActionEvent } from './protocol';

export type ApplyResult =
  | { ok: true; state: GameState; event: ActionEvent }
  | { ok: false; error: string };

// Validate + apply one player's action against the authoritative state, returning
// the new state plus an ActionEvent (what happened). Mirrors App.tsx handleConfirm.
export function applyAction(state: GameState, actorId: PlayerId, req: ActionRequest): ApplyResult {
  if (state.winner !== null) return { ok: false, error: 'The game is over.' };
  if (state.currentTurn !== actorId) return { ok: false, error: 'Not your turn.' };
  const actor = state.players[actorId];
  if (!actor || actor.eliminated) return { ok: false, error: 'You are not in play.' };

  try {
    if (req.kind === 'move') {
      const pathKeys = new Set(req.path.map((p) => `${p.x},${p.y}`));
      const squashedIds = state.turnOrder.filter((id) => {
        if (id === actorId) return false;
        const o = state.players[id];
        return o.alive && !o.eliminated && o.isPhantom && pathKeys.has(`${o.position.x},${o.position.y}`);
      });
      const moved = movePlayer(state, actorId, req.path);
      if (squashedIds.length) {
        let killedState = moved;
        for (const id of squashedIds) {
          killedState = {
            ...killedState,
            players: { ...killedState.players, [id]: { ...killedState.players[id], alive: false } },
          };
        }
        const acted = resolveAttack({ state: killedState, killedPlayerIds: squashedIds }, actorId);
        const next = endTurn(acted, actorId, false); // a crush is incidental: no extra turn
        return { ok: true, state: next, event: { actorId, request: req, killedPlayerIds: squashedIds, phantomHitPlayerIds: [] } };
      }
      const next = endTurn(moved, actorId, false);
      return { ok: true, state: next, event: { actorId, request: req, killedPlayerIds: [], phantomHitPlayerIds: [] } };
    }

    if (req.kind === 'rest') {
      const acted = restPlayer(state, actorId);
      const next = endTurn(acted, actorId, false);
      return { ok: true, state: next, event: { actorId, request: req, killedPlayerIds: [], phantomHitPlayerIds: [] } };
    }

    if (req.kind === 'fakeMove') {
      const acted = fakeMove(state, actorId, req.dir);
      const next = endTurn(acted, actorId, false);
      return { ok: true, state: next, event: { actorId, request: req, killedPlayerIds: [], phantomHitPlayerIds: [] } };
    }

    // attack (with optional reposition path)
    const base = req.path.length ? movePlayer(state, actorId, req.path) : state;
    const from = req.path.length ? req.path[req.path.length - 1] : actor.position;
    const result =
      req.type === 'punch'
        ? punch(base, actorId, req.target)
        : req.type === 'shoot'
          ? shoot(base, actorId, { x: req.target.x - from.x, y: req.target.y - from.y })
          : bomb(base, actorId, req.target);
    const acted = resolveAttack(result, actorId);
    const gotKill = result.killedPlayerIds.length > 0;
    const next = endTurn(acted, actorId, gotKill);
    // A phantom (decoy) whose displayed position sat in the hit tiles, but whose owner
    // survived (real position wasn't caught) — the attack only tagged the decoy.
    const hitKeys = new Set(computeHitTiles(base.board, req.type, from, req.target).map((p) => `${p.x},${p.y}`));
    const killedSet = new Set(result.killedPlayerIds);
    const phantomHitPlayerIds = base.turnOrder.filter((id) => {
      if (id === actorId || killedSet.has(id)) return false;
      const p = base.players[id];
      return p.alive && !p.eliminated && p.isPhantom && p.phantomDisplayPosition
        && hitKeys.has(`${p.phantomDisplayPosition.x},${p.phantomDisplayPosition.y}`);
    });
    return { ok: true, state: next, event: { actorId, request: req, killedPlayerIds: result.killedPlayerIds, phantomHitPlayerIds } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Illegal action.' };
  }
}
