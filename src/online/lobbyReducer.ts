import type { LobbyRow, LobbyServerMsg } from './protocol';

export interface LobbyModel {
  rooms: Record<string, LobbyRow>; // keyed by room code
}

export type LobbyInput =
  | { t: 'register'; row: LobbyRow }
  | { t: 'unregister'; code: string }
  | { t: 'list'; connId: string };

export interface LobbyOutbound {
  to: 'all' | { connId: string };
  msg: LobbyServerMsg;
}

export interface LobbyStep {
  model: LobbyModel;
  out: LobbyOutbound[];
}

export function lobbyInit(): LobbyModel {
  return { rooms: {} };
}

export function lobbyReduce(model: LobbyModel, input: LobbyInput): LobbyStep {
  switch (input.t) {
    case 'register':
      return { model: { rooms: { ...model.rooms, [input.row.code]: input.row } }, out: [] };
    case 'unregister': {
      const rooms = { ...model.rooms };
      delete rooms[input.code];
      return { model: { rooms }, out: [] };
    }
    case 'list':
      return { model, out: [{ to: { connId: input.connId }, msg: { type: 'rooms', rooms: Object.values(model.rooms) } }] };
  }
}
