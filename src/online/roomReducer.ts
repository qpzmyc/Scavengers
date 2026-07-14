import {
  createInitialGameState,
  defaultDeathCapForCount,
  defaultTargetScoreForCount,
  removePlayer,
  MIN_DEATH_CAP,
  MAX_DEATH_CAP,
  MIN_TARGET_SCORE,
  MAX_TARGET_SCORE,
} from '../engine';
import type { GameState, GameMode, PlayerId, PlayerColor } from '../engine';
import { applyAction } from './actionReducer';
import type { RoomPhase, RosterEntry, ServerMsg, ActionRequest } from './protocol';

const SEAT_ORDER: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
const COLORS: Record<PlayerId, PlayerColor> = { p1: 'green', p2: 'red', p3: 'blue', p4: 'yellow' };
const MAX_NAME_LENGTH = 16;

interface Slot {
  playerId: PlayerId;
  connId: string | null;   // the socket currently seated here (retained while disconnected mid-game for reconnect)
  connected: boolean;
  token: string | null;    // per-seat secret; required to reclaim a reserved seat
  name: string | null;
}

export interface RoomModel {
  phase: RoomPhase;
  mode: GameMode;
  playerCount: number;
  deathCap: number;        // lives (Survival mode)
  targetScore: number;     // points to win (Deathmatch mode)
  visibility: 'public' | 'private';
  slots: Slot[];           // length === playerCount, seat/turn order p1..pN
  hostConnId: string | null;
  state: GameState | null;
  // The room code of the rematch room, once someone has clicked "Back to Lobby" — see
  // the 'backToLobby' case below.
  successorRoomCode: string | null;
}

export type RoomInput =
  | { t: 'connect'; connId: string }
  | { t: 'join'; connId: string; token?: string; issueToken: string; becomeHost?: boolean; seat?: PlayerId }
  | { t: 'startGame'; connId: string }
  | { t: 'action'; connId: string; request: ActionRequest }
  | { t: 'endMatch'; connId: string }
  | { t: 'setName'; connId: string; name: string }
  | { t: 'updateSettings'; connId: string; mode: GameMode; deathCap: number; targetScore: number }
  | { t: 'makeHost'; connId: string; playerId: PlayerId }
  | { t: 'kickPlayer'; connId: string; playerId: PlayerId }
  | { t: 'backToLobby'; connId: string; roomCode: string }
  | { t: 'disconnect'; connId: string }
  // Remove a player mid-game and continue: `connId` for a deliberate leave, `playerId`
  // when the server's reconnect-grace timer fires for a still-disconnected seat.
  | { t: 'removePlayer'; connId?: string; playerId?: PlayerId };

export interface Outbound {
  to: 'all' | { connId: string };
  msg: ServerMsg;
}
export interface RoomStep {
  model: RoomModel;
  out: Outbound[];
}

export function roomInit(
  mode: GameMode,
  playerCount: number,
  options?: { deathCap?: number; targetScore?: number; visibility?: 'public' | 'private' },
): RoomModel {
  const slots: Slot[] = SEAT_ORDER.slice(0, playerCount).map((playerId) => ({
    playerId,
    connId: null,
    connected: false,
    token: null,
    name: null,
  }));
  return {
    phase: 'lobby',
    mode,
    playerCount,
    deathCap: options?.deathCap ?? defaultDeathCapForCount(playerCount),
    targetScore: options?.targetScore ?? defaultTargetScoreForCount(playerCount),
    visibility: options?.visibility ?? 'public',
    slots,
    hostConnId: null,
    state: null,
    successorRoomCode: null,
  };
}

function rosterEntries(model: RoomModel): RosterEntry[] {
  return model.slots.map((s) => ({
    playerId: s.playerId,
    color: COLORS[s.playerId],
    connected: s.connected,
    isHost: s.connId !== null && s.connId === model.hostConnId,
    name: s.name,
  }));
}
function rosterMsg(model: RoomModel): ServerMsg {
  return {
    type: 'roster',
    entries: rosterEntries(model),
    phase: model.phase,
    mode: model.mode,
    playerCount: model.playerCount,
    deathCap: model.deathCap,
    targetScore: model.targetScore,
    visibility: model.visibility,
    successorRoomCode: model.successorRoomCode,
  };
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
      // Authenticated reconnect: a presented token must match a reserved (disconnected) seat.
      let target: Slot | undefined;
      if (input.token) {
        target = model.slots.find((s) => s.token === input.token && !s.connected);
      }
      const reconnecting = target !== undefined;
      if (!target) {
        // Fresh seat: only a never-assigned slot. A reserved seat cannot be taken without its token.
        // Prefer the requested seat (rematch: keep your color) when it's still open, else the first free one.
        const open = model.slots.filter((s) => s.token === null && s.connId === null);
        target = (input.seat && open.find((s) => s.playerId === input.seat)) || open[0];
      }
      if (!target) {
        return { model, out: [err(input.connId, model.phase === 'lobby' ? 'Room is full.' : 'Could not rejoin this room.')] };
      }
      const chosen = target;
      const tokenForSeat = reconnecting ? chosen.token! : input.issueToken;
      const isFirstSeat = model.slots.every((s) => s.token === null && s.connId === null);
      const slots = model.slots.map((s) =>
        s === chosen ? { ...s, connId: input.connId, connected: true, token: tokenForSeat } : s
      );
      // A client rejoining as the designated real host (the "back to lobby" rematch flow)
      // always claims host, even if someone else (the temp host) got here first.
      const hostConnId = input.becomeHost ? input.connId : isFirstSeat ? input.connId : model.hostConnId;
      let next: RoomModel = { ...model, slots, hostConnId };
      const out: Outbound[] = [{ to: { connId: input.connId }, msg: { type: 'assigned', playerId: chosen.playerId, token: tokenForSeat } }];
      if (next.phase === 'paused' && next.slots.every((s) => s.connected) && next.state) {
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
      const initial = createInitialGameState(model.mode, model.playerCount, {
        deathCap: model.deathCap,
        targetScore: model.targetScore,
      });
      const firstTurn = initial.turnOrder[Math.floor(Math.random() * initial.turnOrder.length)];
      const state = { ...initial, currentTurn: firstTurn };
      const next: RoomModel = { ...model, phase: 'playing', state };
      return { model: next, out: [{ to: 'all', msg: { type: 'gameStart', state } }, { to: 'all', msg: rosterMsg(next) }] };
    }

    case 'setName': {
      const slot = slotOf(model, input.connId);
      if (!slot) return { model, out: [] };
      const trimmed = input.name.trim().slice(0, MAX_NAME_LENGTH);
      const nextName = trimmed.length > 0 ? trimmed : null;
      const slots = model.slots.map((s) => (s === slot ? { ...s, name: nextName } : s));
      const next: RoomModel = { ...model, slots };
      return { model: next, out: [{ to: 'all', msg: rosterMsg(next) }] };
    }

    case 'updateSettings': {
      if (input.connId !== model.hostConnId) return { model, out: [err(input.connId, 'Only the host can change the game’s settings.')] };
      if (model.phase !== 'lobby') return { model, out: [err(input.connId, 'Settings can only be changed before the game starts.')] };
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
      const next: RoomModel = {
        ...model,
        mode: input.mode,
        deathCap: clamp(input.deathCap, MIN_DEATH_CAP, MAX_DEATH_CAP),
        targetScore: clamp(input.targetScore, MIN_TARGET_SCORE, MAX_TARGET_SCORE),
      };
      return { model: next, out: [{ to: 'all', msg: rosterMsg(next) }] };
    }

    case 'makeHost': {
      if (input.connId !== model.hostConnId) return { model, out: [err(input.connId, 'Only the host can transfer host.')] };
      const target = model.slots.find((s) => s.playerId === input.playerId);
      if (!target || !target.connected || target.connId === null) {
        return { model, out: [err(input.connId, 'That player is not connected.')] };
      }
      const next: RoomModel = { ...model, hostConnId: target.connId };
      return { model: next, out: [{ to: 'all', msg: rosterMsg(next) }] };
    }

    case 'kickPlayer': {
      if (input.connId !== model.hostConnId) return { model, out: [err(input.connId, 'Only the host can remove players.')] };
      if (model.phase !== 'lobby') return { model, out: [err(input.connId, 'Players can only be removed before the game starts.')] };
      const target = model.slots.find((s) => s.playerId === input.playerId);
      if (!target || !target.connected || target.connId === input.connId) return { model, out: [] };
      const kickedConnId = target.connId;
      // Free the seat entirely (as a lobby disconnect would) so someone else can take it.
      const slots = model.slots.map((s) =>
        s === target ? { ...s, connId: null, connected: false, token: null, name: null } : s
      );
      const next: RoomModel = { ...model, slots };
      const out: Outbound[] = [];
      if (kickedConnId) out.push({ to: { connId: kickedConnId }, msg: { type: 'kicked' } });
      out.push({ to: 'all', msg: rosterMsg(next) });
      return { model: next, out };
    }

    case 'backToLobby': {
      if (model.phase !== 'over') return { model, out: [] };
      // The first click mints the rematch room's code; later clicks (from other players,
      // or a retry of the same click) are no-ops once a code is already set — everyone
      // rendezvouses at that one code.
      if (model.successorRoomCode) return { model, out: [] };
      const next: RoomModel = { ...model, successorRoomCode: input.roomCode };
      return { model: next, out: [{ to: 'all', msg: rosterMsg(next) }] };
    }

    case 'action': {
      if (model.phase !== 'playing' || !model.state) return { model, out: [err(input.connId, 'The game is not active.')] };
      const slot = slotOf(model, input.connId);
      if (!slot) return { model, out: [err(input.connId, 'You are not seated in this room.')] };
      const res = applyAction(model.state, slot.playerId, input.request);
      if (!res.ok) return { model, out: [err(input.connId, res.error)] };
      const over = res.state.winner !== null || res.state.draw != null;
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
      const freeSlot = model.phase === 'lobby';
      const slots = model.slots.map((s) =>
        s === slot ? { ...s, connId: null, connected: false, token: freeSlot ? null : s.token } : s
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

    case 'removePlayer': {
      // Only meaningful for an in-progress game (playing or paused for a grace window).
      if ((model.phase !== 'playing' && model.phase !== 'paused') || !model.state) return { model, out: [] };
      const slot = input.playerId
        ? model.slots.find((s) => s.playerId === input.playerId)
        : slotOf(model, input.connId ?? '');
      if (!slot) return { model, out: [] };
      const removedId = slot.playerId;
      const state = removePlayer(model.state, removedId);
      // Free the seat entirely — a removed player is out for the match and can't reclaim it.
      const slots = model.slots.map((s) =>
        s === slot ? { ...s, connId: null, connected: false, token: null } : s
      );
      const over = state.winner !== null || state.draw != null;
      let next: RoomModel = { ...model, state, slots, phase: over ? 'over' : 'playing' };
      if (model.hostConnId === slot.connId) {
        next = { ...next, hostConnId: slots.find((s) => s.connected)?.connId ?? null };
      }
      const out: Outbound[] = [
        { to: 'all', msg: { type: 'playerLeft', playerId: removedId, state } },
        { to: 'all', msg: rosterMsg(next) },
      ];
      if (over) out.push({ to: 'all', msg: { type: 'over', state } });
      return { model: next, out };
    }
  }
}

// True once a room's last connected player has left while it was still in the lobby
// (never started) — the signal server.ts uses to auto-delist it from the public lobby.
export function isAbandonedInLobby(model: RoomModel): boolean {
  return model.phase === 'lobby' && model.slots.every((s) => !s.connected);
}
