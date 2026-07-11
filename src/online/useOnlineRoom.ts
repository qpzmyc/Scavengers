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
  deathCap: number;
  targetScore: number;
  visibility: 'public' | 'private';
  successorRoomCode: string | null;
  myPlayerId: PlayerId | null;
  state: GameState | null;
  lastEvent: ActionEvent | null;
  error: string | null;
  kicked: boolean;
  send: (msg: ClientMsg) => void;
}

// Connect to a room party. Pass `create` (mode + count) when creating a room so the
// server can initialise it; joiners omit it and inherit the room's settings. `becomeHost`
// is set when rejoining as the designated real host of a "back to lobby" rematch room.
export function useOnlineRoom(
  roomId: string,
  create?: { mode: GameMode; count: number; deathCap: number; targetScore: number; visibility?: 'public' | 'private' },
  becomeHost?: boolean,
  // Preferred seat when rejoining a rematch room, so every player keeps the color/seat
  // they had in the finished match. Ignored if that seat is already taken.
  seat?: PlayerId,
): OnlineRoom {
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<RoomPhase>('lobby');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [mode, setMode] = useState<GameMode>(create?.mode ?? 'lastStanding');
  const [playerCount, setPlayerCount] = useState<number>(create?.count ?? 2);
  const [deathCap, setDeathCap] = useState<number>(create?.deathCap ?? 3);
  const [targetScore, setTargetScore] = useState<number>(create?.targetScore ?? 25);
  const [visibility, setVisibility] = useState<'public' | 'private'>(create?.visibility ?? 'public');
  const [successorRoomCode, setSuccessorRoomCode] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<PlayerId | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [lastEvent, setLastEvent] = useState<ActionEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);

  const tokenRef = useRef<string | null>(null);

  const socket = usePartySocket({
    host: PARTY_HOST,
    party: ROOM_PARTY,
    room: roomId,
    query: create
      ? {
          create: '1',
          mode: create.mode,
          count: String(create.count),
          deathCap: String(create.deathCap),
          targetScore: String(create.targetScore),
          visibility: create.visibility ?? 'public',
        }
      : {},
    onOpen(event: Event) {
      setConnected(true);
      (event.target as PartySocket).send(
        JSON.stringify({ type: 'join', token: tokenRef.current ?? undefined, becomeHost, seat } satisfies ClientMsg),
      );
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
          tokenRef.current = msg.token;
          break;
        case 'roster':
          setRoster(msg.entries);
          setPhase(msg.phase);
          setMode(msg.mode);
          setPlayerCount(msg.playerCount);
          setDeathCap(msg.deathCap);
          setTargetScore(msg.targetScore);
          setVisibility(msg.visibility);
          setSuccessorRoomCode(msg.successorRoomCode);
          break;
        case 'gameStart':
          setState(msg.state);
          setPhase('playing');
          setLastEvent(null);
          setError(null);
          break;
        case 'state':
          setState(msg.state);
          setLastEvent(msg.event);
          setPhase(msg.state.winner !== null || msg.state.draw != null ? 'over' : 'playing');
          // A successful broadcast clears any prior rejection, so a later identical
          // rejection re-fires the consumer's [error] effect (which also re-unlocks).
          setError(null);
          break;
        case 'paused':
          setPhase('paused');
          break;
        case 'resumed':
          setState(msg.state);
          // Clear the pre-pause event so OnlineGame's incoming-transition effect
          // treats the resumed snapshot as a null-event re-snap (like gameStart),
          // rather than bailing on its processed-event guard and leaving `before`
          // pointing at stale pre-pause state.
          setLastEvent(null);
          setPhase('playing');
          break;
        case 'over':
          setState(msg.state);
          setPhase('over');
          break;
        case 'kicked':
          // Clear our token so the auto-reconnect can't reclaim the freed seat.
          tokenRef.current = null;
          setKicked(true);
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

  return {
    connected,
    phase,
    roster,
    mode,
    playerCount,
    deathCap,
    targetScore,
    visibility,
    successorRoomCode,
    myPlayerId,
    state,
    lastEvent,
    error,
    kicked,
    send,
  };
}
