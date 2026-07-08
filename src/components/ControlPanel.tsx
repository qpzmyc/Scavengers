import type { Position } from '../engine';
import { theme } from '../theme';

export type AttackType = 'punch' | 'shoot' | 'bomb';

export type Flow =
  | { kind: 'menu' }
  | { kind: 'move'; path: Position[] }
  | { kind: 'fakeMove'; target: Position | null }
  | { kind: 'attackReposition'; path: Position[] }
  | { kind: 'attackSelect'; path: Position[]; type: AttackType | null }
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
  // Available width (matches the board's width) that the action buttons should
  // fill edge-to-edge, scaling their padding/font proportionally.
  width?: number;
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

// A row of action buttons stretches to fill the full available width (matching
// the board), with each button growing equally and its padding/font scaling
// proportionally to that width.
const DEFAULT_ROW_WIDTH = 320;

function row(): React.CSSProperties {
  return { display: 'flex', gap: 8, marginTop: 6 };
}

function sizedBtn(variant: Variant, disabled: boolean, active: boolean, width: number): React.CSSProperties {
  const fontSize = Math.max(13, Math.min(22, width / 18));
  const paddingV = Math.max(8, Math.min(18, width / 26));
  const paddingH = Math.max(10, Math.min(24, width / 18));
  return {
    ...btn(variant, disabled, active),
    flex: 1,
    margin: 0,
    fontSize,
    padding: `${paddingV}px ${paddingH}px`,
  };
}

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
  width = DEFAULT_ROW_WIDTH,
}: ControlPanelProps) {
  if (gameOver) {
    return <div style={{ ...wrap, fontStyle: 'italic', color: theme.textMuted }}>Game over — start a new game above.</div>;
  }

  if (flow.kind === 'menu') {
    const noEnergyNote = !can.move && !can.attack && !can.fake;
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Choose an action</div>
        <div style={row()}>
          {/* Never HTML-disabled: clicking while unaffordable is handled by the
              caller, which shows a "not enough X" toast instead of doing nothing. */}
          <button style={sizedBtn('secondary', !can.move, false, width)} onClick={() => onSelectAction('move')}>Move</button>
          <button style={sizedBtn('secondary', !can.attack, false, width)} onClick={() => onSelectAction('attack')}>Attack</button>
          <button style={sizedBtn('secondary', !can.fake, false, width)} onClick={() => onSelectAction('fake')}>Fake Move</button>
          <button style={sizedBtn('secondary', false, false, width)} onClick={() => onSelectAction('rest')}>Rest</button>
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
        <div style={row()}>
          <button style={sizedBtn('secondary', false, false, width)} onClick={onCancel}>Cancel</button>
          <button style={sizedBtn('primary', !confirmEnabled, false, width)} disabled={!confirmEnabled} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    );
  }

  if (flow.kind === 'rest') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Rest</div>
        <div style={hint}>Recover +2 energy (up to the max). You forfeit moving or attacking this turn.</div>
        <div style={row()}>
          <button style={sizedBtn('secondary', false, false, width)} onClick={onCancel}>Cancel</button>
          <button style={sizedBtn('primary', false, false, width)} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    );
  }

  if (flow.kind === 'fakeMove') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Fake Move</div>
        <div style={hint}>Click an adjacent square to project a phantom there (you stay put).</div>
        <div style={row()}>
          <button style={sizedBtn('secondary', false, false, width)} onClick={onCancel}>Cancel</button>
          <button style={sizedBtn('primary', !confirmEnabled, false, width)} disabled={!confirmEnabled} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    );
  }

  if (flow.kind === 'attackReposition') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Attack — reposition (optional)</div>
        <div style={hint}>
          Click an adjacent square to step before choosing a weapon (up to 1 step), or skip straight to picking one. Chosen: {flow.path.length}. Click your last step to undo it. Moving costs 1 energy per tile.
        </div>
        <div style={row()}>
          <button style={sizedBtn('secondary', false, false, width)} onClick={onBack}>Back</button>
          <button style={sizedBtn('primary', false, false, width)} onClick={onNext}>{flow.path.length ? 'Next' : 'Skip'}</button>
        </div>
      </div>
    );
  }

  if (flow.kind === 'attackSelect') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Attack — choose a weapon</div>
        <div style={row()}>
          {/* Always the same (non-greyed) style, regardless of affordability — the
              toast notification is the feedback mechanism now, not a dimmed button. */}
          <button style={sizedBtn('toggle', false, flow.type === 'punch', width)} onClick={() => onSelectAttackType('punch')}>Punch</button>
          <button style={sizedBtn('toggle', false, flow.type === 'shoot', width)} onClick={() => onSelectAttackType('shoot')}>Shoot</button>
          <button style={sizedBtn('toggle', false, flow.type === 'bomb', width)} onClick={() => onSelectAttackType('bomb')}>Bomb</button>
        </div>
        <div style={row()}>
          <button style={sizedBtn('secondary', false, false, width)} onClick={onBack}>Back</button>
          <button style={sizedBtn('primary', flow.type === null, false, width)} disabled={flow.type === null} onClick={onNext}>Next</button>
        </div>
      </div>
    );
  }

  // attackTarget
  return (
    <div style={wrap} data-testid="control-panel">
      <div style={{ ...title, textTransform: 'capitalize' }}>{flow.kind === 'attackTarget' ? flow.type : ''}</div>
      <div style={hint}>{flow.kind === 'attackTarget' ? ATTACK_TARGET_HINT[flow.type] : ''}</div>
      <div style={row()}>
        <button style={sizedBtn('secondary', false, false, width)} onClick={onBack}>Back</button>
        <button style={sizedBtn('primary', !confirmEnabled, false, width)} disabled={!confirmEnabled} onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  );
}
