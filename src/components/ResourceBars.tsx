import type { PlayerState } from '../engine';
import { MAX_ENERGY, MAX_AMMO } from '../engine';
import { theme } from '../theme';

export interface ResourcePreview {
  energy: number;
  ammo: number;
}

interface ResourceBarsProps {
  player: PlayerState;
  width: number;
  // Hypothetical resources if the pending (unconfirmed) action were confirmed.
  preview?: ResourcePreview | null;
  // Whether to show "— your turn" next to the name. Defaults to true (hotseat's only call
  // site always renders this component during the viewing player's own turn already).
  showTurnLabel?: boolean;
  // Overrides the color-based name (e.g. a custom online display name). Falls back to
  // player.color.toUpperCase() when omitted.
  displayName?: string;
}

function Bar({
  label,
  value,
  max,
  color,
  previewValue,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  previewValue?: number;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  const cur = clamp(value);
  const hasPreview = previewValue !== undefined && clamp(previewValue) !== cur;
  const prev = hasPreview ? clamp(previewValue!) : cur;
  const lo = Math.min(cur, prev);
  const hi = Math.max(cur, prev);
  const gaining = prev > cur;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bars-row-gap, 10px)' }}>
      <span style={{ width: 'var(--bars-label-w, 56px)', color: theme.textMuted, fontSize: 'var(--bars-label-font, 12px)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </span>
      <div
        style={{
          position: 'relative',
          flex: 1,
          height: 'var(--bars-height, 16px)',
          background: theme.surfaceAlt,
          border: `1px solid ${theme.border}`,
          // Always a full pill, whatever the bar's height becomes.
          borderRadius: 'calc(var(--bars-height, 16px) / 2)',
          overflow: 'hidden',
        }}
      >
        {/* Steady portion that will remain regardless of the pending action. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            right: `${(1 - lo / max) * 100}%`,
            background: color,
            transition: 'right 0.25s ease',
          }}
        />
        {/* Pulsing delta: energy/ammo about to be spent (dimmed) or gained (bright). */}
        {hasPreview && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${(lo / max) * 100}%`,
              width: `${((hi - lo) / max) * 100}%`,
              background: gaining ? color : theme.surfaceAlt,
              boxShadow: gaining ? undefined : `inset 0 0 0 1px ${color}`,
              backgroundImage: gaining
                ? undefined
                : `repeating-linear-gradient(45deg, ${color}55 0 4px, transparent 4px 8px)`,
              animation: 'barPulse 0.9s ease-in-out infinite',
            }}
          />
        )}
      </div>
      <span
        style={{
          width: 'var(--bars-value-w, 52px)',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
          fontSize: 'var(--bars-value-font, 13px)',
        }}
      >
        {value}/{max}
        {hasPreview && <span style={{ color: theme.textMuted }}> →{previewValue}</span>}
      </span>
    </div>
  );
}

export function ResourceBars({ player, width, preview, showTurnLabel = true, displayName }: ResourceBarsProps) {
  return (
    <div
      style={{
        width,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--bars-gap, 8px)',
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        boxShadow: theme.shadow,
        padding: 'var(--bars-pad, 12px 14px)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bars-gap, 8px)', marginBottom: 2 }}>
        <span style={{ width: 'var(--bars-dot, 12px)', height: 'var(--bars-dot, 12px)', borderRadius: '50%', background: player.color, display: 'inline-block', flexShrink: 0 }} />
        <strong style={{ color: theme.heading, fontSize: 'var(--bars-name-font, 15px)' }}>{displayName ?? player.color.toUpperCase()}</strong>
        {showTurnLabel && <span style={{ color: theme.textMuted, fontSize: 'var(--bars-turn-font, 12px)' }}>— your turn</span>}
      </div>
      <Bar label="Energy" value={player.energy} max={MAX_ENERGY} color={theme.energy} previewValue={preview?.energy} />
      <Bar label="Ammo" value={player.ammo} max={MAX_AMMO} color={theme.ammo} previewValue={preview?.ammo} />
    </div>
  );
}
