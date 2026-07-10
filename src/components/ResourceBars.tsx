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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 56, color: theme.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </span>
      <div
        style={{
          position: 'relative',
          flex: 1,
          height: 16,
          background: theme.surfaceAlt,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
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
          width: 52,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
          fontSize: 13,
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
        gap: 8,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        boxShadow: theme.shadow,
        padding: '12px 14px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: player.color, display: 'inline-block' }} />
        <strong style={{ color: theme.heading }}>{displayName ?? player.color.toUpperCase()}</strong>
        {showTurnLabel && <span style={{ color: theme.textMuted, fontSize: 12 }}>— your turn</span>}
      </div>
      <Bar label="Energy" value={player.energy} max={MAX_ENERGY} color={theme.energy} previewValue={preview?.energy} />
      <Bar label="Ammo" value={player.ammo} max={MAX_AMMO} color={theme.ammo} previewValue={preview?.ammo} />
    </div>
  );
}
