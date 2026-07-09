import { describe, it, expect } from 'vitest';
import { lobbyInit, lobbyReduce } from './lobbyReducer';
import type { LobbyRow } from './protocol';

const row = (code: string, filled = 1): LobbyRow => ({ code, mode: 'deathmatch', playerCount: 2, filled });

describe('lobbyReduce', () => {
  it('registers a room and lists it, replying only to the requesting connection', () => {
    let m = lobbyInit();
    m = lobbyReduce(m, { t: 'register', row: row('ABC123') }).model;
    const step = lobbyReduce(m, { t: 'list', connId: 'X' });
    expect(step.out).toEqual([{ to: { connId: 'X' }, msg: { type: 'rooms', rooms: [row('ABC123')] } }]);
  });

  it('re-registering the same code updates the row (e.g. filled count)', () => {
    let m = lobbyInit();
    m = lobbyReduce(m, { t: 'register', row: row('ABC123', 1) }).model;
    m = lobbyReduce(m, { t: 'register', row: row('ABC123', 2) }).model;
    const step = lobbyReduce(m, { t: 'list', connId: 'X' });
    expect((step.out[0].msg as { rooms: LobbyRow[] }).rooms).toEqual([row('ABC123', 2)]);
  });

  it('unregisters a room so it no longer lists', () => {
    let m = lobbyInit();
    m = lobbyReduce(m, { t: 'register', row: row('ABC123') }).model;
    m = lobbyReduce(m, { t: 'unregister', code: 'ABC123' }).model;
    const step = lobbyReduce(m, { t: 'list', connId: 'X' });
    expect((step.out[0].msg as { rooms: LobbyRow[] }).rooms).toEqual([]);
  });
});
