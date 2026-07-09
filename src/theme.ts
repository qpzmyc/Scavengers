// Central visual theme (dark). Player token colors are intentionally NOT themed
// here — they stay as each player's own color.
export const theme = {
  appBg: '#0e1117',
  surface: '#1a1f29',
  surfaceAlt: '#232a36',
  border: '#2c3441',
  text: '#c8d1de',
  textMuted: '#8591a2',
  heading: '#f0f4fa',
  accent: '#5b8cff',
  accentSoft: 'rgba(91, 140, 255, 0.16)',
  accentText: '#9db8ff',

  boardBg: '#0a0d12',
  tile: '#1e2430',
  tileBorder: '#434e5f', // gridlines — kept clearly lighter than the tile fill
  wall: '#050709',
  energy: '#f2c94c',
  ammo: '#e8834a',

  candidate: 'rgba(91, 140, 255, 0.32)',
  candidateBorder: 'rgba(91, 140, 255, 0.665)',
  selected: 'rgba(46, 204, 113, 0.5)',
  selectedBorder: 'rgba(46, 204, 113, 0.7)',

  radius: 10,
  shadow: '0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.35)',
} as const;

// Soft translucent tints used to shade each player's corner spawn zone.
export const SPAWN_TINT: Record<string, string> = {
  green: 'rgba(46, 204, 113, 0.22)',
  red: 'rgba(231, 76, 60, 0.22)',
  blue: 'rgba(52, 152, 219, 0.42)',
  yellow: 'rgba(241, 196, 15, 0.24)',
};
