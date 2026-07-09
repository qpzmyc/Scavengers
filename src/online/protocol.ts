import type { GameState, GameMode, PlayerId, PlayerColor, Position } from '../engine';

// ---- Room lifecycle ----
export type RoomPhase = 'lobby' | 'playing' | 'paused' | 'over';

export interface RosterEntry {
  playerId: PlayerId;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
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
}

// ---- Room party messages ----
export type ClientMsg =
  | { type: 'join' }
  | { type: 'startGame' }
  | { type: 'action'; request: ActionRequest }
  | { type: 'endMatch' };

export type ServerMsg =
  | { type: 'assigned'; playerId: PlayerId }
  | { type: 'roster'; entries: RosterEntry[]; phase: RoomPhase; mode: GameMode; playerCount: number }
  | { type: 'gameStart'; state: GameState }
  | { type: 'state'; state: GameState; event: ActionEvent }
  | { type: 'paused'; disconnected: PlayerId }
  | { type: 'resumed'; state: GameState }
  | { type: 'over'; state: GameState }
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
