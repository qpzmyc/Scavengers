import { useState } from 'react';
import type { GameState, PlayerId } from '../engine';
import { theme } from '../theme';
import { Modal } from './Modal';
import { DELTA_MS, useScoreCounts, useScoreMap } from './useScoreCounts';

// Green for a gain, red for a loss. Both are also player colours here, so the
// sign carries the meaning on its own and the colour only reinforces it.
const GAIN = '#4ade80';
const LOSS = '#f87171';
// The same two colours behind the whole row. Kept faint: this sits under the
// player's name and their score, and both have to stay readable through it.
export const GAIN_WASH = 'rgba(74, 222, 128, 0.16)';
export const LOSS_WASH = 'rgba(248, 113, 113, 0.16)';

/**
 * What the "?" beside the title explains. Shared rather than written twice: the
 * desktop leaderboard opens it in its own popup, and on a phone the standings
 * popup swaps its contents for it, since a popup over a popup would dim the
 * background twice.
 *
 * The amounts take the same green and red as the +5 / -3 that animate on the
 * rows, so the legend and the thing it explains read as the same system.
 */
export function ScoringNote() {
  const rules: [string, string, string][] = [
    ['+5', 'a kill', GAIN],
    ['−3', 'a death', LOSS],
    ['+1', 'a streak', GAIN],
  ];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rules.map(([amount, what, color]) => (
        <div key={what} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span
            style={{
              minWidth: 34,
              textAlign: 'right',
              fontSize: 16,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color,
            }}
          >
            {amount}
          </span>
          <span style={{ fontSize: 14, color: theme.text }}>{what}</span>
        </div>
      ))}
      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
        A streak is the most consecutive turns you have stayed alive.
      </div>
    </div>
  );
}

interface LeaderboardProps {
  state: GameState;
  // Overrides the color-based label per player (e.g. a custom online display name).
  // Falls back to color.toUpperCase() when omitted (hotseat's call sites omit it).
  displayName?: (id: PlayerId) => string;
  // Set when a Modal title already names this table, so the word doesn't appear
  // twice a few pixels apart. The rest of the header row (the "?" button and the
  // target score) stays either way — only the heading text goes.
  titledExternally?: boolean;
  // Hands the "?" to a caller that is already showing a popup. Without it this
  // component opens its own; with it, the caller swaps whatever it is showing.
  // That is the phone case, where stacking a second popup would dim twice.
  onShowScoring?: () => void;
}

// Row height so rows can be absolutely positioned and slide (transform) between
// ranks when the sort order changes. The actual pixel value lives in the
// `--lb-row-h` custom property (src/index.css, scaled by `--ui-unit`) — the
// height/transform below read it via `calc()` so `rank` and `ids.length` stay
// the only JS-supplied numbers. The `42px` here is only the `var()` fallback,
// used if the stylesheet is ever missing; keep it equal to index.css's default.
const ROW_H = 'var(--lb-row-h, 42px)';

// The metric columns are a FIXED width, not `auto`. The header row and the player rows
// are two separate grids (rows have to be their own grid so they can be absolutely
// positioned for the rank animation above), and `auto` tracks are sized from each
// grid's own content — the header measured its long labels while the rows measured a
// single digit and collapsed to the minimum, so the numbers drifted right of their
// headers. A fixed width can't resolve differently between the two. Both grids below
// read the *same* `gridTemplateColumns` string, built from the same `--lb-metric-col`
// custom property, so they can never drift apart — do not give them separately
// computed values, and do not reintroduce `auto`/`minmax(x, auto)` here.
//
// The player-name column needs an explicit floor for the same reason: the rows are
// absolutely positioned (for the rank animation), so they contribute nothing to the
// card's intrinsic width — only the header row does. Without a min the column
// collapses to the width of the word "Player" and every name ellipsises.
//
// Both tracks (and the cell padding/font sizes below) come from CSS custom
// properties defined in src/index.css (`:root` for desktop/tablet, a
// `@media (max-width: 767px)` override for phone) so the breakpoint stays in CSS
// and this component doesn't need to know the viewport width. The literal values
// here are only the `var()` fallbacks, used if the stylesheet is ever missing —
// keep them equal to index.css's `:root` defaults.

const cell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 'var(--lb-value-font, 16px)',
  fontWeight: 600,
  color: theme.text,
  padding: '0 var(--lb-cell-pad, 10px)',
};

// One line per column, all five names on the same row. The scoring deltas used to
// sit on a second line under three of the five, which left the header ragged: the
// two columns with no delta ("Player", "Score") had to bottom-align into the delta
// row, so whichever way they were aligned, one of them read as belonging to the
// wrong row. The deltas now live behind the "?" beside the title, where they cost
// a tap and stop distorting the header. See ScoringNote above.
const headCell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '0 var(--lb-cell-pad, 10px) 6px',
  color: theme.textMuted,
  fontWeight: 500,
  fontSize: 'var(--lb-head-font, 12px)',
  lineHeight: 1.25,
  textTransform: 'uppercase',
  letterSpacing: 'var(--lb-head-tracking, 0.4px)',
};

function HeadCell({ label }: { label: string }) {
  return <div style={headCell}>{label}</div>;
}

export function Leaderboard({ state, displayName, titledExternally, onShowScoring }: LeaderboardProps) {
  const [showScoring, setShowScoring] = useState(false);
  const showScore = state.mode === 'deathmatch';
  const ids = state.turnOrder;
  const metricCount = 3 + (showScore ? 1 : 0);
  // The trailing track holds the +5 / -3. Reserved permanently rather than added
  // when a score changes, so nothing shifts when one arrives. It collapses to 0
  // at the phone breakpoint, where the modal has no width to spare — see
  // --lb-delta-col in src/index.css.
  const gridTemplateColumns =
    `minmax(var(--lb-name-col, 140px),1fr) repeat(${metricCount}, var(--lb-metric-col, 68px))` +
    (showScore ? ' var(--lb-delta-col, 30px)' : '');

  // Rank order, recomputed every render: active players first (removed/eliminated sink
  // to the bottom), then by score descending in deathmatch, with turn order as a stable
  // tie-break. Each player's row is drawn at its rank * ROW_H and CSS-transitions there,
  // so score changes and a player leaving animate as smooth position swaps.
  const ranked = [...ids].sort((a, b) => {
    const pa = state.players[a];
    const pb = state.players[b];
    const ea = pa.eliminated ? 1 : 0;
    const eb = pb.eliminated ? 1 : 0;
    if (ea !== eb) return ea - eb;
    if (showScore && pb.score !== pa.score) return pb.score - pa.score;
    return ids.indexOf(a) - ids.indexOf(b);
  });
  const rankOf = new Map<PlayerId, number>(ranked.map((id, i) => [id, i]));

  const { displayed, deltas } = useScoreCounts(useScoreMap(state));

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        boxShadow: theme.shadow,
        padding: 16,
        minWidth: 240,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!titledExternally && <h3 style={{ fontSize: 15, margin: 0 }}>Leaderboard</h3>}
          <button
            onClick={() => (onShowScoring ? onShowScoring() : setShowScoring(true))}
            aria-haspopup="dialog"
            aria-label="How scoring works"
            style={{
              // 24px is the WCAG 2.2 pointer-target floor, and this control has
              // clear space around it so the floor is the right size to hit.
              width: 24,
              height: 24,
              padding: 0,
              borderRadius: '50%',
              background: showScoring ? theme.accentSoft : 'transparent',
              border: `1px solid ${theme.border}`,
              color: showScoring ? theme.accentText : theme.textMuted,
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ?
          </button>
        </div>
        {showScore && (
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.accentText }}>
            Target: {state.targetScore}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns }}>
        <div style={{ ...headCell, justifyContent: 'flex-start' }}>Player</div>
        <HeadCell label="Kills" />
        <HeadCell label="Deaths" />
        <HeadCell label="Streak" />
        {showScore && <HeadCell label="Score" />}
        {/* Empty header over the delta track, so the header and the rows keep the
            same column count and stay aligned. */}
        {showScore && <div style={headCell} />}
      </div>

      {/* Positioned rows: each keyed by player id (so React keeps the DOM node) and
          translated to its current rank, with a transition for animated re-ranking. */}
      <div style={{ position: 'relative', height: `calc(${ROW_H} * ${ids.length})` }}>
        {ids.map((id) => {
          const p = state.players[id];
          const rank = rankOf.get(id) ?? 0;
          const delta = showScore ? deltas.get(id) : undefined;
          return (
            <div
              key={id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: ROW_H,
                display: 'grid',
                gridTemplateColumns,
                alignItems: 'center',
                borderTop: `1px solid ${theme.border}`,
                boxSizing: 'border-box',
                transform: `translateY(calc(${ROW_H} * ${rank}))`,
                transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease',
                opacity: p.eliminated ? 0.4 : 1,
              }}
            >
              {/* The row fills with the player's gain or loss colour for as long as
                  the number beside it is up. This is the part that carries across
                  the screen: a player watching the board still registers that the
                  standings moved. The row is already positioned for rank
                  animation, so this sits inside it without a wrapper. */}
              {delta && (
                <span
                  key={`wash-${delta.id}`}
                  aria-hidden="true"
                  className="lb-row-wash"
                  style={{
                    '--wash': delta.amount >= 0 ? GAIN_WASH : LOSS_WASH,
                    '--score-delta-ms': `${DELTA_MS}ms`,
                  } as React.CSSProperties}
                />
              )}
              <div style={{ ...cell, justifyContent: 'flex-start', gap: 8, minWidth: 0 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName ? displayName(p.id) : p.color.toUpperCase()}
                </span>
              </div>
              <div style={cell}>{p.kills}</div>
              <div style={cell}>{p.deaths}</div>
              <div style={cell}>{Math.max(p.longestStreak, p.currentStreak)}</div>
              {showScore && <div style={cell}>{displayed.get(id) ?? p.score}</div>}
              {showScore && (
                // The delta's own track. `overflow: hidden` is what makes the
                // phone breakpoint's 0-width track safe: the number is clipped
                // there rather than escaping the card the way it used to.
                <div style={{ ...cell, justifyContent: 'flex-start', overflow: 'hidden', paddingLeft: 4 }}>
                  {delta && (
                    <span
                      // Keyed by the delta's id so a second kill restarts the
                      // animation instead of leaving the first one to finish.
                      key={delta.id}
                      aria-hidden="true"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        color: delta.amount >= 0 ? GAIN : LOSS,
                        animation: `scoreDeltaRise ${DELTA_MS}ms var(--ease-exit) forwards`,
                      }}
                    >
                      {delta.amount >= 0 ? `+${delta.amount}` : delta.amount}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stays at the foot rather than moving into the "?" popup: "Streak" is the
          one column whose name does not say what it counts, so it has to be
          readable without opening anything. The scoring amounts are behind the
          "?" because they are read once and then known. */}
      <div style={{ marginTop: 8, fontSize: 11, color: theme.textMuted }}>
        Streak = most consecutive turns alive
      </div>

      {showScoring && (
        <Modal title="How scoring works" onClose={() => setShowScoring(false)}>
          <ScoringNote />
        </Modal>
      )}
    </div>
  );
}
