import type { Position } from '../engine';
import {
  PHANTOM_ENERGY_COST,
  REST_ENERGY_GAIN,
  PUNCH_ENERGY_COST,
  ATTACK_ENERGY_COST,
  SHOOT_AMMO_COST,
  BOMB_AMMO_COST,
} from '../engine';
import { theme } from '../theme';

export type AttackType = 'punch' | 'shoot' | 'bomb';

// A small cost line under a button's label: a signed number (sometimes omitted when
// the amount is variable) followed by a colored dot — yellow = energy, orange = ammo.
type CostKind = 'energy' | 'ammo';
interface CostItem {
  sign: '+' | '-';
  amount?: number;
  kind: CostKind;
}
const DOT_COLOR: Record<CostKind, string> = { energy: theme.energy, ammo: theme.ammo };

// The literal fallbacks below match index.css's `:root` values at
// --ui-scale: 1 — only used if the stylesheet is ever missing, same pattern
// as sizedBtn's fallbacks further down.
function CostBadge({ items }: { items: CostItem[] }) {
  return (
    <span style={{ display: 'flex', gap: 'var(--badge-gap, 9px)', alignItems: 'center', marginTop: 'var(--badge-mt, 4px)', fontSize: 'var(--badge-font, 11px)', fontWeight: 700 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--badge-item-gap, 3px)' }}>
          <span>{it.sign}{it.amount ?? ''}</span>
          <span style={{ width: 'var(--dot-size, 8px)', height: 'var(--dot-size, 8px)', borderRadius: '50%', background: DOT_COLOR[it.kind], display: 'inline-block' }} />
        </span>
      ))}
    </span>
  );
}

// Cost hints shown on each action / weapon button (see CostBadge). Move and Attack
// omit numbers because their cost varies (by tiles / by weapon).
const COST: Record<string, CostItem[]> = {
  move: [{ sign: '-', kind: 'energy' }],
  attack: [{ sign: '-', kind: 'energy' }, { sign: '-', kind: 'ammo' }],
  fake: [{ sign: '-', amount: PHANTOM_ENERGY_COST, kind: 'energy' }],
  rest: [{ sign: '+', amount: REST_ENERGY_GAIN, kind: 'energy' }],
  punch: [{ sign: '-', amount: PUNCH_ENERGY_COST, kind: 'energy' }],
  shoot: [{ sign: '-', amount: ATTACK_ENERGY_COST, kind: 'energy' }, { sign: '-', amount: SHOOT_AMMO_COST, kind: 'ammo' }],
  bomb: [{ sign: '-', amount: BOMB_AMMO_COST, kind: 'ammo' }],
};

// Column layout so a button can stack its label above its cost badge.
const costCol: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, lineHeight: 1.1 };

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
  // Max move-path length for this game (3 in 2-player games, 2 otherwise) — see
  // maxMoveTilesForCount in engine/constants.ts.
  maxMoveTiles: number;
}

const ATTACK_TARGET_HINT: Record<AttackType, string> = {
  punch: 'Click an adjacent square to aim your punch. Click confirm to swing.',
  shoot: 'Click an adjacent square to aim your shot. Click confirm to fire.',
  bomb: 'Click on a square to plant a 3x3 bomb. Click confirm to detonate.',
};

type Variant = 'primary' | 'secondary' | 'toggle';

const baseBtn: React.CSSProperties = {
  padding: '9px 16px',
  margin: '4px 6px 4px 0',
  fontSize: 14,
  fontWeight: 500,
  // Scales with everything else — a radius that stayed fixed would look
  // too-sharp on a much bigger button. border-width stays a flat 1px on
  // purpose (see the `btn()` variants below); a scaling hairline looks heavy.
  borderRadius: 'var(--btn-radius, 8px)',
  cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s',
};

// A row of action buttons stretches to fill the full available width (matching
// the board), with each button growing equally. Stacking (vertical in a narrow
// desktop/phone controls column, horizontal in the wide tablet strip) is
// decided by `--controls-dir`, set once per layout arrangement in
// src/index.css (see the comment on `.game-layout`) rather than derived from
// this element's measured width — width alone can't tell a narrow desktop
// column (which grows with --ui-scale) apart from a wide tablet strip.
const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--row-gap, 8px)',
  marginTop: 'var(--row-mt, 6px)',
  flexDirection: 'var(--controls-dir, column)' as React.CSSProperties['flexDirection'],
};

// The literal fallbacks below (17.78px etc.) match index.css's `:root` values
// at --ui-scale: 1 (320px / 18 and 320px / 26) — only used if the stylesheet
// is ever missing, same pattern as Leaderboard.tsx's `var()` fallbacks.
function sizedBtn(variant: Variant, disabled: boolean, active: boolean): React.CSSProperties {
  return {
    ...btn(variant, disabled, active),
    flex: 1,
    margin: 0,
    fontSize: 'var(--btn-font, 17.78px)',
    padding: 'var(--btn-pad-v, 12.31px) var(--btn-pad-h, 17.78px)',
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

// Fallbacks here match index.css's `:root` values at --ui-scale: 1, same
// pattern as sizedBtn's — only used if the stylesheet is ever missing.
const wrap: React.CSSProperties = { padding: 'var(--panel-pad, 16px)' };
const title: React.CSSProperties = { fontWeight: 800, fontSize: 'var(--title-font, 20px)', letterSpacing: 0.2, marginBottom: 'var(--title-mb, 6px)', color: theme.heading };
const hint: React.CSSProperties = { margin: 'var(--hint-mt, 4px) 0 var(--hint-mb, 12px)', color: theme.textMuted, fontSize: 'var(--hint-font, 13px)' };

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
  maxMoveTiles,
}: ControlPanelProps) {
  if (gameOver) {
    return <div style={{ ...wrap, fontStyle: 'italic', color: theme.textMuted }}>Game over — start a new game above.</div>;
  }

  if (flow.kind === 'menu') {
    const noEnergyNote = !can.move && !can.attack && !can.fake;
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Choose an action</div>
        <div style={rowStyle} className="control-row">
          {/* Never HTML-disabled: clicking while unaffordable is handled by the
              caller, which shows a "not enough X" toast instead of doing nothing. */}
          <button style={{ ...sizedBtn('secondary', !can.move, false), ...costCol }} onClick={() => onSelectAction('move')}><span>Move</span><CostBadge items={COST.move} /></button>
          <button style={{ ...sizedBtn('secondary', !can.attack, false), ...costCol }} onClick={() => onSelectAction('attack')}><span>Attack</span><CostBadge items={COST.attack} /></button>
          <button style={{ ...sizedBtn('secondary', !can.fake, false), ...costCol }} onClick={() => onSelectAction('fake')}><span>Fake Move</span><CostBadge items={COST.fake} /></button>
          <button style={{ ...sizedBtn('secondary', false, false), ...costCol }} onClick={() => onSelectAction('rest')}><span>Rest</span><CostBadge items={COST.rest} /></button>
        </div>
        {noEnergyNote && <div style={hint}>Out of energy — only Rest is available this turn.</div>}
      </div>
    );
  }

  if (flow.kind === 'move') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Move</div>
        <div style={hint}>Click an adjacent square to move (up to {maxMoveTiles} times per turn). Click your character to undo.</div>
        <div style={rowStyle} className="control-row">
          <button style={sizedBtn('secondary', false, false)} onClick={onCancel}>Cancel</button>
          <button style={sizedBtn('primary', !confirmEnabled, false)} disabled={!confirmEnabled} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    );
  }

  if (flow.kind === 'rest') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Rest</div>
        <div style={hint}>Gain +{REST_ENERGY_GAIN} energy. You forfeit moving or attacking this turn.</div>
        <div style={rowStyle} className="control-row">
          <button style={sizedBtn('secondary', false, false)} onClick={onCancel}>Cancel</button>
          <button style={sizedBtn('primary', false, false)} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    );
  }

  if (flow.kind === 'fakeMove') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Fake Move</div>
        <div style={hint}>Click an adjacent square to project or move your phantom (you stay put). Other players can only see your phantom, but you will be crushed if another player steps onto you.</div>
        <div style={rowStyle} className="control-row">
          <button style={sizedBtn('secondary', false, false)} onClick={onCancel}>Cancel</button>
          <button style={sizedBtn('primary', !confirmEnabled, false)} disabled={!confirmEnabled} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    );
  }

  if (flow.kind === 'attackReposition') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Attack — reposition (optional)</div>
        <div style={hint}>
          Click an adjacent square to reposition before attacking (-1 energy), or click skip.
        </div>
        <div style={rowStyle} className="control-row">
          <button style={sizedBtn('secondary', false, false)} onClick={onBack}>Back</button>
          <button style={sizedBtn('primary', false, false)} onClick={onNext}>{flow.path.length ? 'Next' : 'Skip'}</button>
        </div>
      </div>
    );
  }

  if (flow.kind === 'attackSelect') {
    return (
      <div style={wrap} data-testid="control-panel">
        <div style={title}>Attack — choose a weapon</div>
        <div style={rowStyle} className="control-row">
          {/* Always the same (non-greyed) style, regardless of affordability — the
              toast notification is the feedback mechanism now, not a dimmed button. */}
          <button style={{ ...sizedBtn('toggle', false, flow.type === 'punch'), ...costCol }} onClick={() => onSelectAttackType('punch')}><span>Fist</span><CostBadge items={COST.punch} /></button>
          <button style={{ ...sizedBtn('toggle', false, flow.type === 'shoot'), ...costCol }} onClick={() => onSelectAttackType('shoot')}><span>Gun</span><CostBadge items={COST.shoot} /></button>
          <button style={{ ...sizedBtn('toggle', false, flow.type === 'bomb'), ...costCol }} onClick={() => onSelectAttackType('bomb')}><span>Bomb</span><CostBadge items={COST.bomb} /></button>
        </div>
        <div style={rowStyle} className="control-row">
          <button style={sizedBtn('secondary', false, false)} onClick={onBack}>Back</button>
          <button style={sizedBtn('primary', flow.type === null, false)} disabled={flow.type === null} onClick={onNext}>Next</button>
        </div>
      </div>
    );
  }

  // attackTarget
  return (
    <div style={wrap} data-testid="control-panel">
      <div style={{ ...title, textTransform: 'capitalize' }}>{flow.kind === 'attackTarget' ? flow.type : ''}</div>
      <div style={hint}>{flow.kind === 'attackTarget' ? ATTACK_TARGET_HINT[flow.type] : ''}</div>
      <div style={rowStyle} className="control-row">
        <button style={sizedBtn('secondary', false, false)} onClick={onBack}>Back</button>
        <button style={sizedBtn('primary', !confirmEnabled, false)} disabled={!confirmEnabled} onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  );
}
