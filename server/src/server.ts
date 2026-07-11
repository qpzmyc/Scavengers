import { Server, routePartykitRequest, type Connection, type ConnectionContext } from 'partyserver';
import type { GameMode } from '../../src/engine';
import type { ClientMsg, LobbyClientMsg, ServerMsg } from '../../src/online/protocol';
import { roomInit, roomReduce, isAbandonedInLobby, type RoomInput, type RoomModel } from '../../src/online/roomReducer';
import { lobbyInit, lobbyReduce, type LobbyModel } from '../../src/online/lobbyReducer';

function parse<T>(raw: string | ArrayBuffer | ArrayBufferView): T | null {
  try {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// The room party: one Durable Object per room id. Holds the authoritative RoomModel.
export class ScavengersServer extends Server<Record<string, unknown>> {
  static options = { hibernate: false };
  model: RoomModel | null = null;

  onConnect(conn: Connection, ctx: ConnectionContext) {
    if (!this.model) {
      const url = new URL(ctx.request.url);
      // Only the creating client's first connect carries `create=1`; anyone else hitting an
      // as-yet-nonexistent room code (a typo, a stale link) gets rejected instead of silently
      // spinning up a brand-new empty room under their feet.
      if (url.searchParams.get('create') !== '1') {
        conn.send(JSON.stringify({ type: 'error', message: 'Invalid room code.' } satisfies ServerMsg));
        conn.close();
        return;
      }
      // The creating client passes the room settings as query params on first connect.
      const mode = (url.searchParams.get('mode') as GameMode) || 'lastStanding';
      const count = Number(url.searchParams.get('count')) || 2;
      const deathCapParam = Number(url.searchParams.get('deathCap'));
      const targetScoreParam = Number(url.searchParams.get('targetScore'));
      const visibility = url.searchParams.get('visibility') === 'private' ? 'private' : 'public';
      this.model = roomInit(mode, count, {
        deathCap: Number.isFinite(deathCapParam) && deathCapParam > 0 ? deathCapParam : undefined,
        targetScore: Number.isFinite(targetScoreParam) && targetScoreParam > 0 ? targetScoreParam : undefined,
        visibility,
      });
    }
    this.dispatch({ t: 'connect', connId: conn.id });
  }

  onMessage(conn: Connection, raw: string | ArrayBuffer | ArrayBufferView) {
    const msg = parse<ClientMsg>(raw);
    if (!msg) return;
    if (msg.type === 'join') this.dispatch({ t: 'join', connId: conn.id, token: msg.token, issueToken: crypto.randomUUID(), becomeHost: msg.becomeHost, seat: msg.seat });
    else if (msg.type === 'startGame') this.dispatch({ t: 'startGame', connId: conn.id });
    else if (msg.type === 'action') this.dispatch({ t: 'action', connId: conn.id, request: msg.request });
    else if (msg.type === 'endMatch') this.dispatch({ t: 'endMatch', connId: conn.id });
    else if (msg.type === 'setName') this.dispatch({ t: 'setName', connId: conn.id, name: msg.name });
    else if (msg.type === 'updateSettings') this.dispatch({ t: 'updateSettings', connId: conn.id, mode: msg.mode, deathCap: msg.deathCap, targetScore: msg.targetScore });
    else if (msg.type === 'makeHost') this.dispatch({ t: 'makeHost', connId: conn.id, playerId: msg.playerId });
    else if (msg.type === 'kickPlayer') this.dispatch({ t: 'kickPlayer', connId: conn.id, playerId: msg.playerId });
    else if (msg.type === 'backToLobby') this.dispatch({ t: 'backToLobby', connId: conn.id, roomCode: msg.roomCode });
  }

  onClose(conn: Connection) {
    this.dispatch({ t: 'disconnect', connId: conn.id });
  }

  private dispatch(input: RoomInput) {
    if (!this.model) return;
    const step = roomReduce(this.model, input);
    this.model = step.model;
    for (const o of step.out) {
      const payload = JSON.stringify(o.msg);
      if (o.to === 'all') this.broadcast(payload);
      else this.getConnection(o.to.connId)?.send(payload);
    }
    if (input.t === 'disconnect' && isAbandonedInLobby(this.model)) {
      this.delistFromLobby();
    }
  }

  // Best-effort: if this fails, the room simply lingers in the public list until someone
  // clicks it and gets an error — not a correctness issue, just a stale-listing cosmetic one.
  private delistFromLobby() {
    type LobbyStub = { unregisterRoom(code: string): Promise<void> };
    type LobbyNamespace = { idFromName(name: string): unknown; get(id: unknown): LobbyStub };
    const lobbyNs = (this.env as Record<string, unknown>).LobbyServer as LobbyNamespace;
    const stub = lobbyNs.get(lobbyNs.idFromName('lobby'));
    stub.unregisterRoom(this.name).catch((err: unknown) => {
      console.error('Failed to delist abandoned room:', err);
    });
  }
}

// The lobby party: a single Durable Object (room id "lobby") holding the public-room registry.
export class LobbyServer extends Server<Record<string, unknown>> {
  static options = { hibernate: false };
  model: LobbyModel = lobbyInit();

  // Callable via Durable Object RPC from ScavengersServer when a room is abandoned
  // while still in its lobby (see ScavengersServer.dispatch above) — not a client wire message.
  async unregisterRoom(code: string): Promise<void> {
    const step = lobbyReduce(this.model, { t: 'unregister', code });
    this.model = step.model;
    this.broadcast(JSON.stringify({ type: 'rooms', rooms: Object.values(this.model.rooms) }));
  }

  onMessage(conn: Connection, raw: string | ArrayBuffer | ArrayBufferView) {
    const msg = parse<LobbyClientMsg>(raw);
    if (!msg) return;
    const input =
      msg.type === 'register'
        ? ({ t: 'register', row: msg.row } as const)
        : msg.type === 'unregister'
          ? ({ t: 'unregister', code: msg.code } as const)
          : ({ t: 'list', connId: conn.id } as const);
    const step = lobbyReduce(this.model, input);
    this.model = step.model;
    for (const o of step.out) {
      const payload = JSON.stringify(o.msg);
      if (o.to === 'all') this.broadcast(payload);
      else this.getConnection(o.to.connId)?.send(payload);
    }
  }
}

interface Env extends Record<string, unknown> {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env) {
    const partyResponse = await routePartykitRequest(request, env);
    if (partyResponse) return partyResponse;
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
