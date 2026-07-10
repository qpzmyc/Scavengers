import type { Flow } from '../components/ControlPanel';
import type { PlayerState } from '../engine';
import type { ActionRequest } from './protocol';

// Translate a completed ControlPanel Flow into the wire ActionRequest, mirroring
// App.tsx handleConfirm. Returns null when the flow is not yet a committable action
// (no path/target chosen, or an intermediate wizard step). The server reducer
// derives the shoot direction from path+target itself, so attacks forward raw.
export function flowToRequest(flow: Flow, player: PlayerState): ActionRequest | null {
  switch (flow.kind) {
    case 'move':
      return flow.path.length ? { kind: 'move', path: flow.path } : null;
    case 'rest':
      return { kind: 'rest' };
    case 'fakeMove': {
      if (!flow.target) return null;
      const base = player.isPhantom && player.phantomDisplayPosition ? player.phantomDisplayPosition : player.position;
      return { kind: 'fakeMove', dir: { x: flow.target.x - base.x, y: flow.target.y - base.y } };
    }
    case 'attackTarget':
      return flow.target ? { kind: 'attack', type: flow.type, path: flow.path, target: flow.target } : null;
    default:
      return null;
  }
}
