// The origin (host:port, no protocol) of the partyserver worker. Defaults to the
// local `wrangler dev` address; override in production via VITE_PARTY_HOST.
export const PARTY_HOST: string =
  (import.meta.env.VITE_PARTY_HOST as string | undefined) ?? '127.0.0.1:8787';

export const ROOM_PARTY = 'scavengers-server';
export const LOBBY_PARTY = 'lobby-server';
export const LOBBY_ROOM = 'lobby';
