import { createInitialGameState } from './engine';
import { Board } from './components/Board';

function App() {
  const state = createInitialGameState('lastStanding');
  return (
    <div style={{ padding: 16 }}>
      <Board state={state} />
    </div>
  );
}

export default App;
