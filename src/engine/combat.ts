import type { GameState, PlayerId, Position } from './types';
import { isInBounds, isWall } from './board';
import { ATTACK_ENERGY_COST, PUNCH_ENERGY_COST, SHOOT_AMMO_COST, BOMB_AMMO_COST } from './constants';
import { clearPhantom } from './phantom';

function spendAttackEnergy(state: GameState, attackerId: PlayerId): GameState {
  const attacker = state.players[attackerId];
  return {
    ...state,
    players: {
      ...state.players,
      [attackerId]: { ...attacker, energy: attacker.energy - ATTACK_ENERGY_COST },
    },
  };
}

function killIfPresent(state: GameState, pos: Position, excludeId?: PlayerId): { state: GameState; killedPlayerIds: PlayerId[] } {
  const killed: PlayerId[] = [];
  let players = state.players;
  state.turnOrder.forEach((id) => {
    if (id === excludeId) return;
    const p = players[id];
    if (
      p.alive &&
      !p.eliminated &&
      p.immuneTurns === 0 &&
      p.position.x === pos.x &&
      p.position.y === pos.y
    ) {
      players = { ...players, [id]: { ...p, alive: false } };
      killed.push(id);
    }
  });
  return { state: { ...state, players }, killedPlayerIds: killed };
}

function killAtPositions(state: GameState, positions: Position[]): { state: GameState; killedPlayerIds: PlayerId[] } {
  let current = state;
  const killed: PlayerId[] = [];
  for (const pos of positions) {
    const result = killIfPresent(current, pos);
    current = result.state;
    for (const id of result.killedPlayerIds) {
      if (!killed.includes(id)) killed.push(id);
    }
  }
  return { state: current, killedPlayerIds: killed };
}

// The 8 tiles surrounding a position, in circular order starting from North.
const RING_OFFSETS: Position[] = [
  { x: 0, y: -1 }, // N
  { x: 1, y: -1 }, // NE
  { x: 1, y: 0 }, // E
  { x: 1, y: 1 }, // SE
  { x: 0, y: 1 }, // S
  { x: -1, y: 1 }, // SW
  { x: -1, y: 0 }, // W
  { x: -1, y: -1 }, // NW
];

function spendPunchEnergy(state: GameState, attackerId: PlayerId): GameState {
  const attacker = state.players[attackerId];
  return {
    ...state,
    players: {
      ...state.players,
      [attackerId]: { ...attacker, energy: attacker.energy - PUNCH_ENERGY_COST },
    },
  };
}

export function punch(state: GameState, attackerId: PlayerId, targetPos: Position): { state: GameState; killedPlayerIds: PlayerId[] } {
  const attacker = state.players[attackerId];
  const dx = Math.abs(targetPos.x - attacker.position.x);
  const dy = Math.abs(targetPos.y - attacker.position.y);
  if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
    throw new Error('Punch target must be adjacent (including diagonal)');
  }
  if (attacker.energy < PUNCH_ENERGY_COST) {
    throw new Error('Not enough energy to attack');
  }

  const ringIndex = RING_OFFSETS.findIndex(
    (offset) => attacker.position.x + offset.x === targetPos.x && attacker.position.y + offset.y === targetPos.y
  );
  const hitOffsets =
    ringIndex === -1
      ? [{ x: targetPos.x - attacker.position.x, y: targetPos.y - attacker.position.y }]
      : [RING_OFFSETS[(ringIndex - 1 + 8) % 8], RING_OFFSETS[ringIndex], RING_OFFSETS[(ringIndex + 1) % 8]];
  const hitPositions = hitOffsets.map((offset) => ({ x: attacker.position.x + offset.x, y: attacker.position.y + offset.y }));

  let next = clearPhantom(state, attackerId);
  next = spendPunchEnergy(next, attackerId);
  const { state: finalState, killedPlayerIds } = killAtPositions(next, hitPositions);
  return { state: finalState, killedPlayerIds };
}

export function traceLine(board: GameState['board'], from: Position, direction: Position): Position[] {
  const line: Position[] = [];
  let cursor: Position = { x: from.x + direction.x, y: from.y + direction.y };
  while (isInBounds(cursor) && !isWall(board, cursor)) {
    line.push(cursor);
    cursor = { x: cursor.x + direction.x, y: cursor.y + direction.y };
  }
  return line;
}

export function shoot(state: GameState, attackerId: PlayerId, direction: Position): { state: GameState; killedPlayerIds: PlayerId[] } {
  const attacker = state.players[attackerId];
  if (attacker.ammo < SHOOT_AMMO_COST) {
    throw new Error('Not enough ammo to shoot');
  }
  if (attacker.energy < ATTACK_ENERGY_COST) {
    throw new Error('Not enough energy to attack');
  }

  let next = clearPhantom(state, attackerId);
  next = spendAttackEnergy(next, attackerId);
  next = {
    ...next,
    players: {
      ...next.players,
      [attackerId]: { ...next.players[attackerId], ammo: next.players[attackerId].ammo - SHOOT_AMMO_COST },
    },
  };

  // Piercing shot: the line passes through every qualifying player standing on it.
  const line = traceLine(next.board, attacker.position, direction);
  const hitPositions = line.filter((pos) =>
    next.turnOrder.some((id) => {
      if (id === attackerId) return false;
      const p = next.players[id];
      return p.alive && !p.eliminated && p.immuneTurns === 0 && p.position.x === pos.x && p.position.y === pos.y;
    })
  );

  if (hitPositions.length === 0) {
    return { state: next, killedPlayerIds: [] };
  }
  return killAtPositions(next, hitPositions);
}

function isOnStraightLine(from: Position, to: Position): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return false;
  if (dx === 0 || dy === 0) return true;
  return Math.abs(dx) === Math.abs(dy);
}

export function bomb(state: GameState, attackerId: PlayerId, targetPos: Position): { state: GameState; killedPlayerIds: PlayerId[] } {
  const attacker = state.players[attackerId];
  if (attacker.ammo < BOMB_AMMO_COST) {
    throw new Error('Not enough ammo to bomb');
  }
  if (!isOnStraightLine(attacker.position, targetPos)) {
    throw new Error('Bomb target must be on a straight line (incl. diagonal) from the attacker');
  }

  // A bomb costs only ammo — no energy (any reposition step before it is charged separately).
  let next = clearPhantom(state, attackerId);
  next = {
    ...next,
    players: {
      ...next.players,
      [attackerId]: { ...next.players[attackerId], ammo: next.players[attackerId].ammo - BOMB_AMMO_COST },
    },
  };

  const killed: PlayerId[] = [];
  let players = next.players;
  next.turnOrder.forEach((id) => {
    const p = players[id];
    const inBlast = Math.abs(p.position.x - targetPos.x) <= 1 && Math.abs(p.position.y - targetPos.y) <= 1;
    if (inBlast && p.alive && !p.eliminated && p.immuneTurns === 0) {
      players = { ...players, [id]: { ...p, alive: false } };
      killed.push(id);
    }
  });

  return { state: { ...next, players }, killedPlayerIds: killed };
}
