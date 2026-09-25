// Betterplayer look and feel: "esports neon". Dark theme only.
// The ONE place for design tokens (colours, glows, radii, fonts). Every screen
// and component uses these; don't hard-code colours elsewhere.

// ---- Colours
export const palette = {
  background: '#07080F', // screen background
  chrome: '#0A0C16', // header and bottom bar
  card: '#0E1120', // cards
  cardBorder: 'rgba(255,255,255,0.06)', // 1px card border
  cyan: '#22D3EE', // primary
  onCyan: '#04121A', // text on a filled cyan button
  magenta: '#E040FB', // secondary
  magentaText: '#F0A6FF', // magenta text (readable on dark)
  reputation: '#E86BFF', // Home "Reputation" number
  amber: '#FFB020', // locked / waiting
  green: '#39FF88', // active / success
  danger: '#FF4D6D', // errors, disputes, full matches
  text: '#E6E9F2',
  textSecondary: '#A3ABBE',
  textMuted: '#8B93A7',
} as const;

// Names used across the app. Older names point at the neon palette so every
// screen follows the same tokens.
export const colors = {
  background: palette.background,
  chrome: palette.chrome,
  surface: palette.card, // cards
  border: palette.cardBorder, // thin card borders
  primary: palette.cyan, // primary actions
  onPrimary: palette.onCyan,
  accent: palette.cyan, // highlights, links
  secondary: palette.magenta,
  secondaryText: palette.magentaText,
  reputation: palette.reputation,
  success: palette.green, // active, success, winnings
  awaiting: palette.amber, // locked, waiting, "awaiting result"
  error: palette.danger,
  text: palette.text,
  textSecondary: palette.textSecondary,
  textMuted: palette.textMuted,
  field: '#0A0D18', // text box background (a touch darker than cards)
  fieldBorder: 'rgba(255,255,255,0.10)',
} as const;

// "#22D3EE" + 0.35 → "rgba(34,211,238,0.35)". Works with #RRGGBB colours.
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ---- Glow: a soft outer shadow in the element's own colour.
// `boxShadow` works on iOS, Android and web. Never on body text.
export const glow = {
  primaryButton: (c: string = palette.cyan) => `0 0 18px ${withAlpha(c, 0.55)}`,
  magentaButton: (c: string = palette.magenta) => `0 0 16px ${withAlpha(c, 0.45)}`,
  activeCard: (c: string) => `0 0 18px ${withAlpha(c, 0.18)}`,
  badge: (c: string) => `0 0 10px ${withAlpha(c, 0.25)}`,
};

// Highlighted numbers: text-shadow 0 0 12px at 60%.
export function textGlow(c: string) {
  return {
    textShadowColor: withAlpha(c, 0.6),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  };
}

// Kept for older imports: the primary button glow.
export const primaryGlow = glow.primaryButton();

// ---- Shapes
export const radius = {
  card: 16,
  cardSmall: 14,
  button: 14,
  buttonSmall: 12,
  pill: 999,
};

export const MIN_TOUCH = 44; // every button at least 44px tall

// ---- Fonts (keys loaded with useFonts in src/app/_layout.tsx)
// Exo 2 extra-bold italic for titles, big numbers and game names;
// Chakra Petch for everything else.
export const fonts = {
  heading: 'Exo2_800ExtraBold_Italic',
  headingHeavy: 'Exo2_800ExtraBold_Italic',
  body: 'ChakraPetch_400Regular',
  bodyMedium: 'ChakraPetch_500Medium',
  bodySemiBold: 'ChakraPetch_600SemiBold',
  bodyBold: 'ChakraPetch_700Bold',
} as const;
