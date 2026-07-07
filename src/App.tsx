import { useState } from 'react';
import {
  type GameState,
  type GameMode,
  type Position,
  createInitialGameState,
  movePlayer,
  restPlayer,
  fakeMove,
  punch,
  shoot,
  bomb,
  resolveAttack,
  endTurn,
} from './engine';
import { Board } from './components/Board';
import { StatsPanel } from './components/StatsPanel';
import { ActionControls } from './components/ActionControls';

function App() {
  const [mode, setMode] = useState<GameMode>('lastStanding');
  const [state, setState] = useState<GameState>(() => createInitialGameState('lastStanding'));

  const restart = (nextMode: GameMode) => {
    setMode(nextMode);
    setState(createInitialGameState(nextMode));
  };

  const gameOver = state.winner !== null;

  const withNonAttackTurn = (fn: (s: GameState) => GameState) => {
    setState((prev) => {
      const acted = fn(prev);
      return endTurn(acted, prev.currentTurn, false);
    });
  };

  const handleMove = (path: Position[]) => {
    withNonAttackTurn((s) => movePlayer(s, s.currentTurn, path));
  };

  const handleRest = () => {
    withNonAttackTurn((s) => restPlayer(s, s.currentTurn));
  };

  const handleFakeMove = (direction: Position) => {
    withNonAttackTurn((s) => fakeMove(s, s.currentTurn, direction));
  };

  const handlePunch = (direction: Position) => {
    setState((prev) => {
      const attackerId = prev.currentTurn;
      const attacker = prev.players[attackerId];
      const targetPos = { x: attacker.position.x + direction.x, y: attacker.position.y + direction.y };
      const result = punch(prev, attackerId, targetPos);
      const resolved = resolveAttack(result, attackerId);
      return endTurn(resolved, attackerId, result.killedPlayerIds.length > 0);
    });
  };

  const handleShoot = (direction: Position) => {
    setState((prev) => {
      const attackerId = prev.currentTurn;
      const result = shoot(prev, attackerId, direction);
      const resolved = resolveAttack(result, attackerId);
      return endTurn(resolved, attackerId, result.killedPlayerIds.length > 0);
    });
  };

  const handleBomb = (targetPos: Position) => {
    setState((prev) => {
      const attackerId = prev.currentTurn;
      const result = bomb(prev, attackerId, targetPos);
      const resolved = resolveAttack(result, attackerId);
      return endTurn(resolved, attackerId, result.killedPlayerIds.length > 0);
    });
  };

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <div>
        <button onClick={() => restart('lastStanding')} disabled={mode === 'lastStanding' && !gameOver}>
          New Game: Last Standing
        </button>
        <button onClick={() => restart('deathmatch')} style={{ marginLeft: 8 }}>
          New Game: Deathmatch
        </button>
      </div>
      <StatsPanel state={state} />
      <Board state={state} />
      <ActionControls
        currentPlayerId={state.currentTurn}
        disabled={gameOver}
        onMove={handleMove}
        onRest={handleRest}
        onFakeMove={handleFakeMove}
        onPunch={handlePunch}
        onShoot={handleShoot}
        onBomb={handleBomb}
      />
    </div>
  );
}

export default App;
