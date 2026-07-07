import { useState } from 'react';
import type { PlayerId, Position } from '../engine';

interface ActionControlsProps {
  currentPlayerId: PlayerId;
  disabled: boolean;
  onMove: (path: Position[]) => void;
  onRest: () => void;
  onFakeMove: (direction: Position) => void;
  onPunch: (targetPos: Position) => void;
  onShoot: (direction: Position) => void;
  onBomb: (targetPos: Position) => void;
}

type Mode = 'move' | 'fakeMove' | 'punch' | 'shoot';

const DIRECTIONS: { label: string; dir: Position }[] = [
  { label: 'N', dir: { x: 0, y: -1 } },
  { label: 'NE', dir: { x: 1, y: -1 } },
  { label: 'E', dir: { x: 1, y: 0 } },
  { label: 'SE', dir: { x: 1, y: 1 } },
  { label: 'S', dir: { x: 0, y: 1 } },
  { label: 'SW', dir: { x: -1, y: 1 } },
  { label: 'W', dir: { x: -1, y: 0 } },
  { label: 'NW', dir: { x: -1, y: -1 } },
];

export function ActionControls({
  currentPlayerId,
  disabled,
  onMove,
  onRest,
  onFakeMove,
  onPunch,
  onShoot,
  onBomb,
}: ActionControlsProps) {
  const [mode, setMode] = useState<Mode>('move');
  const [movePath, setMovePath] = useState<Position[]>([]);
  const [bombX, setBombX] = useState(5);
  const [bombY, setBombY] = useState(5);

  const handleDirectionClick = (dir: Position) => {
    if (mode === 'fakeMove') {
      onFakeMove(dir);
      return;
    }
    if (mode === 'punch') {
      // Punch target is one adjacent tile in this direction from the (unknown-to-this-component)
      // player position; caller resolves the actual target position from currentPlayerId + dir.
      onPunch(dir);
      return;
    }
    if (mode === 'shoot') {
      onShoot(dir);
      return;
    }
    // move mode: accumulate up to 2 steps, submit immediately per step click
    const nextPath = [...movePath, dir];
    if (nextPath.length >= 2) {
      onMove(nextPath);
      setMovePath([]);
    } else {
      setMovePath(nextPath);
    }
  };

  return (
    <div style={{ padding: 12, fontFamily: 'sans-serif' }} data-testid="action-controls" data-current-player={currentPlayerId}>
      <div>
        <button disabled={disabled} onClick={() => setMode('move')}>Move</button>
        <button disabled={disabled} onClick={() => setMode('fakeMove')}>Fake Move</button>
        <button disabled={disabled} onClick={() => setMode('punch')}>Punch</button>
        <button disabled={disabled} onClick={() => setMode('shoot')}>Shoot</button>
        <button disabled={disabled} onClick={onRest}>Rest</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gap: 4, marginTop: 8 }}>
        {DIRECTIONS.map(({ label, dir }) => (
          <button key={label} disabled={disabled} onClick={() => handleDirectionClick(dir)}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <label>
          Bomb target X: <input type="number" value={bombX} min={0} max={10} onChange={(e) => setBombX(Number(e.target.value))} />
        </label>
        <label style={{ marginLeft: 8 }}>
          Bomb target Y: <input type="number" value={bombY} min={0} max={10} onChange={(e) => setBombY(Number(e.target.value))} />
        </label>
        <button disabled={disabled} onClick={() => onBomb({ x: bombX, y: bombY })} style={{ marginLeft: 8 }}>
          Bomb
        </button>
      </div>
    </div>
  );
}
