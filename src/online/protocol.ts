import type { GameState, GameMode, PlayerId, PlayerColor, Position } from '../engine';

// ---- Room lifecycle ----
export type RoomPhase = 'lobby' | 'playing' | 'paused' | 'over';

export interface RosterEntry {
  playerId: PlayerId;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
  name: string | null;
}

// ---- Actions (client -> server intent; also echoed inside ActionEvent) ----
export type AttackKind = 'punch' | 'shoot' | 'bomb';

export type ActionRequest =
  | { kind: 'move'; path: Position[] }
  | { kind: 'rest' }
  | { kind: 'fakeMove'; dir: Position }
  | { kind: 'attack'; type: AttackKind; path: Position[]; target: Position };

// What actually happened, broadcast so every client can reconstruct animation frames.
export interface ActionEvent {
  actorId: PlayerId;
  request: ActionRequest;
  killedPlayerIds: PlayerId[];
  // Players whose phantom (decoy) was caught in an attack's hit tiles but who survived
  // (their real position wasn't hit) — the attack only tagged the decoy.
  phantomHitPlayerIds: PlayerId[];
  // Set when the mover walked their real character into this player's spawn zone,
  // destroying the mover's own phantom in the process.
  phantomSpawnOwnerId?: PlayerId;
}

// ---- Room party messages ----
export type ClientMsg =
  | { type: 'join'; token?: string; becomeHost?: boolean; seat?: PlayerId }
  | { type: 'startGame' }
  | { type: 'action'; request: ActionRequest }
  | { type: 'endMatch' }
  | { type: 'setName'; name: string }
  | { type: 'updateSettings'; mode: GameMode; deathCap: number; targetScore: number }
  | { type: 'makeHost'; playerId: PlayerId }
  | { type: 'kickPlayer'; playerId: PlayerId }
  | { type: 'backToLobby'; roomCode: string }
  // Deliberate mid-game leave: remove me from the match right away (no reconnect grace).
  | { type: 'leave' };

export type ServerMsg =
  | { type: 'assigned'; playerId: PlayerId; token: string }
  | {
      type: 'roster';
      entries: RosterEntry[];
      phase: RoomPhase;
      mode: GameMode;
      playerCount: number;
      deathCap: number;
      targetScore: number;
      visibility: 'public' | 'private';
      // Set once someone has clicked "Back to Lobby" after this match ended — the room
      // code of the fresh rematch room every other player should join into.
      successorRoomCode: string | null;
    }
  | { type: 'gameStart'; state: GameState }
  | { type: 'state'; state: GameState; event: ActionEvent }
  | { type: 'paused'; disconnected: PlayerId }
  | { type: 'resumed'; state: GameState }
  // A player was removed from the game (left, or a disconnect grace expired). Carries the
  // post-removal state; clients snap to it and toast "<name> has left".
  | { type: 'playerLeft'; playerId: PlayerId; state: GameState }
  | { type: 'over'; state: GameState }
  | { type: 'kicked' }
  | { type: 'error'; message: string };

// ---- Lobby (public-room registry) messages ----
export interface LobbyRow {
  code: string;
  mode: GameMode;
  playerCount: number;
  filled: number;
}

export type LobbyClientMsg =
  | { type: 'register'; row: LobbyRow }
  | { type: 'unregister'; code: string }
  | { type: 'list' };

export type LobbyServerMsg = { type: 'rooms'; rooms: LobbyRow[] };
