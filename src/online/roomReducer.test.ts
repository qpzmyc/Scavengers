import { describe, it, expect } from 'vitest';
import { roomInit, roomReduce, isAbandonedInLobby, type RoomModel } from './roomReducer';

// Seat two connections into a fresh 2-player room, returning the model after both joins.
function seatedTwo(): RoomModel {
  let m = roomInit('deathmatch', 2);
  m = roomReduce(m, { t: 'connect', connId: 'A' }).model;
  m = roomReduce(m, { t: 'join', connId: 'A', issueToken: 'tokA' }).model; // host -> p1
  m = roomReduce(m, { t: 'connect', connId: 'B' }).model;
  m = roomReduce(m, { t: 'join', connId: 'B', issueToken: 'tokB' }).model; // -> p2
  return m;
}

describe('roomReduce', () => {
  it('assigns the first joiner as host p1 and replies with an assigned message (incl. token) + roster', () => {
    let m = roomInit('deathmatch', 2);
    const step = roomReduce(m, { t: 'join', connId: 'A', issueToken: 'tokA' });
    m = step.model;
    expect(m.slots[0].connId).toBe('A');
    expect(m.hostConnId).toBe('A');
    expect(step.out).toContainEqual({ to: { connId: 'A' }, msg: { type: 'assigned', playerId: 'p1', token: 'tokA' } });
    expect(step.out.some((o) => o.to === 'all' && o.msg.type === 'roster')).toBe(true);
  });

  it('rejects startGame until every slot is filled, then broadcasts gameStart', () => {
    let m = roomInit('deathmatch', 2);
    m = roomReduce(m, { t: 'join', connId: 'A', issueToken: 'tokA' }).model;
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

  it('broadcasts new state on a legal action and errors to the sender on an out-of-turn action', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model;
    // startGame now picks a random first turn, so resolve actor/non-actor dynamically
    // instead of assuming p1 (connId 'A') always goes first.
    const firstTurn = m.state!.currentTurn;
    const [actorConnId, otherConnId] = firstTurn === 'p1' ? ['A', 'B'] : ['B', 'A'];
    const bad = roomReduce(m, { t: 'action', connId: otherConnId, request: { kind: 'rest' } });
    expect(bad.out).toContainEqual({ to: { connId: otherConnId }, msg: { type: 'error', message: expect.stringMatching(/turn/i) } });

    const good = roomReduce(m, { t: 'action', connId: actorConnId, request: { kind: 'rest' } });
    expect(good.out.find((o) => o.to === 'all' && o.msg.type === 'state')).toBeDefined();
    expect(good.model.state!.currentTurn).toBe(firstTurn === 'p1' ? 'p2' : 'p1');
  });

  it('pauses on mid-game disconnect and resumes only when the ORIGINAL player rejoins with their token', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model;
    const dropped = roomReduce(m, { t: 'disconnect', connId: 'B' });
    m = dropped.model;
    expect(m.phase).toBe('paused');
    expect(dropped.out.some((o) => o.to === 'all' && o.msg.type === 'paused')).toBe(true);

    const rejoin = roomReduce(m, { t: 'join', connId: 'B2', token: 'tokB', issueToken: 'tokNEW' });
    m = rejoin.model;
    expect(m.phase).toBe('playing');
    expect(rejoin.out.some((o) => o.to === 'all' && o.msg.type === 'resumed')).toBe(true);
    const p2 = m.slots.find((s) => s.playerId === 'p2')!;
    expect(p2.connId).toBe('B2');
    expect(p2.token).toBe('tokB'); // seat token preserved across reconnect
  });

  it('a join WITHOUT the seat token cannot hijack a reserved seat during a pause', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model;
    m = roomReduce(m, { t: 'disconnect', connId: 'B' }).model; // p2 reserved
    const hijack = roomReduce(m, { t: 'join', connId: 'X', issueToken: 'tokX' }); // no token presented
    expect(hijack.model.phase).toBe('paused');
    expect(hijack.out.some((o) => o.msg.type === 'assigned')).toBe(false);
    expect(hijack.out.some((o) => o.msg.type === 'error')).toBe(true);
  });

  it('a join with the WRONG token cannot take a reserved seat', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model;
    m = roomReduce(m, { t: 'disconnect', connId: 'B' }).model;
    const bad = roomReduce(m, { t: 'join', connId: 'X', token: 'wrong', issueToken: 'tokX' });
    expect(bad.out.some((o) => o.msg.type === 'assigned')).toBe(false);
    expect(bad.out.some((o) => o.msg.type === 'error')).toBe(true);
  });

  it('frees a lobby slot (and its token) on disconnect so a new connection can take it', () => {
    let m = roomInit('deathmatch', 2);
    m = roomReduce(m, { t: 'join', connId: 'A', issueToken: 'tokA' }).model; // p1 host
    m = roomReduce(m, { t: 'join', connId: 'B', issueToken: 'tokB' }).model; // p2
    m = roomReduce(m, { t: 'disconnect', connId: 'B' }).model; // lobby -> slot freed
    const p2 = m.slots.find((s) => s.playerId === 'p2')!;
    expect(p2.connId).toBeNull();
    expect(p2.token).toBeNull();
    const rejoin = roomReduce(m, { t: 'join', connId: 'C', issueToken: 'tokC' });
    expect(rejoin.model.slots.find((s) => s.playerId === 'p2')!.connId).toBe('C');
  });

  it('lets the host end the match', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'startGame', connId: 'A' }).model;
    const step = roomReduce(m, { t: 'endMatch', connId: 'A' });
    expect(step.model.phase).toBe('over');
    expect(step.out.some((o) => o.to === 'all' && o.msg.type === 'over')).toBe(true);
  });

  it('setName trims and stores a custom name on the caller\'s own seat, then broadcasts roster', () => {
    let m = seatedTwo();
    const step = roomReduce(m, { t: 'setName', connId: 'A', name: '  Ellie  ' });
    m = step.model;
    expect(m.slots.find((s) => s.connId === 'A')?.name).toBe('Ellie');
    const rosterMsg = step.out.find((o) => o.to === 'all' && o.msg.type === 'roster');
    expect(rosterMsg).toBeDefined();
    const entries = (rosterMsg!.msg as { entries: { playerId: string; name: string | null }[] }).entries;
    expect(entries.find((e) => e.playerId === 'p1')?.name).toBe('Ellie');
  });

  it('setName with an empty/whitespace-only name clears back to null', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'setName', connId: 'A', name: 'Ellie' }).model;
    m = roomReduce(m, { t: 'setName', connId: 'A', name: '   ' }).model;
    expect(m.slots.find((s) => s.connId === 'A')?.name).toBeNull();
  });

  it('setName clamps to 16 characters', () => {
    let m = seatedTwo();
    m = roomReduce(m, { t: 'setName', connId: 'A', name: 'ThisNameIsWayTooLongForARoster' }).model;
    expect(m.slots.find((s) => s.connId === 'A')?.name).toBe('ThisNameIsWayToo');
  });

  it('setName from a connId not seated in the room is a no-op', () => {
    const m = seatedTwo();
    const step = roomReduce(m, { t: 'setName', connId: 'stranger', name: 'X' });
    expect(step.model).toEqual(m);
    expect(step.out).toEqual([]);
  });

  it('startGame picks a currentTurn that is always a member of turnOrder (randomized across many runs)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const m = seatedTwo();
      const started = roomReduce(m, { t: 'startGame', connId: 'A' });
      const state = started.model.state!;
      expect(state.turnOrder).toContain(state.currentTurn);
      seen.add(state.currentTurn);
    }
    // Over 40 runs with a 2-way random pick, both players should have gone first at least once.
    expect(seen.size).toBe(2);
  });

  it('isAbandonedInLobby is true only when every slot is disconnected and the room never started', () => {
    let m = seatedTwo();
    expect(isAbandonedInLobby(m)).toBe(false); // both connected
    m = roomReduce(m, { t: 'disconnect', connId: 'A' }).model;
    expect(isAbandonedInLobby(m)).toBe(false); // B still connected
    m = roomReduce(m, { t: 'disconnect', connId: 'B' }).model;
    expect(isAbandonedInLobby(m)).toBe(true); // both gone, still lobby

    let started = seatedTwo();
    started = roomReduce(started, { t: 'startGame', connId: 'A' }).model;
    started = roomReduce(started, { t: 'disconnect', connId: 'A' }).model;
    started = roomReduce(started, { t: 'disconnect', connId: 'B' }).model;
    expect(isAbandonedInLobby(started)).toBe(false); // phase is 'paused', not 'lobby'
  });
});
