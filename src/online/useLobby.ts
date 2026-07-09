import { useCallback, useEffect, useRef, useState } from 'react';
import usePartySocket from 'partysocket/react';
import type { LobbyRow, LobbyClientMsg, LobbyServerMsg } from './protocol';
import { PARTY_HOST, LOBBY_PARTY, LOBBY_ROOM } from './config';

// Subscribe to the public-room list. Sends `list` on open and whenever `refresh` is called.
export function useLobby(): { rooms: LobbyRow[]; refresh: () => void } {
  const [rooms, setRooms] = useState<LobbyRow[]>([]);
  const socket = usePartySocket({
    host: PARTY_HOST,
    party: LOBBY_PARTY,
    room: LOBBY_ROOM,
    onOpen() {
      socketRef.current?.send(JSON.stringify({ type: 'list' } satisfies LobbyClientMsg));
    },
    onMessage(evt: MessageEvent) {
      let msg: LobbyServerMsg;
      try {
        msg = JSON.parse(evt.data as string) as LobbyServerMsg;
      } catch {
        return;
      }
      if (msg.type === 'rooms') setRooms(msg.rooms);
    },
  });
  const socketRef = useRef(socket);
  socketRef.current = socket;

  const refresh = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: 'list' } satisfies LobbyClientMsg));
  }, []);

  return { rooms, refresh };
}

// Keep a public room registered in the lobby while `active` is true; unregister on
// teardown or when `active` goes false. Re-registers whenever `row` changes (e.g. filled count).
export function useLobbyRegistration(row: LobbyRow | null, active: boolean): void {
  const socket = usePartySocket({ host: PARTY_HOST, party: LOBBY_PARTY, room: LOBBY_ROOM });
  const socketRef = useRef(socket);
  socketRef.current = socket;

  useEffect(() => {
    if (!active || !row) return;
    const s = socketRef.current;
    s?.send(JSON.stringify({ type: 'register', row } satisfies LobbyClientMsg));
    return () => {
      s?.send(JSON.stringify({ type: 'unregister', code: row.code } satisfies LobbyClientMsg));
    };
  }, [active, row]);
}
