import { createInitialGameState } from '../engine';
import type { GameState, GameMode, PlayerId, PlayerColor } from '../engine';
import { applyAction } from './actionReducer';
import type { RoomPhase, RosterEntry, ServerMsg, ActionRequest } from './protocol';

const SEAT_ORDER: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
const COLORS: Record<PlayerId, PlayerColor> = { p1: 'green', p2: 'red', p3: 'blue', p4: 'yellow' };

interface Slot {
  playerId: PlayerId;
  connId: string | null;   // the socket currently seated here (retained while disconnected mid-game for reconnect)
  connected: boolean;
}

export interface RoomModel {
  phase: RoomPhase;
  mode: GameMode;
  playerCount: number;
  slots: Slot[];           // length === playerCount, seat/turn order p1..pN
  hostConnId: string | null;
  state: GameState | null;
}

export type RoomInput =
  | { t: 'connect'; connId: string }
  | { t: 'join'; connId: string }
  | { t: 'startGame'; connId: string }
  | { t: 'action'; connId: string; request: ActionRequest }
  | { t: 'endMatch'; connId: string }
  | { t: 'disconnect'; connId: string };

export interface Outbound {
  to: 'all' | { connId: string };
  msg: ServerMsg;
}
export interface RoomStep {
  model: RoomModel;
  out: Outbound[];
}

export function roomInit(mode: GameMode, playerCount: number): RoomModel {
  const slots: Slot[] = SEAT_ORDER.slice(0, playerCount).map((playerId) => ({ playerId, connId: null, connected: false }));
  return { phase: 'lobby', mode, playerCount, slots, hostConnId: null, state: null };
}

function rosterEntries(model: RoomModel): RosterEntry[] {
  return model.slots.map((s) => ({
    playerId: s.playerId,
    color: COLORS[s.playerId],
    connected: s.connected,
    isHost: s.connId !== null && s.connId === model.hostConnId,
  }));
}
function rosterMsg(model: RoomModel): ServerMsg {
  return { type: 'roster', entries: rosterEntries(model), phase: model.phase, mode: model.mode, playerCount: model.playerCount };
}
function slotOf(model: RoomModel, connId: string): Slot | undefined {
  return model.slots.find((s) => s.connId === connId);
}
function err(connId: string, message: string): Outbound {
  return { to: { connId }, msg: { type: 'error', message } };
}

export function roomReduce(model: RoomModel, input: RoomInput): RoomStep {
  switch (input.t) {
    case 'connect':
      // Newcomer sees the current roster; actual seating waits for an explicit join.
      return { model, out: [{ to: { connId: input.connId }, msg: rosterMsg(model) }] };

    case 'join': {
      if (slotOf(model, input.connId)) {
        return { model, out: [{ to: 'all', msg: rosterMsg(model) }] };
      }
      // Paused game: reclaim the first disconnected (reserved) slot. Otherwise take the first empty slot.
      const target =
        model.phase === 'paused'
          ? model.slots.find((s) => !s.connected)
          : model.slots.find((s) => s.connId === null);
      if (!target) {
        return { model, out: [err(input.connId, 'Room is full.')] };
      }
      const isFirstSeat = model.slots.every((s) => s.connId === null);
      const slots = model.slots.map((s) => (s === target ? { ...s, connId: input.connId, connected: true } : s));
      let next: RoomModel = { ...model, slots, hostConnId: isFirstSeat ? input.connId : model.hostConnId };
      const out: Outbound[] = [{ to: { connId: input.connId }, msg: { type: 'assigned', playerId: target.playerId } }];
      if (next.phase === 'paused' && next.slots.every((s) => s.connected) && next.state !== null) {
        const state = next.state;
        next = { ...next, phase: 'playing' };
        out.push({ to: 'all', msg: { type: 'resumed', state } });
      }
      out.push({ to: 'all', msg: rosterMsg(next) });
      return { model: next, out };
    }

    case 'startGame': {
      if (input.connId !== model.hostConnId) return { model, out: [err(input.connId, 'Only the host can start.')] };
      if (model.phase !== 'lobby') return { model, out: [err(input.connId, 'The game has already started.')] };
      if (!model.slots.every((s) => s.connId !== null && s.connected)) return { model, out: [err(input.connId, 'The room is not full yet.')] };
      const state = createInitialGameState(model.mode, model.playerCount);
      const next: RoomModel = { ...model, phase: 'playing', state };
      return { model: next, out: [{ to: 'all', msg: { type: 'gameStart', state } }, { to: 'all', msg: rosterMsg(next) }] };
    }

    case 'action': {
      if (model.phase !== 'playing' || !model.state) return { model, out: [err(input.connId, 'The game is not active.')] };
      const slot = slotOf(model, input.connId);
      if (!slot) return { model, out: [err(input.connId, 'You are not seated in this room.')] };
      const res = applyAction(model.state, slot.playerId, input.request);
      if (!res.ok) return { model, out: [err(input.connId, res.error)] };
      const over = res.state.winner !== null;
      const next: RoomModel = { ...model, state: res.state, phase: over ? 'over' : 'playing' };
      const out: Outbound[] = [{ to: 'all', msg: { type: 'state', state: res.state, event: res.event } }];
      if (over) out.push({ to: 'all', msg: { type: 'over', state: res.state } });
      return { model: next, out };
    }

    case 'endMatch': {
      if (input.connId !== model.hostConnId) return { model, out: [err(input.connId, 'Only the host can end the match.')] };
      if (!model.state) return { model, out: [] };
      return { model: { ...model, phase: 'over' }, out: [{ to: 'all', msg: { type: 'over', state: model.state } }] };
    }

    case 'disconnect': {
      const slot = slotOf(model, input.connId);
      if (!slot) return { model, out: [] };
      // In the lobby a slot is freed for reuse; mid-game it stays reserved (connId kept) for reconnect.
      const freeSlot = model.phase === 'lobby';
      const slots = model.slots.map((s) =>
        s === slot ? { ...s, connId: freeSlot ? null : s.connId, connected: false } : s
      );
      let next: RoomModel = { ...model, slots };
      if (model.hostConnId === input.connId) {
        next = { ...next, hostConnId: slots.find((s) => s.connected)?.connId ?? null };
      }
      const out: Outbound[] = [];
      if (next.phase === 'playing') {
        next = { ...next, phase: 'paused' };
        out.push({ to: 'all', msg: { type: 'paused', disconnected: slot.playerId } });
      }
      out.push({ to: 'all', msg: rosterMsg(next) });
      return { model: next, out };
    }
  }
}
