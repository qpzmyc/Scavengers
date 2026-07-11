// The origin (host:port, no protocol) of the partyserver worker. The frontend and
// worker are deployed together (see server/wrangler.jsonc's assets binding), so
// production defaults to same-origin; `npm run dev` talks to the separate
// `wrangler dev` process instead. Override either via VITE_PARTY_HOST.
export const PARTY_HOST: string =
  (import.meta.env.VITE_PARTY_HOST as string | undefined) ??
  (import.meta.env.DEV ? '127.0.0.1:8787' : window.location.host);

export const ROOM_PARTY = 'scavengers-server';
export const LOBBY_PARTY = 'lobby-server';
export const LOBBY_ROOM = 'lobby';
