import type { Position } from '../engine';
import { theme } from '../theme';

export type AttackType = 'punch' | 'shoot' | 'bomb';

export type Flow =
  | { kind: 'menu' }
  | { kind: 'move'; path: Position[] }
  | { kind: 'fakeMove'; target: Position | null }
  | { kind: 'attackSelect'; type: AttackType | null }
  | { kind: 'attackMove'; type: AttackType; path: Position[] }
  | { kind: 'attackTarget'; type: AttackType; path: Position[]; target: Position | null }
  | { kind: 'rest' };

export interface Capabilities {
  move: boolean;
  attack: boolean;
  fake: boolean;
  punch: boolean;
  shoot: boolean;
  bomb: boolean;
}

interface ControlPanelProps {
  flow: Flow;
  gameOver: boolean;
  can: Capabilities;
  confirmEnabled: boolean;
  onSelectAction: (action: 'move' | 'attack' | 'fake' | 'rest') => void;
  onSelectAttackType: (type: AttackType) => void;
  onNext: () => void;
  onConfirm: () => void;
  onBack: () => void;
  onCancel: () => void;
}

const ATTACK_TARGET_HINT: Record<AttackType, string> = {
  punch: 'Click an adjacent square to punch (kills whoever stands there).',
  shoot: 'Click an adjacent square to set your firing direction.',
  bomb: 'Click any square on a straight line (incl. diagonal) from you.',
};

type Variant = 'primary' | 'secondary' | 'toggle';

const baseBtn: React.CSSProperties = {
  padding: '9px 16px',
  margin: '4px 6px 4px 0',
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s',
};

function btn(variant: Variant, disabled: boolean, active = false): React.CSSProperties {
  if (disabled) {
    return { ...baseBtn, background: theme.surfaceAlt, border: `1px solid ${theme.border}`, color: theme.textMuted, cursor: 'not-allowed', opacity: 0.6 };
  }
  if (variant === 'primary') {
    return { ...baseBtn, background: theme.accent, border: `1px solid ${theme.accent}`, color: '#fff' };
  }
  if (variant === 'toggle') {
    return {
      ...baseBtn,
      background: active ? theme.accentSoft : theme.surface,
      border: `1px solid ${active ? theme.accent : theme.border}`,
      color: active ? theme.accentText : theme.text,
    };
  }
  return { ...baseBtn, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text };
}

const wrap: React.CSSProperties = { padding: 16 };
const title: React.CSSProperties = { fontWeight: 600, marginBottom: 4, color: theme.heading };
const hint: React.CSSProperties = { margin: '4px 0 12px', color: theme.textMuted, fontSize: 13 };

export function ControlPanel({
  flow,
  gameOver,
  can,
  confirmEnabled,
  onSelectAction,
  onSelectAttackType,
  onNext,
  onConfirm,
  onBack,
  onCancel,
}: ControlPanelProps) {
  if (gameOver) {
    return <div style={{ ...wrap, fontStyle: 'italic', color: theme.textMuted }}>Game over — start a new game above.</div>;
  }

  if (flow.kind === 'menu') {
    const noEnergyNote = !can.move && !can.attack && !can.fake;
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Choose an action</div>
        <div style={{ marginTop: 6 }}>
          <button style={btn('secondary', !can.move)} disabled={!can.move} onClick={() => onSelectAction('move')}>Move</button>
          <button style={btn('secondary', !can.attack)} disabled={!can.attack} onClick={() => onSelectAction('attack')}>Attack</button>
          <button style={btn('secondary', !can.fake)} disabled={!can.fake} onClick={() => onSelectAction('fake')}>Fake Move</button>
          <button style={btn('secondary', false)} onClick={() => onSelectAction('rest')}>Rest</button>
        </div>
        {noEnergyNote && <div style={hint}>Out of energy — only Rest is available this turn.</div>}
      </div>
    );
  }

  if (flow.kind === 'move') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Move</div>
        <div style={hint}>Click an adjacent square (up to 2 steps). Chosen: {flow.path.length}/2. Click your last step to undo it.</div>
        <button style={btn('secondary', false)} onClick={onCancel}>Cancel</button>
        <button style={btn('primary', !confirmEnabled)} disabled={!confirmEnabled} onClick={onConfirm}>Confirm</button>
      </div>
    );
  }

  if (flow.kind === 'rest') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Rest</div>
        <div style={hint}>Recover +2 energy (up to the max). You forfeit moving or attacking this turn.</div>
        <button style={btn('secondary', false)} onClick={onCancel}>Cancel</button>
        <button style={btn('primary', false)} onClick={onConfirm}>Confirm</button>
      </div>
    );
  }

  if (flow.kind === 'fakeMove') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Fake Move</div>
        <div style={hint}>Click an adjacent square to project a phantom there (you stay put).</div>
        <button style={btn('secondary', false)} onClick={onCancel}>Cancel</button>
        <button style={btn('primary', !confirmEnabled)} disabled={!confirmEnabled} onClick={onConfirm}>Confirm</button>
      </div>
    );
  }

  if (flow.kind === 'attackSelect') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Attack — choose a weapon</div>
        <div style={{ marginTop: 6 }}>
          <button style={btn('toggle', !can.punch, flow.type === 'punch')} disabled={!can.punch} onClick={() => onSelectAttackType('punch')}>Punch</button>
          <button style={btn('toggle', !can.shoot, flow.type === 'shoot')} disabled={!can.shoot} onClick={() => onSelectAttackType('shoot')}>Shoot</button>
          <button style={btn('toggle', !can.bomb, flow.type === 'bomb')} disabled={!can.bomb} onClick={() => onSelectAttackType('bomb')}>Bomb</button>
        </div>
        <div style={{ marginTop: 10 }}>
          <button style={btn('secondary', false)} onClick={onBack}>Back</button>
          <button style={btn('primary', flow.type === null)} disabled={flow.type === null} onClick={onNext}>Next</button>
        </div>
      </div>
    );
  }

  if (flow.kind === 'attackMove') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={{ ...title, textTransform: 'capitalize' }}>{flow.type} — reposition (optional)</div>
        <div style={hint}>
          Click an adjacent square to step toward your target before attacking (up to 1 step), or skip straight to aiming. Chosen: {flow.path.length}. Click your last step to undo it. Moving costs 1 energy per tile.
        </div>
        <button style={btn('secondary', false)} onClick={onBack}>Back</button>
        <button style={btn('primary', false)} onClick={onNext}>{flow.path.length ? 'Next' : 'Skip'}</button>
      </div>
    );
  }

  // attackTarget
  return (
    <div style={wrap} data-testid="control-panel">
      <div style={{ ...title, textTransform: 'capitalize' }}>{flow.kind === 'attackTarget' ? flow.type : ''}</div>
      <div style={hint}>{flow.kind === 'attackTarget' ? ATTACK_TARGET_HINT[flow.type] : ''}</div>
      <button style={btn('secondary', false)} onClick={onBack}>Back</button>
      <button style={btn('primary', !confirmEnabled)} disabled={!confirmEnabled} onClick={onConfirm}>Confirm</button>
    </div>
  );
}
