import { describe, it, expect } from 'vitest';
import { roomInit, roomReduce, type RoomModel } from './roomReducer';

// Seat two connections into a fresh 2-player room, returning the model after both joins.
function seatedTwo(): RoomModel {
  let m = roomInit('deathmatch', 2);
  m = roomReduce(m, { t: 'connect', connId: 'A' }).model;
  m = roomReduce(m, { t: 'join', connId: 'A' }).model; // host -> p1
  m = roomReduce(m, { t: 'connect', connId: 'B' }).model;
  m = roomReduce(m, { t: 'join', connId: 'B' }).model; // -> p2
  return m;
}

describe('roomReduce', () => {
  it('assigns the first joiner as host p1 and replies with an assigned message + roster', () => {
    let m = roomInit('deathmatch', 2);
    const step = roomReduce(m, { t: 'join', connId: 'A' });
    m = step.model;
    expect(m.slots[0].connId).toBe('A');
    expect(m.hostConnId).toBe('A');
    expect(step.out).toContainEqual({ to: { connId: 'A' }, msg: { type: 'assigned', playerId: 'p1' } });
    expect(step.out.some((o) => o.to === 'all' && o.msg.type === 'roster')).toBe(true);
  });

  it('rejects startGame until every slot is filled, then broadcasts gameStart', () => {
    let m = roomInit('deathmatch', 2);
    m = roomReduce(m, { t: 'join', connId: 'A' }).model;
    const early = roomReduce(m, { t: 'startGame', connId: 'A' });
    expect(early.out).toContainEqual({ to: { connId: 'A' }, msg: { type: 'error', message: expect.stringMatching(/full/i) } });
    expect(early.model.phase).toBe('lobby');

    m = seatedTwo();
    const started = roomReduce(m, { t: 'startGame', connId: 'A' });
    expect(started.model.phase).toBe('playing');
    expect(started.model.state).not.toBeNull();
    expect(started.out.some((o) => o.to === 'all' && o.msg.type === 'gameStart')).toBe(true);
  });

  it('rejects startGame from a non-host', () => {
    const m = seatedTwo();
    const step = roomReduce(m, { t: 'startGame', connId: 'B' });
    expect(step.model.phase).toBe('lobby');
    expect(step.out).toContainEqual({ to: { connId: 'B' }, msg: { type: 'error', message: expect.stringMatching(/host/i) } });
  });

  it('broadcasts new state on a legal action and returns an error to the sender on an out-of-turn action', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model; // currentTurn p1 (A)
    const bad = roomReduce(m, { t: 'action', connId: 'B', request: { kind: 'rest' } }); // B is p2, not their turn
    expect(bad.out).toContainEqual({ to: { connId: 'B' }, msg: { type: 'error', message: expect.stringMatching(/turn/i) } });

    const good = roomReduce(m, { t: 'action', connId: 'A', request: { kind: 'rest' } });
    const stateMsg = good.out.find((o) => o.to === 'all' && o.msg.type === 'state');
    expect(stateMsg).toBeDefined();
    expect(good.model.state!.currentTurn).toBe('p2');
  });

  it('pauses the game when a player disconnects mid-match and resumes when they rejoin', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model;
    const dropped = roomReduce(m, { t: 'disconnect', connId: 'B' });
    m = dropped.model;
    expect(m.phase).toBe('paused');
    expect(dropped.out.some((o) => o.to === 'all' && o.msg.type === 'paused')).toBe(true);

    const rejoin = roomReduce(m, { t: 'join', connId: 'B2' });
    m = rejoin.model;
    expect(m.phase).toBe('playing');
    expect(rejoin.out.some((o) => o.to === 'all' && o.msg.type === 'resumed')).toBe(true);
    expect(m.slots.find((s) => s.playerId === 'p2')!.connId).toBe('B2');
  });

  it('frees a lobby slot on disconnect so a new connection can take it', () => {
    let m = roomInit('deathmatch', 2);
    m = roomReduce(m, { t: 'join', connId: 'A' }).model; // p1 host
    m = roomReduce(m, { t: 'join', connId: 'B' }).model; // p2
    m = roomReduce(m, { t: 'disconnect', connId: 'B' }).model; // still lobby -> slot freed
    expect(m.slots.find((s) => s.playerId === 'p2')!.connId).toBeNull();
    const rejoin = roomReduce(m, { t: 'join', connId: 'C' });
    expect(rejoin.model.slots.find((s) => s.playerId === 'p2')!.connId).toBe('C');
  });

  it('lets the host end the match', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model;
    const step = roomReduce(m, { t: 'endMatch', connId: 'A' });
    expect(step.model.phase).toBe('over');
    expect(step.out.some((o) => o.to === 'all' && o.msg.type === 'over')).toBe(true);
  });
});
