import { useCallback, useRef, useState } from 'react';
import usePartySocket from 'partysocket/react';
import type { PartySocket } from 'partysocket';
import type { GameState, GameMode, PlayerId } from '../engine';
import type { ClientMsg, ServerMsg, RoomPhase, RosterEntry, ActionEvent } from './protocol';
import { PARTY_HOST, ROOM_PARTY } from './config';

export interface OnlineRoom {
  connected: boolean;
  phase: RoomPhase;
  roster: RosterEntry[];
  mode: GameMode;
  playerCount: number;
  myPlayerId: PlayerId | null;
  state: GameState | null;
  lastEvent: ActionEvent | null;
  error: string | null;
  send: (msg: ClientMsg) => void;
}

// Connect to a room party. Pass `create` (mode + count) when creating a room so the
// server can initialise it; joiners omit it and inherit the room's settings.
export function useOnlineRoom(roomId: string, create?: { mode: GameMode; count: number }): OnlineRoom {
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<RoomPhase>('lobby');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [mode, setMode] = useState<GameMode>(create?.mode ?? 'lastStanding');
  const [playerCount, setPlayerCount] = useState<number>(create?.count ?? 2);
  const [myPlayerId, setMyPlayerId] = useState<PlayerId | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [lastEvent, setLastEvent] = useState<ActionEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socket = usePartySocket({
    host: PARTY_HOST,
    party: ROOM_PARTY,
    room: roomId,
    query: create ? { mode: create.mode, count: String(create.count) } : {},
    onOpen(event: Event) {
      setConnected(true);
      (event.target as PartySocket).send(JSON.stringify({ type: 'join' } satisfies ClientMsg));
    },
    onClose() {
      setConnected(false);
    },
    onMessage(evt: MessageEvent) {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(evt.data as string) as ServerMsg;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'assigned':
          setMyPlayerId(msg.playerId);
          break;
        case 'roster':
          setRoster(msg.entries);
          setPhase(msg.phase);
          setMode(msg.mode);
          setPlayerCount(msg.playerCount);
          break;
        case 'gameStart':
          setState(msg.state);
          setPhase('playing');
          setLastEvent(null);
          break;
        case 'state':
          setState(msg.state);
          setLastEvent(msg.event);
          setPhase(msg.state.winner !== null ? 'over' : 'playing');
          break;
        case 'paused':
          setPhase('paused');
          break;
        case 'resumed':
          setState(msg.state);
          setPhase('playing');
          break;
        case 'over':
          setState(msg.state);
          setPhase('over');
          break;
        case 'error':
          setError(msg.message);
          break;
      }
    },
  });

  const socketRef = useRef(socket);
  socketRef.current = socket;

  const send = useCallback((msg: ClientMsg) => {
    socketRef.current?.send(JSON.stringify(msg));
  }, []);

  return { connected, phase, roster, mode, playerCount, myPlayerId, state, lastEvent, error, send };
}
